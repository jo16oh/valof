// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { CompatCheck } from "./compat/index.ts";
import { pack } from "./pack.ts";
import { Check, runChecks } from "./run.ts";
import { Selection } from "./selection.ts";
import { Bundle, Imports } from "./size/bundle.ts";
import { ClaimedFile } from "./size/claims.ts";
import { SizeCheck } from "./size/index.ts";
import { Suite } from "./size/suite.ts";
import { TypesCheck } from "./types/index.ts";

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
  ...(types ? [Check.dyn(TypesCheck, TypesCheck.create())] : []),
  ...(compat ? [Check.dyn(CompatCheck, CompatCheck.create({ release }))] : []),
]);
