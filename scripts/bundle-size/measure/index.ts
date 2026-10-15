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

export type BuildResult = Val<
  "BuildResult",
  {
    imports: Imports;
    readsNodeEnv: boolean;
    production: Build;
    development: Build;
  }
>;
export const BuildResult = Val.sealer<BuildResult>().impl({
  check: (build): R<void, BranchIgnoredError> =>
    !build.readsNodeEnv || build.production.sizes.minified !== build.development.sizes.minified
      ? R.ok()
      : R.err(
          new BranchIgnoredError({
            imports: build.imports,
            message: `production keeps the development branches: import { ${Imports.names(build.imports).join(", ")} }`,
          }),
        ),
});

export type BundleSize = Val<
  "BundleSize",
  {
    bundle: Bundle;
    build: BuildResult;
    capped: number;
  }
>;
export const BundleSize = Val.companion<BundleSize>()
  .implCreate((bundle: Bundle, build: BuildResult, base: BuildResult) => ({
    bundle,
    build,
    capped: bundle.base
      ? build.production.sizes.gzip
      : build.production.sizes.gzip - base.production.sizes.gzip,
  }))
  .impl({
    over: (size): boolean => size.capped > size.bundle.budget,
    check: (size, base: BuildResult): R<void, AddsNothingError> =>
      size.bundle.base || size.build.production.library !== base.production.library
        ? R.ok()
        : R.err(
            new AddsNothingError({
              bundle: size.bundle,
              message: `${size.bundle.name} adds nothing to the base, which already holds it`,
            }),
          ),
  });
