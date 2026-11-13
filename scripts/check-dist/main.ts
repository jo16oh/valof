// Checks the built `dist` as a user receives it: what it costs to ship, what its declarations cost
// the checker, and whether they typecheck on every TypeScript line.
import { Result as R } from "@praha/byethrow";

import { CompatCheck } from "./check/compat/index.ts";
import { build } from "./prepare/build.ts";
import { Check } from "./check/check.ts";
import { run } from "./cli/run.ts";
import { Selection } from "./cli/selection.ts";
import { Bundle, Imports } from "./check/size/bundle.ts";
import { ClaimedFile } from "./check/size/claims.ts";
import { SizeCheck } from "./check/size/index.ts";
import { Suite } from "./check/size/suite.ts";
import { TypesBudgets, TypesCheck, TypesDeclaration, TypesFixture } from "./check/types/index.ts";

/** The bundles the size check measures, each against its budget in bytes of production gzip. */
const SUITE = Suite.seal([
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
const CLAIMED = [
  ClaimedFile.Markdown.create({ path: "docs/src/introduction.md", release: false }),
  ClaimedFile.Markdown.create({ path: "README.md", release: true }),
  ClaimedFile.PackageJson.create({ path: "package.json", release: true }),
];

/**
 * The oldest line supported, the line above it, and the current one, each installed under an alias.
 * Read from `node_modules`, so a new major enters this check when someone adds its alias.
 *
 * A line's last release is where its semantics settled, and supporting one from there avoids the
 * edge cases of the versions in between (notes §10.1).
 */
const LINES = ["typescript-5", "typescript-6", "typescript"];

/**
 * The floor alone. Every line above it says the same thing: across 5.9, 6.0 and 7.0 the fixtures
 * differed by 5 instantiations in 1,677, the checkers' own noise. The compat check still typechecks
 * every line.
 */
const TYPES_LINE = LINES[0]!;

const TYPES_BUDGETS = TypesBudgets.seal({
  /**
   * Instantiations over the baseline, which is the same lib with none of the library.
   *
   * Round, and well clear of the measurement. **This is an alarm for a blow-up, not a ratchet for
   * creep.** A recursive conditional running away or a union distributing where it should not
   * multiplies the count; growth from writing more types adds a few percent. A budget tight enough
   * to catch the second has to be re-baselined on every change, and stops meaning anything. Read the
   * printed number when you want to watch the drift.
   *
   * Instantiations alone. `Types` is printed and tracks it closely, at 3.2 instantiations each
   * across every measurement so far, and what this library risks is a recursive conditional running
   * away, which is what instantiations count. Two budgets to re-baseline for one signal is one
   * too many.
   *
   * The fixtures are not comparable to each other. Each carries its own history. `enum` sits high
   * because `EnumCompanion`, `VariantFrame` and `VariantOf` are generic aliases over intersections:
   * relating two references to one measures the alias's variance, which instantiates it with marker
   * types. That is a constant the checker pays once per program, not growth with the number of
   * variants, which runs at about 1,100 instantiations each. The aliases that could carry `in out`
   * do, which is what keeps the constant where it is; an intersection cannot (TS2637), and their
   * names are worth more than the measurement (notes §15.2).
   *
   * `trait` went from 15,000 to 17,000 when `implTrait` grew the callback form: an implementation
   * is now `Implement<…> | ((self) => Implement<…>)`, and the union is related twice at every call
   * the fixture makes. An alarm, not a ratchet.
   *
   * It went from 22,000 to 25,000 when a field could hold `null` or a primitive beside another kind.
   * Every node of `DeepReadonly` checks for such a field, and every payload for a field no value fits.
   *
   * Each fixture has a step whose function takes what the step passes, as `impl(({ seal }) => …)`. A
   * function that takes nothing skips the cost `NoInfer` removes (`Supplied` in `src/val.ts`). With
   * the wrapper removed, `core` and `trait` exceed their budgets. `enum` stays within its own, so the
   * comments at its steps are the only record.
   */
  fixtures: [
    TypesFixture.seal({ name: "core", budget: 10_000 }),
    TypesFixture.seal({ name: "trait", budget: 25_000 }),
    TypesFixture.seal({ name: "enum", budget: 90_000 }),
  ],
  /**
   * Declaration files, in bytes. Deterministic like the counts above, and budgeted the same way: an
   * alarm, not a ratchet.
   *
   * Here rather than in the size check because it is a type cost. It never reaches a user's bundle;
   * what it costs is the download and every parse of it, and a run away shows as a type graph the
   * declarations drag in whole. `Finding` derived from `RULES` took `lint`'s declarations to
   * 14.9 kB that way, which is the size of the accident this catches. Creep is a few hundred bytes
   * a feature: read the printed number for that.
   */
  declarations: [
    /**
     * What a consumer downloads for `import "valof"`.
     *
     * `tsc` indents with four spaces where tsdown wrote a tab, which took the same types from 64.1
     * to 64.7 kB.
     *
     * The budget went from 96 to 104 kB for the checks on a broken declaration: their messages, and
     * the constraints that report them where the type is declared. It went to 108 kB for the checks
     * that reject a union of two types `equals` cannot tell apart.
     */
    TypesDeclaration.seal({
      name: "index.d.ts",
      path: "dist/index.d.ts",
      description: "the published declarations, in bytes. what every consumer parses.",
      budget: 108 * 1024,
    }),
    /**
     * The plugin's declarations, which a config file in TypeScript loads. Its export is annotated by
     * hand: inferred, it carries ESLint's types, which took it to 93.7 kB.
     */
    TypesDeclaration.seal({
      name: "eslint-plugin.d.mts",
      path: "dist/eslint-plugin/index.d.mts",
      description: "the plugin's, in bytes. what a typed config file parses.",
      budget: 2 * 1024,
    }),
  ],
});

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
    ? [Check.dyn(SizeCheck, SizeCheck.create({ suite: SUITE, claimed: CLAIMED, release, write }))]
    : []),
  ...(types
    ? [Check.dyn(TypesCheck, TypesCheck.create({ budgets: TYPES_BUDGETS, line: TYPES_LINE }))]
    : []),
  ...(compat ? [Check.dyn(CompatCheck, CompatCheck.create({ release, lines: LINES }))] : []),
]);
