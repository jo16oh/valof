// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { checkCompat } from "./compat/index.ts";
import { pack } from "./pack.ts";
import { Selection } from "./selection.ts";
import { checkSize } from "./size/index.ts";
import { checkTypes } from "./types/index.ts";

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

type Check = { name: string; run: () => Promise<R.Result<void, Error>> };
const checks: Check[] = [
  ...(size ? [{ name: "size", run: () => checkSize({ release, write }) }] : []),
  ...(types ? [{ name: "types", run: () => checkTypes() }] : []),
  ...(compat ? [{ name: "compat", run: () => checkCompat({ release }) }] : []),
];

// One at a time, because types and compat each start `tsc` many times. Every check runs even after
// one fails, so the summary says which failed.
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
process.exitCode = results.some(({ failure }) => failure) ? 1 : 0;
