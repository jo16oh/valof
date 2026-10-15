import { Result as R, TaggedError } from "better-result";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";
import {
  BuildResult,
  BundleSize,
  type AddsNothingError,
  type BranchIgnoredError,
} from "./measure/index.ts";
import {
  measure,
  pack,
  type CompileError,
  type MinifyError,
  type NoChunkError,
  type PackError,
} from "./measure/toolchain.ts";

export class NoBaseError extends TaggedError("NoBaseError")<{ message: string }> {}

export type Report = Val<
  "Report",
  {
    base: BuildResult;
    bundles: BundleSize[];
    separateBase: BuildResult[];
  }
>;
export const Report = Val.sealer<Report>();

export type Suite = Val<"Suite", Bundle[]>;
export const Suite = Val.sealer<Suite>().impl({
  base: (suite): R<Imports, NoBaseError> => {
    const [first, ...others] = suite
      .filter((bundle) => bundle.base)
      .map((bundle) => bundle.imports);
    return first !== undefined
      ? R.ok(others.reduce((merged, imports) => Imports.merge(merged, imports), first))
      : R.err(new NoBaseError({ message: "no bundle sets base" }));
  },
  measure: (
    suite: Suite,
  ): Promise<
    R<
      Report,
      | PackError
      | NoBaseError
      | NoChunkError
      | CompileError
      | MinifyError
      | BranchIgnoredError
      | AddsNothingError
    >
  > =>
    R.gen(async function* () {
      yield* R.await(pack());
      const baseImports = yield* Suite.base(suite);
      const results = yield* R.await(
        R.allAsync(
          suite.map((bundle) =>
            measure(bundle.base ? bundle.imports : Imports.merge(baseImports, bundle.imports)).then(
              R.map((build) => ({ bundle, build })),
            ),
          ),
        ),
      );
      const [only, ...more] = results.filter(({ bundle }) => bundle.base);
      const base =
        only !== undefined && more.length === 0 ? only.build : yield* R.await(measure(baseImports));
      const separateBase = base === only?.build ? [] : [base];
      for (const build of [...separateBase, ...results.map(({ build }) => build)]) {
        yield* BuildResult.check(build);
      }
      const bundles = results.map(({ bundle, build }) => BundleSize.create(bundle, build, base));
      for (const size of bundles) yield* BundleSize.check(size, base);
      return R.ok(Report({ base, bundles, separateBase }));
    }),
});
