import { Result as R } from "@praha/byethrow";
import { Trait, Val, type Dyn, type Self } from "#valof";

import type { CompatError } from "./compat/index.ts";
import type { SizeError } from "./size/index.ts";
import type { TypesError } from "./types/index.ts";

/** What any check fails with. */
export type CheckError = SizeError | TypesError | CompatError;

/** One check of the built `dist`, reported under its name. */
export type Check = Trait<
  "Check",
  { name: string },
  { run: (self: Self) => R.ResultAsync<void, CheckError> }
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
    const failure = R.isFailure(result)
      ? result.error
      : R.isFailure(result.value)
        ? result.value.error
        : undefined;
    if (failure) console.error(`\n${failure.message}`);
    outcomes.push(Outcome.seal({ name: check.name, failed: failure !== undefined }));
  }

  console.log();
  for (const outcome of outcomes) console.log(Outcome.line(outcome));
  return outcomes.some(({ failed }) => failed) ? 1 : 0;
}
