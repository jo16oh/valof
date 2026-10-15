import { Result as R, TaggedError } from "better-result";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";

export class NoBase extends TaggedError("NoBase")<{ message: string }> {}

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
  /** Measures each bundle with `measure`: a base bundle alone, any other on top of the base. */
  measure: <T, E>(
    suite: Suite,
    measure: (imports: Imports) => Promise<R<T, E>>,
  ): Promise<R<(T & { bundle: Bundle })[], NoBase | E>> =>
    R.gen(async function* () {
      const base = yield* Suite.base(suite);
      const measured = yield* R.await(
        R.allAsync(
          suite.map(async (bundle) =>
            (await measure(bundle.base ? bundle.imports : Imports.merge(base, bundle.imports))).map(
              (result) => ({ ...result, bundle }),
            ),
          ),
        ),
      );
      return R.ok(measured);
    }),
});
