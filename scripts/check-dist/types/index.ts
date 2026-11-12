// Type-inference cost, measured against the published declarations the way a consumer sees them.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Enum, Val, type VariantsOf } from "#valof";

import { align, Budget, count, OverBudgetError } from "../report.ts";
import { Check } from "../run.ts";

import { output, repository, writeJson } from "../../shared/repository.ts";
import { floor, tsc, version, type Tsc } from "../../shared/typescript-lines.ts";

const here = new URL("./", import.meta.url);

type Fixture = Enum<
  "Fixture",
  { core: Record<never, never>; trait: Record<never, never>; enum: Record<never, never> }
>;
const Fixture = Enum.companion<Fixture>().build();
const fixtures = [Fixture.core.create({}), Fixture.trait.create({}), Fixture.enum.create({})].map(
  ({ _tag }) => _tag,
);

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
const budget: Record<keyof VariantsOf<Fixture>, number> = {
  core: 10_000,
  trait: 25_000,
  enum: 90_000,
};

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
 * the constraints that report them where the type is declared. It went to 108 kB for the checks
 * that reject a union of two types `equals` cannot tell apart.
 */
const declarationsBudget = 108 * 1024;

/**
 * The plugin's declarations, which a config file in TypeScript loads. Its export is annotated by
 * hand: inferred, it carries ESLint's types, which took it to 93.7 kB.
 */
const pluginBudget = 2 * 1024;

export type Counts = Val<
  "Counts",
  { types: number; instantiations: number; check: number; total: number }
>;
export const Counts = Val.companion<Counts>()
  .implAssoc(({ seal }) => ({
    /** Reads the counts `tsc --extendedDiagnostics` prints. */
    fromDiagnostics: (stdout: string) => {
      const read = (label: string): number =>
        Number(stdout.match(new RegExp(`^${label}\\s+([\\d.]+)`, "m"))?.[1] ?? Number.NaN);
      return seal({
        types: read("Types:"),
        instantiations: read("Instantiations:"),
        check: read("Check time:"),
        total: read("Total time:"),
      });
    },
  }))
  .impl(({ patch }) => ({
    // Reported over the baseline, which is a constant each checker materialises at startup: 86
    // types on 5.9, 341 on tsgo, whatever the lib. Subtracting it leaves what the library costs.
    above: (counts, baseline: Counts) =>
      patch(counts, {
        types: counts.types - baseline.types,
        instantiations: counts.instantiations - baseline.instantiations,
      }),
  }))
  .build();

export class FixtureError extends ErrorFactory({
  message: ({ fixture, output }) => `the ${fixture} fixture does not compile\n${output}`,
  fields: ErrorFactory.fields<{ fixture: string; output: string }>(),
}) {}

export type TypesError = FixtureError | OverBudgetError;

/** Measures the fixtures and the declarations against their budgets. Expects `dist` to be built. */
export async function checkTypes(): R.ResultAsync<void, TypesError> {
  /**
   * The floor alone. Every line above it says the same thing: across 5.9, 6.0 and 7.0 the
   * fixtures differed by 5 instantiations in 1,677, the checkers' own noise. `vp run check-dist
   * --compat` still typechecks every line.
   */
  const compile = tsc(floor);
  const baseline = await measure(compile, "baseline");
  if (R.isFailure(baseline)) return baseline;

  const counted = await R.sequence(fixtures.map((name) => measure(compile, name)));
  if (R.isFailure(counted)) return counted;
  const measured = fixtures.map((name, index) => ({
    name,
    counts: Counts.above(counted.value[index]!, baseline.value),
  }));
  printCounts(baseline.value, measured);

  const budgets = [
    ...measured.map(({ name, counts }) =>
      Budget.seal({ name, used: counts.instantiations, limit: budget[name], unit: "count" }),
    ),
    Budget.seal({
      name: "index.d.ts",
      used: await declarationBytes(new URL("dist/index.d.ts", repository)),
      limit: declarationsBudget,
      unit: "bytes",
    }),
    Budget.seal({
      name: "eslint-plugin.d.mts",
      used: Buffer.byteLength(
        await readFile(new URL("dist/eslint-plugin/index.d.mts", repository), "utf8"),
        "utf8",
      ),
      limit: pluginBudget,
      unit: "bytes",
    }),
  ];
  printBudgets(budgets);
  printLegend();

  const over = budgets.filter(Budget.over);

  return over.length === 0 ? R.succeed() : R.fail(new OverBudgetError({ over }));
}

export type TypesCheck = Val<"TypesCheck", { name: string }, Check>;
export const TypesCheck = Val.companion<TypesCheck>()
  .implCreate(() => ({ name: "types" }))
  .implTrait(Check, () => ({ run: (_check) => checkTypes() }))
  .build();

async function measure(tsc: Tsc, name: string): R.ResultAsync<Counts, FixtureError> {
  const config = new URL(`.tsconfig.${name}.json`, here);
  const base = JSON.parse(await readFile(new URL("tsconfig.base.json", here), "utf8")) as object;
  await writeJson(config, { ...base, include: [`fixtures/${name}.ts`] });

  // A fixture that stopped compiling measures nothing, so the error is the result.
  const compiled = await R.try({
    try: () => tsc(["--noEmit", "--extendedDiagnostics", "--project", fileURLToPath(config)]),
    catch: (error) => new FixtureError({ fixture: name, output: output(error) }),
  });
  await rm(config, { force: true });
  if (R.isFailure(compiled)) return compiled;

  return R.succeed(Counts.fromDiagnostics(compiled.value.stdout));
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
    await Promise.all(
      [...text.matchAll(/from\s+"(\.[^"]+)\.ts"/g)].map(([, module]) =>
        walk(new URL(`${module}.d.ts`, url)),
      ),
    );
  };
  await walk(entry);
  return bytes;
}

function printCounts(baseline: Counts, measured: { name: string; counts: Counts }[]): void {
  console.log(`typescript@${version(floor)}, over a baseline of ${count(baseline.types)} types\n`);
  console.log(
    table(
      ["", "instantiations", "types", "check (s)", "total (s)"],
      measured.map(({ name, counts }) => [
        name,
        count(counts.instantiations),
        count(counts.types),
        seconds(counts.check),
        seconds(counts.total),
      ]),
    ),
  );
}

function printBudgets(budgets: readonly Budget[]): void {
  console.log("\nbudget  (the fixtures are instantiations)");
  console.log(
    table(
      ["", "used / budget", ""],
      budgets.map((budget) => [
        budget.name,
        `${Budget.amount(budget, budget.used)} / ${Budget.amount(budget, budget.limit)}`,
        Budget.left(budget),
      ]),
    ),
  );
}

// A reader meets this table years after the last person who chose what to put in it.
function printLegend(): void {
  console.log("\ninstantiations: type arguments applied, where a conditional running away shows.");
  console.log("types: distinct types the checker made. printed only, and it tracks the first.");
  console.log("index.d.ts: the published declarations, in bytes. what every consumer parses.");
  console.log("eslint-plugin.d.mts: the plugin's, in bytes. what a typed config file parses.");
}

function seconds(value: number): string {
  return value.toFixed(3);
}

/** Right-aligned columns under a header, so the units are named once. */
function table(heads: string[], rows: string[][]): string {
  return align(
    [heads, ...rows],
    heads.map((_, index) => (index === 0 ? "left" : "right")),
  )
    .map((cells) => `  ${cells.join("  ")}`.trimEnd())
    .join("\n");
}
