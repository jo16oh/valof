import { Result as R, TaggedError } from "better-result";
import { Val } from "../../../src/index.ts";
import { Imports, type Bundle } from "../bundle.ts";

export class BranchIgnored extends TaggedError("BranchIgnored")<{
  imports: Imports;
  message: string;
}> {}

export class AddsNothing extends TaggedError("AddsNothing")<{ bundle: Bundle; message: string }> {}

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.sealer<Sizes>();

/** One mode's build of a bundle: its code, and what it weighs. */
export type Build = Val<
  "Build",
  {
    code: string;
    sizes: Sizes;
    /** The code's length, leaving out the entry that imports the library. */
    library: number;
  }
>;
export const Build = Val.sealer<Build>();

/** What a set of imports weighs, built in each mode. */
export type Measured = Val<
  "Measured",
  {
    imports: Imports;
    /** Whether the bundled library branches on `NODE_ENV`. */
    branches: boolean;
    production: Build;
    development: Build;
  }
>;
export const Measured = Val.sealer<Measured>().impl({
  /**
   * Fails when the library branches on `NODE_ENV`, yet both builds weigh the same: production
   * keeps the code only development needs.
   */
  check: (measured): R<void, BranchIgnored> =>
    measured.branches && measured.production.sizes.minified === measured.development.sizes.minified
      ? R.err(
          new BranchIgnored({
            imports: measured.imports,
            message: `production keeps the development branches: import { ${Imports.names(measured.imports).join(", ")} }`,
          }),
        )
      : R.ok(undefined),
});

/** A bundle, measured with the base under it unless it joins the base. */
export type MeasuredBundle = Val<
  "MeasuredBundle",
  {
    bundle: Bundle;
    measured: Measured;
    /** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
    capped: number;
  }
>;
export const MeasuredBundle = Val.companion<MeasuredBundle>()
  .implCreate((bundle: Bundle, measured: Measured, base: Measured) => ({
    bundle,
    measured,
    capped: bundle.base
      ? measured.production.sizes.gzip
      : measured.production.sizes.gzip - base.production.sizes.gzip,
  }))
  .impl({
    over: (result): boolean => result.capped > result.bundle.budget,
    /**
     * Fails when a bundle on top of the base adds no library code to it: what it imports is in the
     * base already.
     */
    check: (result, base: Measured): R<void, AddsNothing> =>
      !result.bundle.base && result.measured.production.library === base.production.library
        ? R.err(
            new AddsNothing({
              bundle: result.bundle,
              message: `${result.bundle.name} adds nothing to the base, which already holds it`,
            }),
          )
        : R.ok(undefined),
  });
