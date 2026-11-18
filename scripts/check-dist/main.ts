// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { Check } from "./check/check.ts";
import { CompatCheck } from "./check/compat/index.ts";
import { Bundle, Imports } from "./check/size/bundle.ts";
import { ClaimedFile } from "./check/size/claims.ts";
import { SizeCheck } from "./check/size/index.ts";
import { Suite } from "./check/size/suite.ts";
import { TypesBudgets, TypesCheck, TypesDeclaration, TypesFixture } from "./check/types/index.ts";
import { run } from "./cli/run.ts";
import { Selection } from "./cli/selection.ts";
import { build } from "./prepare/build.ts";

async function main(): Promise<void> {
  const selected = Selection.fromArgv(process.argv.slice(2));
  if (R.isFailure(selected)) {
    console.error(selected.error.message);
    process.exit(2);
  }
  const { size, types, compat, release, write } = selected.value;

  const built = await build();
  if (R.isFailure(built)) {
    console.error(built.error.message);
    process.exit(1);
  }

  process.exitCode = await run([
    ...(size
      ? [
          Check.dyn(
            SizeCheck,
            SizeCheck.create({ suite: SUITE, claimed: [...CLAIMED], release, write }),
          ),
        ]
      : []),
    ...(types
      ? [Check.dyn(TypesCheck, TypesCheck.create({ budgets: TYPES_BUDGETS, line: TYPES_LINE }))]
      : []),
    ...(compat ? [Check.dyn(CompatCheck, CompatCheck.create({ release, lines: [...LINES] }))] : []),
  ]);
}

/** The bundles the size check measures, each against its budget in bytes of production gzip. */
const SUITE = Suite.seal([
  Bundle.seal({
    name: "Val",
    base: true,
    imports: Imports.seal({ "./dist/index.js": ["Val.companion"] }),
    budget: 1331,
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
const CLAIMED: readonly ClaimedFile[] = [
  ClaimedFile.Markdown.create({ path: "docs/src/introduction.md", release: false }),
  ClaimedFile.Markdown.create({ path: "README.md", release: true }),
  ClaimedFile.PackageJson.create({ path: "package.json", release: true }),
];

/** The oldest line supported, the line above it, and the current one, each installed under an alias (notes §10.1). */
const LINES: readonly string[] = ["typescript-5", "typescript-6", "typescript"];

/** The floor alone, because every line above it counts the same instantiations within the checkers' noise. */
const TYPES_LINE = LINES[0]!;

const TYPES_BUDGETS = TypesBudgets.seal({
  /**
   * **An alarm for a blow-up, not a ratchet for creep** (notes §16). Read the printed number to
   * watch the drift. The fixtures are not comparable to each other.
   *
   * Each fixture keeps a step whose function takes what the step passes, as
   * `impl(({ seal }) => …)`. With `NoInfer` removed from `Supplied`, core and trait exceed their
   * budgets.
   */
  fixtures: [
    TypesFixture.seal({ name: "core", budget: 13_500 }),
    TypesFixture.seal({ name: "trait", budget: 28_000 }),
    TypesFixture.seal({ name: "enum", budget: 90_000 }),
  ],
  /** Declaration files, in bytes. An alarm too, not a ratchet. */
  declarations: [
    /** What a consumer downloads for `import "valof"`. */
    TypesDeclaration.seal({
      name: "index.d.ts",
      path: "dist/index.d.ts",
      description: "the published declarations, in bytes. what every consumer parses.",
      budget: 118 * 1024,
    }),
    /** The plugin's declarations, which a config file in TypeScript loads. */
    TypesDeclaration.seal({
      name: "eslint-plugin.d.mts",
      path: "dist/eslint-plugin/index.d.mts",
      description: "the plugin's, in bytes. what a typed config file parses.",
      budget: 2 * 1024,
    }),
  ],
});

await main();
