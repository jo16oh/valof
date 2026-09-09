// Type-inference cost, measured against the published declarations the way a consumer sees
// them. `Instantiations` and `Types` are deterministic for a given compiler, so they carry the
// budget; the times are printed and never checked.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = new URL("./", import.meta.url);
const root = new URL("../../", import.meta.url);

const fixtures = ["core", "trait"] as const;
type Fixture = (typeof fixtures)[number];

/**
 * Over the baseline, which is the same lib with none of the library. Set about 20% above the
 * measurement, so a rewrite of one conditional does not have to move them and a runaway
 * recursion still trips.
 *
 * The fixtures are not comparable to each other. Each carries its own history.
 */
const budget: Record<Fixture, { instantiations: number; types: number }> = {
  core: { instantiations: 6900, types: 2000 },
  trait: { instantiations: 4900, types: 1700 },
};

type Counts = { types: number; instantiations: number; check: number; total: number };

const fields = [
  ["types", "Types:"],
  ["instantiations", "Instantiations:"],
  ["check", "Check time:"],
  ["total", "Total time:"],
] as const;

async function run(name: string): Promise<Counts> {
  const config = new URL(`.tsconfig.${name}.json`, here);
  const base = JSON.parse(await readFile(new URL("tsconfig.base.json", here), "utf8")) as object;
  await writeFile(config, JSON.stringify({ ...base, include: [`${name}.ts`] }));
  try {
    // A fixture that stopped compiling measures nothing, so the error is the result.
    const { stdout } = await promisify(execFile)(
      fileURLToPath(new URL("node_modules/.bin/tsc", root)),
      ["--noEmit", "--extendedDiagnostics", "--project", fileURLToPath(config)],
    ).catch((error: { stdout?: string }) => {
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

await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
  cwd: fileURLToPath(root),
}).catch((error: { stdout?: string; stderr?: string }) => {
  console.error(error.stdout ?? "");
  console.error(error.stderr ?? "");
  process.exit(1);
});

const baseline = await run("baseline");
const measured = Object.fromEntries(
  await Promise.all(fixtures.map(async (name) => [name, await run(name)])),
) as Record<Fixture, Counts>;

const num = (value: number): string => value.toLocaleString("en-US");
const secs = (value: number): string => `${value.toFixed(3)}s`;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ baseline, ...measured }, null, 2));
} else {
  console.log(
    `baseline  ${num(baseline.instantiations)} instantiations, ${num(baseline.types)} types, ${secs(baseline.check)} check`,
  );
  console.log();
  for (const name of fixtures) {
    const it = measured[name];
    console.log(
      `${name.padEnd(6)}  ${num(it.instantiations - baseline.instantiations).padStart(9)} instantiations  ${num(it.types - baseline.types).padStart(7)} types  ${secs(it.check)} check  ${secs(it.total)} total`,
    );
  }
}

const over = fixtures.flatMap((name) =>
  (["instantiations", "types"] as const)
    .filter((key) => measured[name][key] - baseline[key] > budget[name][key])
    .map(
      (key) =>
        `${name} ${key}: ${num(measured[name][key] - baseline[key])} over ${num(budget[name][key])}`,
    ),
);

if (over.length > 0) {
  console.error(`\n${over.join("\n")}`);
  process.exit(1);
}
