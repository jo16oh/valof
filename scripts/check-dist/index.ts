// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";
import { Val, type Dyn } from "#valof";

import { CompatCheck } from "./checks/compat/index.ts";
import { pack } from "./pack.ts";
import { Check } from "./checks/check.ts";
import type { Report } from "./checks/report.ts";
import { Selection } from "./selection.ts";
import { Bundle, Imports } from "./checks/size/bundle.ts";
import { ClaimedFile } from "./checks/size/claims.ts";
import { SizeCheck } from "./checks/size/index.ts";
import { Suite } from "./checks/size/suite.ts";
import { TypesBudgets, TypesCheck } from "./checks/types/index.ts";

/** The bundles the size check measures, each against its budget in bytes of production gzip. */
const suite = Suite.seal([
  Bundle.seal({
    name: "Val",
    base: true,
    imports: Imports.seal({ "./dist/index.js": ["Val.companion"] }),
    budget: 1024,
  }),
  Bundle.seal({
    name: "Equals",
    imports: Imports.seal({ "./dist/index.js": ["equals"] }),
    budget: 256,
  }),
  Bundle.seal({
    name: "Trait",
    imports: Imports.seal({ "./dist/index.js": ["Trait.companion"] }),
    budget: 256,
  }),
  Bundle.seal({
    name: "Enum",
    imports: Imports.seal({ "./dist/index.js": ["Enum.companion"] }),
    budget: 640,
  }),
  Bundle.seal({
    name: "Equals + Enum + Trait",
    imports: Imports.seal({
      "./dist/index.js": ["equals", "Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
  Bundle.seal({
    name: "All",
    imports: Imports.seal({
      "./dist/index.js": ["equals", "Val.of", "Val.unwrap", "Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
]);

/** The files that state the base bundle's size, which the size check compares and rewrites. */
const claimed = [
  ClaimedFile.Markdown.create({ path: "docs/src/introduction.md", release: false }),
  ClaimedFile.Markdown.create({ path: "README.md", release: true }),
  ClaimedFile.PackageJson.create({ path: "package.json", release: true }),
];

const typesBudgets = TypesBudgets.seal({
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
  core: 10_000,
  trait: 25_000,
  enum: 90_000,
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
  declarations: 108 * 1024,
  /**
   * The plugin's declarations, which a config file in TypeScript loads. Its export is annotated by
   * hand: inferred, it carries ESLint's types, which took it to 93.7 kB.
   */
  plugin: 2 * 1024,
});

/** Whether a check passed, as the summary prints it. */
type Outcome = Val<"Outcome", { name: string; failed: boolean }>;
const Outcome = Val.companion<Outcome>()
  .implAssoc(({ seal }) => ({
    /** Failed where the check could not report (`undefined`), or reported that it did not pass. */
    of: (name: string, report: Dyn<Report> | undefined): Outcome =>
      seal({ name, failed: !report?.passed() }),
  }))
  .impl(() => ({
    line: ({ name, failed }): string => `  ${name.padEnd(6)}  ${failed ? "fail" : "pass"}`,
  }))
  .build();

/**
 * Runs the checks one at a time, because types and compat each start `tsc` many times. Every check
 * runs even after one fails, so the summary says which failed. Returns the exit code.
 */
export async function runChecks(checks: readonly Dyn<Check>[]): Promise<number> {
  const outcomes: Outcome[] = [];
  for (const check of checks) {
    console.log(`\n# ${check.name}\n`);
    // oxlint-disable-next-line no-await-in-loop -- one at a time, see above
    const result = await R.try({ try: () => check.run(), catch: (error) => error as Error });
    const report = R.isFailure(result) ? result : result.value;
    if (R.isSuccess(report)) console.log(report.value.render());
    else console.error(`\n${report.error.message}`);
    outcomes.push(Outcome.of(check.name, R.isSuccess(report) ? report.value : undefined));
  }

  console.log();
  for (const outcome of outcomes) console.log(Outcome.line(outcome));
  return outcomes.some(({ failed }) => failed) ? 1 : 0;
}

// Only when run as a command. The tests import this file for `runChecks`.
if (import.meta.main) {
  const selected = Selection.fromArgv(process.argv.slice(2));
  if (R.isFailure(selected)) {
    console.error(selected.error.message);
    process.exit(2);
  }
  const { size, types, compat, release, write } = selected.value;

  const packed = await pack();
  if (R.isFailure(packed)) {
    console.error(packed.error.message);
    process.exit(1);
  }

  process.exitCode = await runChecks([
    ...(size ? [Check.dyn(SizeCheck, SizeCheck.create({ suite, claimed, release, write }))] : []),
    ...(types ? [Check.dyn(TypesCheck, TypesCheck.create({ budgets: typesBudgets }))] : []),
    ...(compat ? [Check.dyn(CompatCheck, CompatCheck.create({ release }))] : []),
  ]);
}
