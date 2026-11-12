import { Result as R } from "@praha/byethrow";
import { Trait, Val, type Dyn, type Self } from "#valof";

import type { CompatError } from "./compat/index.ts";
import type { SizeError } from "./size/index.ts";
import type { TypesError } from "./types/index.ts";

/** What any check fails with. */
export type CheckError = SizeError | TypesError | CompatError;

/** What a check found, printed whole and then judged. */
export type Report = Trait<
  "Report",
  Record<never, never>,
  {
    render: (self: Self) => string;
    /** Fails where what the check found is over a budget, stale or incompatible. */
    verdict: (self: Self) => R.Result<void, CheckError>;
  }
>;
export const Report = Trait.companion<Report>().build();

/**
 * One check of the built `dist`, reported under its name. `run` fails where it cannot report, as
 * on a build that breaks.
 */
export type Check = Trait<
  "Check",
  { name: string },
  { run: (self: Self) => R.ResultAsync<Dyn<Report>, CheckError> }
>;
export const Check = Trait.companion<Check>().build();

/** Whether a check passed, as the summary prints it. */
type Outcome = Val<"Outcome", { name: string; failed: boolean }>;
const Outcome = Val.companion<Outcome>()
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

    const judged = R.isSuccess(report) ? report.value.verdict() : report;
    if (R.isFailure(judged)) console.error(`\n${judged.error.message}`);
    outcomes.push(Outcome.seal({ name: check.name, failed: R.isFailure(judged) }));
  }

  console.log();
  for (const outcome of outcomes) console.log(Outcome.line(outcome));
  return outcomes.some(({ failed }) => failed) ? 1 : 0;
}
