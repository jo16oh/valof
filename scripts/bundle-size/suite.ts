import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";

/** The bundles measured together, against the base they share. */
export type Suite = Val<"Suite", Bundle[]>;
export const Suite = Val.sealer<Suite>().impl({
  /** What the base imports: every base bundle's imports, merged. */
  base: (suite): Imports => {
    const [first, ...others] = suite
      .filter((bundle) => bundle.base)
      .map((bundle) => bundle.imports);
    if (first === undefined) throw new Error("no bundle sets base");
    return others.reduce((merged, imports) => Imports.merge(merged, imports), first);
  },
  /** Measures each bundle with `measure`: a base bundle alone, any other on top of the base. */
  measure: <T>(
    suite: Suite,
    measure: (imports: Imports) => Promise<T>,
  ): Promise<(T & { bundle: Bundle })[]> => {
    const base = Suite.base(suite);
    return Promise.all(
      suite.map(async (bundle) => ({
        bundle,
        ...(await measure(bundle.base ? bundle.imports : Imports.merge(base, bundle.imports))),
      })),
    );
  },
});
