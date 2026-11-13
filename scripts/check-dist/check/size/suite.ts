import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";
import { Imports, type Bundle } from "./bundle.ts";
import { flow } from "../../../../src/shared/pipe/index.ts";
import { Budget } from "../budget.ts";
import { align } from "../report.ts";
import { BuildResult, BundleSize } from "./measure/index.ts";
import {
  measure,
  type CompileError,
  type MinifyError,
  type NoChunkError,
} from "./measure/toolchain.ts";

export class NoBaseError extends ErrorFactory({
  name: "NoBaseError",
  message: "no bundle sets base",
}) {}

export type MeasureError = NoBaseError | NoChunkError | CompileError | MinifyError;

export type Measurement = Val<
  "Measurement",
  {
    base: BuildResult;
    bundles: BundleSize[];
    separateBase: BuildResult[];
  }
>;
export const Measurement = Val.companion<Measurement>()
  .impl(() => ({
    /** Each build's sizes, then each bundle's budget. */
    render: ({ bundles, separateBase }): string =>
      [
        ...[...separateBase, ...bundles.map(({ build }) => build)].map(
          (build) => `${BuildResult.render(build)}\n`,
        ),
        budgets(bundles),
      ].join("\n"),
    /** Each build that keeps development code, then each bundle that adds nothing (§16.2). */
    problems: ({ base, bundles, separateBase }): string[] => [
      ...[...separateBase, ...bundles.map(({ build }) => build)].flatMap(BuildResult.problems),
      ...bundles.flatMap((size) => BundleSize.problems(size, base)),
    ],
  }))
  .build();

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
    measure: async (suite: Suite): R.ResultAsync<Measurement, MeasureError> => {
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

      const bundles = results.map(({ bundle, build }) =>
        BundleSize.create(bundle, build, base.value),
      );

      return R.succeed(Measurement.seal({ base: base.value, bundles, separateBase }));
    },
  }))
  .build();

function budgets(bundles: readonly BundleSize[]): string {
  const rows = bundles.map((size) => {
    const budget = BundleSize.budget(size);
    return [
      budget.name,
      BundleSize.amount(size, budget.used),
      BundleSize.amount(size, budget.limit),
      Budget.left(budget),
    ];
  });
  const lines = align(rows, ["left", "right", "right", "left"]).map(([name, used, limit, left]) =>
    `  ${name}  ${used} / ${limit}  ${left}`.trimEnd(),
  );

  return ["budget (production gzip)", ...lines].join("\n");
}
