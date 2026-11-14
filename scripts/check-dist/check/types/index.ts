// Type-inference cost, measured against the published declarations the way a consumer sees them.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { Val, type Dyn } from "#valof";

import { output, REPOSITORY, writeJson } from "../../../shared/repository.ts";
import { tsc, version, type Tsc } from "../../../shared/typescript-lines.ts";
import { Budget } from "../budget.ts";
import { Check } from "../check.ts";
import { align, count, problemLines, Report } from "../report.ts";

const HERE = new URL("./", import.meta.url);

export class FixtureError extends ErrorFactory({
  name: "FixtureError",
  message: ({ fixture, output }) => `the ${fixture} fixture does not compile\n${output}`,
  fields: ErrorFactory.fields<{ fixture: string; output: string }>(),
}) {}

export type TypesError = FixtureError;

/** The types check's budgets: instantiations for each fixture, bytes for the declarations. */
export type TypesBudgets = Val<
  "TypesBudgets",
  { fixtures: TypesFixture[]; declarations: TypesDeclaration[] }
>;
export const TypesBudgets = Val.companion<TypesBudgets>().build();

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

/** A fixture in `fixtures/<name>.ts`, and its budget in instantiations over the baseline. */
export type TypesFixture = Val<"TypesFixture", { name: string; budget: number }>;
export const TypesFixture = Val.companion<TypesFixture>()
  .impl(() => ({
    budget: ({ name, budget }, counts: Counts): Budget =>
      Budget.seal({ name, used: counts.instantiations, limit: budget, unit: "count" }),
  }))
  .build();

/**
 * A declaration file, and its budget in bytes. The bytes add up every file it imports, which is what
 * a consumer downloads.
 */
export type TypesDeclaration = Val<
  "TypesDeclaration",
  {
    /** What the budget table calls it. */
    name: string;
    /** From the repository root. */
    path: string;
    /** Printed under the tables, after the name. */
    description: string;
    budget: number;
  }
>;
export const TypesDeclaration = Val.companion<TypesDeclaration>()
  .impl(() => ({
    /** Reads the file, and every file it imports, under `root`. */
    measure: async ({ name, path, budget }, root: URL): Promise<Budget> =>
      Budget.seal({
        name,
        used: await declarationBytes(new URL(path, root)),
        limit: budget,
        unit: "bytes",
      }),
  }))
  .build();

/** What the types check measured, against the budgets. */
export type TypesReport = Val<
  "TypesReport",
  {
    /** The version the counts come from. */
    typescript: string;
    baseline: Counts;
    fixtures: FixtureCounts[];
    declarations: TypesDeclaration[];
    budgets: Budget[];
  },
  Report
>;
export const TypesReport = Val.companion<TypesReport>()
  .implTrait(Report, () => ({
    /** The counts, then the budgets, then what each column means. */
    render: (report): string => {
      const { typescript, baseline, fixtures, declarations, budgets } = report;
      return [
        `typescript@${typescript}, over a baseline of ${count(baseline.types)} types`,
        "",
        table(
          ["", "instantiations", "types", "check (s)", "total (s)"],
          fixtures.map(({ fixture, counts }) => [
            fixture.name,
            count(counts.instantiations),
            count(counts.types),
            seconds(counts.check),
            seconds(counts.total),
          ]),
        ),
        "",
        "budget  (the fixtures are instantiations)",
        table(
          ["", "used / budget", ""],
          budgets.map((budget) => [
            budget.name,
            `${Budget.amount(budget, budget.used)} / ${Budget.amount(budget, budget.limit)}`,
            Budget.left(budget),
          ]),
        ),
        "",
        // A reader meets this table years after the last person who chose what to put in it.
        "instantiations: type arguments applied, where a conditional running away shows.",
        "types: distinct types the checker made. printed only, and it tracks the first.",
        ...declarations.map(({ name, description }) => `${name}: ${description}`),
        ...problemLines(TypesReport.problems(report)),
      ].join("\n");
    },
    passed: (report): boolean => TypesReport.problems(report).length === 0,
  }))
  .impl(() => ({
    /** Each budget over its limit. */
    problems: ({ budgets }): string[] => budgets.filter(Budget.over).map(Budget.overLine),
  }))
  .build();

export type TypesCheck = Val<
  "TypesCheck",
  {
    name: string;
    budgets: TypesBudgets;
    /** The TypeScript line the counts come from, by its alias in `node_modules`. */
    line: string;
  },
  Check
>;
export const TypesCheck = Val.companion<TypesCheck>()
  .implCreate(({ budgets, line }: { budgets: TypesBudgets; line: string }) => ({
    name: "types",
    budgets,
    line,
  }))
  .implTrait(Check, () => ({
    /**
     * Measures the fixtures and the declarations against their budgets. Expects `dist` to be
     * built.
     */
    run: async ({ budgets, line }): R.ResultAsync<Dyn<Report>, TypesError> => {
      const compile = tsc(line);
      const baseline = await measure(compile, "baseline");
      if (R.isFailure(baseline)) return baseline;

      const counted = await R.sequence(budgets.fixtures.map(({ name }) => measure(compile, name)));
      if (R.isFailure(counted)) return counted;
      const measured = budgets.fixtures.map((fixture, index) =>
        FixtureCounts.seal({
          fixture,
          counts: Counts.above(counted.value[index]!, baseline.value),
        }),
      );

      const checked = [
        ...measured.map(({ fixture, counts }) => TypesFixture.budget(fixture, counts)),
        ...(await Promise.all(
          budgets.declarations.map((declaration) =>
            TypesDeclaration.measure(declaration, REPOSITORY),
          ),
        )),
      ];
      return R.succeed(
        Report.dyn(
          TypesReport,
          TypesReport.seal({
            typescript: version(line),
            baseline: baseline.value,
            fixtures: measured,
            declarations: budgets.declarations,
            budgets: checked,
          }),
        ),
      );
    },
  }))
  .build();

/** A fixture's counts over the baseline. */
type FixtureCounts = Val<"FixtureCounts", { fixture: TypesFixture; counts: Counts }>;
const FixtureCounts = Val.companion<FixtureCounts>().build();

async function measure(tsc: Tsc, name: string): R.ResultAsync<Counts, FixtureError> {
  const config = new URL(`.tsconfig.${name}.json`, HERE);
  const base = JSON.parse(await readFile(new URL("tsconfig.base.json", HERE), "utf8")) as object;
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
