// Type-inference cost, measured against the published declarations the way a consumer sees them,
// on every TypeScript line `vp run ts-compatibility` supports.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { floor, forEachVersion, pack, run, supported } from "../typescript-lines.ts";

const here = new URL("./", import.meta.url);

const fixtures = ["core", "trait"] as const;
type Fixture = (typeof fixtures)[number];

/**
 * Over the baseline, which is the same lib with none of the library. Set about 20% above the
 * measurement, so a rewrite of one conditional does not have to move them and a runaway
 * recursion still trips.
 *
 * **Checked on the floor alone**, the one version pinned here. Every line above it is read from
 * the registry, so its counts move on TypeScript's release schedule and not on this repo's
 * changes. Those are printed to be read, not to gate a merge.
 *
 * The fixtures are not comparable to each other. Each carries its own history.
 */
const budget: Record<Fixture, { instantiations: number; types: number }> = {
  core: { instantiations: 6900, types: 2000 },
  trait: { instantiations: 6500, types: 2100 },
};

type Counts = { types: number; instantiations: number; check: number; total: number };

const fields = [
  ["types", "Types:"],
  ["instantiations", "Instantiations:"],
  ["check", "Check time:"],
  ["total", "Total time:"],
] as const;

async function measure(tsc: string, name: string): Promise<Counts> {
  const config = new URL(`.tsconfig.${name}.json`, here);
  const base = JSON.parse(await readFile(new URL("tsconfig.base.json", here), "utf8")) as object;
  await writeFile(config, JSON.stringify({ ...base, include: [`${name}.ts`] }));
  try {
    // A fixture that stopped compiling measures nothing, so the error is the result.
    const { stdout } = await run(tsc, [
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
const secs = (value: number): string => `${value.toFixed(3)}s`;

await pack();

const measured: Record<string, Record<Fixture, Counts>> = {};
const json = process.argv.includes("--json");

await forEachVersion(await supported(), async (tsc, version) => {
  const baseline = await measure(tsc, "baseline");
  const counts = Object.fromEntries(
    await Promise.all(fixtures.map(async (name) => [name, await measure(tsc, name)])),
  ) as Record<Fixture, Counts>;

  // Reported over the baseline so a change in `lib.es2023.d.ts` between lines does not read as
  // a change in the library.
  measured[version] = Object.fromEntries(
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

  console.log(
    `typescript@${version}  baseline ${num(baseline.instantiations)} instantiations, ${num(baseline.types)} types`,
  );
  for (const name of fixtures) {
    const it = measured[version][name];
    console.log(
      `  ${name.padEnd(6)}  ${num(it.instantiations).padStart(9)} instantiations  ${num(it.types).padStart(7)} types  ${secs(it.check)} check  ${secs(it.total)} total`,
    );
  }
  console.log();
});

if (json) console.log(JSON.stringify(measured, null, 2));

const over = fixtures.flatMap((name) =>
  (["instantiations", "types"] as const)
    .filter((key) => measured[floor]![name][key] > budget[name][key])
    .map(
      (key) =>
        `${name} ${key} on typescript@${floor}: ${num(measured[floor]![name][key])} over ${num(budget[name][key])}`,
    ),
);

if (over.length > 0) {
  console.error(over.join("\n"));
  process.exit(1);
}
