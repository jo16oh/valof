import { Result as R, TaggedError } from "better-result";
import { Val } from "../../../src/index.ts";
import { Imports, type Bundle } from "../bundle.ts";

export class BranchIgnoredError extends TaggedError("BranchIgnoredError")<{
  imports: Imports;
  message: string;
}> {}

export class AddsNothingError extends TaggedError("AddsNothingError")<{
  bundle: Bundle;
  message: string;
}> {}

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.sealer<Sizes>();

export type Build = Val<
  "Build",
  {
    sizes: Sizes;
    /** The code's length, leaving out the entry that imports the library. */
    library: number;
  }
>;
export const Build = Val.sealer<Build>();

export type Measured = Val<
  "Measured",
  {
    imports: Imports;
    readsNodeEnv: boolean;
    production: Build;
    development: Build;
  }
>;
export const Measured = Val.sealer<Measured>().impl({
  check: (measured): R<void, BranchIgnoredError> =>
    !measured.readsNodeEnv ||
    measured.production.sizes.minified !== measured.development.sizes.minified
      ? R.ok()
      : R.err(
          new BranchIgnoredError({
            imports: measured.imports,
            message: `production keeps the development branches: import { ${Imports.names(measured.imports).join(", ")} }`,
          }),
        ),
});

export type MeasuredBundle = Val<
  "MeasuredBundle",
  {
    bundle: Bundle;
    measured: Measured;
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
    check: (result, base: Measured): R<void, AddsNothingError> =>
      result.bundle.base || result.measured.production.library !== base.production.library
        ? R.ok()
        : R.err(
            new AddsNothingError({
              bundle: result.bundle,
              message: `${result.bundle.name} adds nothing to the base, which already holds it`,
            }),
          ),
  });
