// Type-inference cost, measured against the published declarations the way a consumer sees them,
// on every TypeScript line `vp run ts-compatibility` supports.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { floor, forEachVersion, pack } from "../typescript-lines.ts";

const here = new URL("./", import.meta.url);

const fixtures = ["core", "trait"] as const;
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
 * The fixtures are not comparable to each other. Each carries its own history.
 */
const budget: Record<Fixture, number> = { core: 10_000, trait: 15_000 };

type Counts = { types: number; instantiations: number; check: number; total: number };

const fields = [
  ["types", "Types:"],
  ["instantiations", "Instantiations:"],
  ["check", "Check time:"],
  ["total", "Total time:"],
] as const;

type Tsc = (args: string[]) => Promise<{ stdout: string }>;

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
      console.error(error.stdout ?? "");
      process.exit(1);
    });
    const read = (label: string): number =>
      Number(stdout.match(new RegExp(`^${label}\\s+([\\d.]+)`, "m"))?.[1] ?? Number.NaN);
    return Object.fromEntries(fields.map(([key, label]) => [key, read(label)])) as Counts;
  } finally {
    await rm(config, { force: true });
  }
}

const num = (value: number): string => value.toLocaleString("en-US");
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

await pack();

let measured = {} as Record<Fixture, Counts>;
const json = process.argv.includes("--json");

/**
 * The floor alone, which is the only version pinned here. Every line above it is read from the
 * registry, so its counts move on TypeScript's release schedule rather than on this repo's
 * changes, and measuring them costs an install each. They also say the same thing: across 5.9,
 * 6.0 and 7.0 the fixtures differed by 5 instantiations in 1,677, the checkers' own noise.
 * `vp run ts-compatibility` still typechecks every line.
 */
await forEachVersion([floor], async (tsc, version) => {
  const baseline = await measure(tsc, "baseline");
  const counts = Object.fromEntries(
    await Promise.all(fixtures.map(async (name) => [name, await measure(tsc, name)])),
  ) as Record<Fixture, Counts>;

  // Reported over the baseline, which is a constant each checker materialises at startup: 86
  // types on 5.9, 341 on tsgo, whatever the lib. Subtracting it leaves what the library costs.
  measured = Object.fromEntries(
    fixtures.map((name) => [
      name,
      {
        types: counts[name].types - baseline.types,
        instantiations: counts[name].instantiations - baseline.instantiations,
        check: counts[name].check,
        total: counts[name].total,
      },
    ]),
  ) as Record<Fixture, Counts>;

  if (json) return;

  console.log(`typescript@${version}, over a baseline of ${num(baseline.types)} types\n`);
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
});

if (json) console.log(JSON.stringify(measured, null, 2));

const checks = fixtures.map((name) => [name, measured[name].instantiations, budget[name]] as const);

if (!json) {
  const left = ([, size, max]: (typeof checks)[number]): string =>
    size > max
      ? `${num(size - max)} over`
      : `${num(max - size)} left (${Math.round((1 - size / max) * 100)}%)`;
  console.log("\nbudget");
  console.log(
    table(
      ["instantiations", "used / budget", ""],
      checks.map((check) => [check[0], `${num(check[1])} / ${num(check[2])}`, left(check)]),
    ),
  );
}

if (!json) {
  // A reader meets this table years after the last person who chose what to put in it.
  console.log("\ninstantiations: type arguments applied, where a conditional running away shows.");
  console.log("types: distinct types the checker made. printed only, and it tracks the first.");
}

if (checks.some(([, size, max]) => size > max)) process.exit(1);
