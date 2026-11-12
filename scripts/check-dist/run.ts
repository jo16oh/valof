import { Result as R } from "@praha/byethrow";
import { Val, type Dyn } from "#valof";

import type { Check } from "./checks/check.ts";

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
