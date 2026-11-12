// Type-inference cost, measured against the published declarations the way a consumer sees them.
//
// `Instantiations` and `Types` are deterministic for a given compiler, so they carry the budget;
// the times are printed and never checked.
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Enum, Val, type Dyn, type VariantsOf } from "#valof";

import { Budget, OverBudgetError } from "../budget.ts";
import { align, count } from "../format.ts";
import { Report } from "../report.ts";
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

/** The types check's budgets: instantiations for each fixture, bytes for the declarations. */
export type TypesBudgets = Val<
  "TypesBudgets",
  { core: number; trait: number; enum: number; declarations: number; plugin: number }
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

/** A fixture's counts over the baseline. */
type FixtureCounts = Val<"FixtureCounts", { name: keyof VariantsOf<Fixture>; counts: Counts }>;
const FixtureCounts = Val.companion<FixtureCounts>()
  .impl(() => ({
    budget: ({ name, counts }, budgets: TypesBudgets): Budget =>
      Budget.seal({ name, used: counts.instantiations, limit: budgets[name], unit: "count" }),
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
    budgets: Budget[];
  },
  Report
>;
export const TypesReport = Val.companion<TypesReport>()
  .implTrait(Report, () => ({
    /** The counts, then the budgets, then what each column means. */
    render: ({ typescript, baseline, fixtures, budgets }): string =>
      [
        `typescript@${typescript}, over a baseline of ${count(baseline.types)} types`,
        "",
        table(
          ["", "instantiations", "types", "check (s)", "total (s)"],
          fixtures.map(({ name, counts }) => [
            name,
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
        "index.d.ts: the published declarations, in bytes. what every consumer parses.",
        "eslint-plugin.d.mts: the plugin's, in bytes. what a typed config file parses.",
      ].join("\n"),
    verdict: ({ budgets }): R.Result<void, TypesError> => {
      const over = budgets.filter(Budget.over);
      return over.length === 0 ? R.succeed() : R.fail(new OverBudgetError({ over }));
    },
  }))
  .build();

export class FixtureError extends ErrorFactory({
  name: "FixtureError",
  message: ({ fixture, output }) => `the ${fixture} fixture does not compile\n${output}`,
  fields: ErrorFactory.fields<{ fixture: string; output: string }>(),
}) {}

export type TypesError = FixtureError | OverBudgetError;

export type TypesCheck = Val<"TypesCheck", { name: string; budgets: TypesBudgets }, Check>;
export const TypesCheck = Val.companion<TypesCheck>()
  .implCreate(({ budgets }: { budgets: TypesBudgets }) => ({ name: "types", budgets }))
  .implTrait(Check, () => ({
    /**
     * Measures the fixtures and the declarations against their budgets. Expects `dist` to be
     * built.
     */
    run: async ({ budgets: limits }): R.ResultAsync<Dyn<Report>, TypesError> => {
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
      const measured = fixtures.map((name, index) =>
        FixtureCounts.seal({ name, counts: Counts.above(counted.value[index]!, baseline.value) }),
      );

      const budgets = [
        ...measured.map((fixture) => FixtureCounts.budget(fixture, limits)),
        Budget.seal({
          name: "index.d.ts",
          used: await declarationBytes(new URL("dist/index.d.ts", repository)),
          limit: limits.declarations,
          unit: "bytes",
        }),
        Budget.seal({
          name: "eslint-plugin.d.mts",
          used: Buffer.byteLength(
            await readFile(new URL("dist/eslint-plugin/index.d.mts", repository), "utf8"),
            "utf8",
          ),
          limit: limits.plugin,
          unit: "bytes",
        }),
      ];
      return R.succeed(
        Report.dyn(
          TypesReport,
          TypesReport.seal({
            typescript: version(floor),
            baseline: baseline.value,
            fixtures: measured,
            budgets,
          }),
        ),
      );
    },
  }))
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
