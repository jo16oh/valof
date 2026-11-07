// Type-inference cost, measured against the published declarations the way a consumer sees them.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

import { floor, tsc, version, type Tsc } from "../../shared/typescript-lines.ts";

const here = new URL("./", import.meta.url);

const fixtures = ["core", "trait", "enum"] as const;
type Fixture = (typeof fixtures)[number];

/**
 * Instantiations over the baseline, which is the same lib with none of the library.
 *
 * Round, and well clear of the measurement. **This is an alarm for a blow-up, not a ratchet for
 * creep.** A recursive conditional running away or a union distributing where it should not
 * multiplies the count; growth from writing more types adds a few percent. A budget tight enough
 * to catch the second has to be re-baselined on every change, and stops meaning anything. Read the
 * printed number when you want to watch the drift.
 *
 * Instantiations alone. `Types` is printed and tracks it closely, at 3.2 instantiations each
 * across every measurement so far, and what this library risks is a recursive conditional running
 * away, which is what instantiations count. Two budgets to re-baseline for one signal is one
 * too many.
 *
 * The fixtures are not comparable to each other. Each carries its own history. `enum` sits high
 * because `EnumCompanion`, `VariantFrame` and `VariantOf` are generic aliases over intersections:
 * relating two references to one measures the alias's variance, which instantiates it with marker
 * types. That is a constant the checker pays once per program, not growth with the number of
 * variants, which runs at about 1,100 instantiations each. The aliases that could carry `in out`
 * do, which is what keeps the constant where it is; an intersection cannot (TS2637), and their
 * names are worth more than the measurement (notes §15.2).
 *
 * `trait` went from 15,000 to 17,000 when `implTrait` grew the callback form: an implementation
 * is now `Implement<…> | ((self) => Implement<…>)`, and the union is related twice at every call
 * the fixture makes. An alarm, not a ratchet.
 *
 * It went from 22,000 to 25,000 when a field could hold `null` or a primitive beside another kind.
 * Every node of `DeepReadonly` checks for such a field, and every payload for a field no value fits.
 *
 * Each fixture has a step whose function takes what the step passes, as `impl(({ seal }) => …)`. A
 * function that takes nothing skips the cost `NoInfer` removes (`Supplied` in `src/val.ts`). With
 * the wrapper removed, `core` and `trait` exceed their budgets. `enum` stays within its own, so the
 * comments at its steps are the only record.
 */
const budget: Record<Fixture, number> = { core: 10_000, trait: 25_000, enum: 90_000 };

/**
 * The published declarations, in bytes. Deterministic like the counts above, and budgeted the
 * same way: an alarm, not a ratchet.
 *
 * The entry plus every file it imports, which is what a consumer downloads for `import "valof"`.
 *
 * Here rather than in the size check because it is a type cost. It never reaches a user's bundle;
 * what it costs is the download and every parse of it, and a run away shows as a type graph the
 * declarations drag in whole. `Finding` derived from `RULES` took `lint`'s declarations to
 * 14.9 kB that way, which is the size of the accident this catches. Creep is a few hundred bytes
 * a feature: read the printed number for that.
 *
 * `tsc` indents with four spaces where tsdown wrote a tab, which took the same types from 64.1 to
 * 64.7 kB.
 *
 * The budget went from 96 to 104 kB for the checks on a broken declaration: their messages, and
 * the constraints that report them where the type is declared.
 */
const declarationsBudget = 104 * 1024;

type Counts = Val<
  "Counts",
  { types: number; instantiations: number; check: number; total: number }
>;
const Counts = Val.companion<Counts>().build();

async function measure(tsc: Tsc, name: string): Promise<Counts> {
  const config = new URL(`.tsconfig.${name}.json`, here);
  const base = JSON.parse(await readFile(new URL("tsconfig.base.json", here), "utf8")) as object;
  await writeFile(config, JSON.stringify({ ...base, include: [`fixtures/${name}.ts`] }));
  try {
    // A fixture that stopped compiling measures nothing, so the error is the result.
    const { stdout } = await tsc([
      "--noEmit",
      "--extendedDiagnostics",
      "--project",
      fileURLToPath(config),
    ]).catch((error: { stdout?: string }) => {
      throw new FixtureError({ fixture: name, output: error.stdout ?? "" });
    });
    const read = (label: string): number =>
      Number(stdout.match(new RegExp(`^${label}\\s+([\\d.]+)`, "m"))?.[1] ?? Number.NaN);
    return Counts.seal({
      types: read("Types:"),
      instantiations: read("Instantiations:"),
      check: read("Check time:"),
      total: read("Total time:"),
    });
  } finally {
    await rm(config, { force: true });
  }
}

/**
 * The entry's declarations plus every file they reach. `tsc` emits one per module, so the entry
 * file alone is a few re-exports.
 */
async function declarationBytes(entry: URL): Promise<number> {
  const seen = new Set<string>();
  let bytes = 0;
  const walk = async (url: URL): Promise<void> => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const text = await readFile(url, "utf8");
    bytes += Buffer.byteLength(text, "utf8");
    // `tsc` keeps the source specifier; its declarations sit beside it.
    for (const [, module] of text.matchAll(/from\s+"(\.[^"]+)\.ts"/g)) {
      await walk(new URL(`${module}.d.ts`, url));
    }
  };
  await walk(entry);
  return bytes;
}

const num = (value: number): string => value.toLocaleString("en-US");
const bytes = (value: number): string =>
  value < 1024 ? `${value} B` : `${(value / 1024).toFixed(2)} kB`;
const secs = (value: number): string => value.toFixed(3);

/** Right-aligned columns under a header, so the units are named once. */
function table(heads: string[], rows: string[][]): string {
  const widths = heads.map((head, index) =>
    Math.max(head.length, ...rows.map((row) => row[index]!.length)),
  );
  const line = (cells: string[]): string =>
    `  ${cells.map((cell, index) => (index === 0 ? cell.padEnd(widths[0]!) : cell.padStart(widths[index]!))).join("  ")}`.trimEnd();
  return [line(heads), ...rows.map(line)].join("\n");
}

export class FixtureError extends ErrorFactory({
  message: ({ fixture, output }) => `the ${fixture} fixture does not compile\n${output}`,
  fields: ErrorFactory.fields<{ fixture: string; output: string }>(),
}) {}

export class OverBudgetError extends ErrorFactory({
  message: ({ over }) => `over budget: ${over.join(", ")}`,
  fields: ErrorFactory.fields<{ over: string[] }>(),
}) {}

/** Measures the fixtures and the declarations against their budgets. Expects `dist` to be built. */
export async function checkTypes(): R.ResultAsync<void, FixtureError | OverBudgetError> {
  try {
    const declarations = await declarationBytes(new URL("../../../dist/index.d.ts", here));

    /**
     * The floor alone. Every line above it says the same thing: across 5.9, 6.0 and 7.0 the
     * fixtures differed by 5 instantiations in 1,677, the checkers' own noise. `vp run check-dist
     * --compat` still typechecks every line.
     */
    const compile = tsc(floor);
    const baseline = await measure(compile, "baseline");
    const counts = Object.fromEntries(
      await Promise.all(fixtures.map(async (name) => [name, await measure(compile, name)])),
    ) as Record<Fixture, Counts>;

    // Reported over the baseline, which is a constant each checker materialises at startup: 86
    // types on 5.9, 341 on tsgo, whatever the lib. Subtracting it leaves what the library costs.
    const measured = Object.fromEntries(
      fixtures.map((name) => [
        name,
        Counts.patch(counts[name], {
          types: counts[name].types - baseline.types,
          instantiations: counts[name].instantiations - baseline.instantiations,
        }),
      ]),
    ) as Record<Fixture, Counts>;

    {
      console.log(
        `typescript@${version(floor)}, over a baseline of ${num(baseline.types)} types\n`,
      );
      console.log(
        table(
          ["", "instantiations", "types", "check (s)", "total (s)"],
          fixtures.map((name) => [
            name,
            num(measured[name].instantiations),
            num(measured[name].types),
            secs(measured[name].check),
            secs(measured[name].total),
          ]),
        ),
      );
    }

    const checks = [
      ...fixtures.map((name) => [name, measured[name].instantiations, budget[name], num] as const),
      ["index.d.ts", declarations, declarationsBudget, bytes] as const,
    ];

    {
      const left = ([, size, max, fmt]: (typeof checks)[number]): string =>
        size > max
          ? `${fmt(size - max)} over`
          : `${fmt(max - size)} left (${Math.round((1 - size / max) * 100)}%)`;
      console.log("\nbudget  (the fixtures are instantiations)");
      console.log(
        table(
          ["", "used / budget", ""],
          checks.map((check) => [
            check[0],
            `${check[3](check[1])} / ${check[3](check[2])}`,
            left(check),
          ]),
        ),
      );
    }

    {
      // A reader meets this table years after the last person who chose what to put in it.
      console.log(
        "\ninstantiations: type arguments applied, where a conditional running away shows.",
      );
      console.log("types: distinct types the checker made. printed only, and it tracks the first.");
      console.log("index.d.ts: the published declarations, in bytes. what every consumer parses.");
    }

    const over = checks.filter(([, size, max]) => size > max).map(([name]) => name);
    return over.length === 0 ? R.succeed() : R.fail(new OverBudgetError({ over }));
  } catch (error) {
    if (error instanceof FixtureError) return R.fail(error);
    throw error;
  }
}
