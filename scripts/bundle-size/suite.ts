import { Result as R, TaggedError } from "better-result";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";
import { Measured, MeasuredBundle, type AddsNothing, type BranchIgnored } from "./measure/index.ts";
import {
  measure,
  pack,
  type CompileFailed,
  type MinifyFailed,
  type NoChunk,
  type PackFailed,
} from "./measure/toolchain.ts";

export class NoBase extends TaggedError("NoBase")<{ message: string }> {}

/** What measuring a suite found. */
export type Measurement = Val<
  "Measurement",
  {
    /** The base, which every bundle not in it is measured on top of. */
    base: Measured;
    results: MeasuredBundle[];
    /** The base again, when it was measured apart from every bundle, so `results` leaves it out. */
    extra: Measured[];
  }
>;
export const Measurement = Val.sealer<Measurement>();

/** The bundles measured together, against the base they share. */
export type Suite = Val<"Suite", Bundle[]>;
export const Suite = Val.sealer<Suite>().impl({
  /** What the base imports: every base bundle's imports, merged. */
  base: (suite): R<Imports, NoBase> => {
    const [first, ...others] = suite
      .filter((bundle) => bundle.base)
      .map((bundle) => bundle.imports);
    return first !== undefined
      ? R.ok(others.reduce((merged, imports) => Imports.merge(merged, imports), first))
      : R.err(new NoBase({ message: "no bundle sets base" }));
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
      PackFailed | NoBase | NoChunk | CompileFailed | MinifyFailed | BranchIgnored | AddsNothing
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
            ).map((measured) => ({ bundle, measured })),
          ),
        ),
      );
      const [only, ...more] = results.filter(({ bundle }) => bundle.base);
      // With one base bundle, the base is that bundle, already measured.
      const base =
        only !== undefined && more.length === 0
          ? only.measured
          : yield* R.await(measure(baseImports));
      const extra = base === only?.measured ? [] : [base];
      for (const measured of [...extra, ...results.map(({ measured }) => measured)]) {
        yield* Measured.check(measured);
      }
      const bundles = results.map(({ bundle, measured }) =>
        MeasuredBundle.create(bundle, measured, base),
      );
      for (const result of bundles) yield* MeasuredBundle.check(result, base);
      return R.ok(Measurement({ base, results: bundles, extra }));
    }),
});
