import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";
import { Imports, type Bundle } from "./bundle.ts";
import { flow } from "../shared/pipe/index.ts";
import {
  BuildResult,
  BundleSize,
  type AddsNothingError,
  type DevCodeKeptError,
} from "./measure/index.ts";
import {
  measure,
  pack,
  type CompileError,
  type MinifyError,
  type NoChunkError,
  type PackError,
} from "./measure/toolchain.ts";

export class NoBaseError extends ErrorFactory({ message: "no bundle sets base" }) {}

export type Report = Val<
  "Report",
  {
    base: BuildResult;
    bundles: BundleSize[];
    separateBase: BuildResult[];
  }
>;
export const Report = Val.companion<Report>().build();

export type Suite = Val<"Suite", Bundle[]>;
export const Suite = Val.companion<Suite>()
  .impl(() => ({
    base: (suite): R.Result<Imports, NoBaseError> => {
      const [first, ...others] = suite
        .filter((bundle) => bundle.base)
        .map((bundle) => bundle.imports);
      return first !== undefined
        ? R.succeed(others.reduce((merged, imports) => Imports.merge(merged, imports), first))
        : R.fail(new NoBaseError());
    },
    measure: async (
      suite: Suite,
    ): R.ResultAsync<
      Report,
      | PackError
      | NoBaseError
      | NoChunkError
      | CompileError
      | MinifyError
      | DevCodeKeptError
      | AddsNothingError
    > => {
      const packed = await pack();
      if (R.isFailure(packed)) return packed;

      const baseImports = Suite.base(suite);
      if (R.isFailure(baseImports)) return baseImports;

      const measured = await R.sequence(
        suite.map((bundle) =>
          flow(
            bundle.base ? bundle.imports : Imports.merge(baseImports.value, bundle.imports),
            measure,
            R.map((build) => ({ bundle, build })),
          ),
        ),
      );
      if (R.isFailure(measured)) return measured;
      const results = measured.value;

      const [only, ...more] = results.filter(({ bundle }) => bundle.base);
      const base =
        only !== undefined && more.length === 0
          ? R.succeed(only.build)
          : await measure(baseImports.value);
      if (R.isFailure(base)) return base;
      const separateBase = base.value === only?.build ? [] : [base.value];

      const kept = R.sequence(
        [...separateBase, ...results.map(({ build }) => build)],
        BuildResult.check,
      );
      if (R.isFailure(kept)) return kept;

      const bundles = results.map(({ bundle, build }) =>
        BundleSize.create(bundle, build, base.value),
      );

      const added = R.sequence(bundles, (size) => BundleSize.check(size, base.value));
      if (R.isFailure(added)) return added;

      return R.succeed(Report.seal({ base: base.value, bundles, separateBase }));
    },
  }))
  .build();
