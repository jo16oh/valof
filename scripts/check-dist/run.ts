import { Result as R } from "@praha/byethrow";

export type Check = { name: string; run: () => Promise<R.Result<void, Error>> };

/**
 * Runs the checks one at a time, because types and compat each start `tsc` many times. Every check
 * runs even after one fails, so the summary says which failed. Returns the exit code.
 */
export async function runChecks(checks: readonly Check[]): Promise<number> {
  const results: { name: string; failure: Error | undefined }[] = [];
  for (const { name, run } of checks) {
    console.log(`\n# ${name}\n`);
    const result = await R.try({ try: run, catch: (error) => error as Error });
    const failure = R.isFailure(result)
      ? result.error
      : R.isFailure(result.value)
        ? result.value.error
        : undefined;
    if (failure) console.error(`\n${failure.message}`);
    results.push({ name, failure });
  }

  console.log();
  for (const { name, failure } of results)
    console.log(`  ${name.padEnd(6)}  ${failure ? "fail" : "pass"}`);
  return results.some(({ failure }) => failure) ? 1 : 0;
}
