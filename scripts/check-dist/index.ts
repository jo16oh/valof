// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { CompatCheck } from "./compat/index.ts";
import { pack } from "./pack.ts";
import { Check, runChecks } from "./run.ts";
import { Selection } from "./selection.ts";
import { SizeCheck } from "./size/index.ts";
import { TypesCheck } from "./types/index.ts";

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
  ...(size ? [Check.dyn(SizeCheck, SizeCheck.create({ release, write }))] : []),
  ...(types ? [Check.dyn(TypesCheck, TypesCheck.create())] : []),
  ...(compat ? [Check.dyn(CompatCheck, CompatCheck.create({ release }))] : []),
]);
