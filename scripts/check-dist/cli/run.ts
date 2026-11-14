import { Result as R } from "@praha/byethrow";

import type { Dyn } from "#valof";

import type { Check } from "../check/check.ts";

/**
 * Runs the checks one at a time, because types and compat each start `tsc` many times. Every check
 * runs even after one fails, so the summary says which failed. Returns the exit code.
 */
export async function run(checks: readonly Dyn<Check>[]): Promise<number> {
  const summary: string[] = [];
  let failed = false;
  for (const check of checks) {
    console.log(`\n# ${check.name}\n`);
    // oxlint-disable-next-line no-await-in-loop -- one at a time, see above
    const result = await R.try({ try: () => check.run(), catch: (error) => error as Error });
    const report = R.isFailure(result) ? result : result.value;
    if (R.isSuccess(report)) {
      console.log(report.value.render());
    } else {
      console.error(`\n${report.error.message}`);
    }

    // A check that could not report failed too.
    const passed = R.isSuccess(report) && report.value.passed();
    failed ||= !passed;
    summary.push(`  ${check.name.padEnd(6)}  ${passed ? "pass" : "fail"}`);
  }

  console.log();
  for (const line of summary) {
    console.log(line);
  }
  return failed ? 1 : 0;
}
