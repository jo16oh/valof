// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { checkCompat } from "./compat/index.ts";
import { pack } from "./pack.ts";
import { runChecks, type Check } from "./run.ts";
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

const checks: Check[] = [
  ...(size ? [{ name: "size", run: () => checkSize({ release, write }) }] : []),
  ...(types ? [{ name: "types", run: () => checkTypes() }] : []),
  ...(compat ? [{ name: "compat", run: () => checkCompat({ release }) }] : []),
];
process.exitCode = await runChecks(checks);
