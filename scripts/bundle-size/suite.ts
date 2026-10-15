import { Result as R, TaggedError } from "better-result";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";
import {
  checkProduction,
  measure,
  pack,
  type CompileFailed,
  type DevelopmentCodeRemains,
  type EqualsRemains,
  type Measured,
  type MeasuredBundle,
  type MinifyFailed,
  type NoChunk,
  type PackFailed,
} from "./measure.ts";

export class NoBase extends TaggedError("NoBase")<{ message: string }> {}

/** What measuring a suite found. */
export type Measurement = {
  /** The base, which every bundle not in it is measured on top of. */
  base: Measured;
  results: MeasuredBundle[];
  /** The base again, when it was measured apart from every bundle, so `results` leaves it out. */
  extra: Measured[];
};

/** The bundles measured together, against the base they share. */
export type Suite = Val<"Suite", Bundle[]>;
export const Suite = Val.sealer<Suite>().impl({
  /** What the base imports: every base bundle's imports, merged. */
  base: (suite): R<Imports, NoBase> => {
    const [first, ...others] = suite
      .filter((bundle) => bundle.base)
      .map((bundle) => bundle.imports);
    if (first === undefined) return R.err(new NoBase({ message: "no bundle sets base" }));
    return R.ok(others.reduce((merged, imports) => Imports.merge(merged, imports), first));
  },
  /**
   * Builds `dist`, and measures each bundle: a base bundle alone, any other on top of the base.
   * Fails when a production bundle keeps code it should not.
   */
  measure: (
    suite: Suite,
  ): Promise<
    R<
      Measurement,
      | PackFailed
      | NoBase
      | NoChunk
      | CompileFailed
      | MinifyFailed
      | DevelopmentCodeRemains
      | EqualsRemains
    >
  > =>
    R.gen(async function* () {
      yield* R.await(pack());
      const baseImports = yield* Suite.base(suite);
      const results = yield* R.await(
        R.allAsync(
          suite.map(async (bundle) =>
            (
              await measure(
                bundle.base ? bundle.imports : Imports.merge(baseImports, bundle.imports),
              )
            ).map((result) => ({ ...result, bundle })),
          ),
        ),
      );
      const [only, ...more] = results.filter(({ bundle }) => bundle.base);
      // With one base bundle, the base is that bundle, already measured.
      const base =
        only !== undefined && more.length === 0 ? only : yield* R.await(measure(baseImports));
      for (const each of [base, ...results]) yield* checkProduction(each);
      return R.ok({ base, results, extra: base === only ? [] : [base] });
    }),
});
