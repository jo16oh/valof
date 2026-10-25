import { Result as R, TaggedError } from "better-result";
import { Val } from "#valof";
import { Imports, type Bundle } from "../bundle.ts";

export class DevCodeKeptError extends TaggedError("DevCodeKeptError")<{
  imports: Imports;
  message: string;
}> {
  constructor({ imports }: { imports: Imports }) {
    super({
      imports,
      message: `production keeps the development branches: import { ${Imports.names(imports).join(", ")} }`,
    });
  }
}

export class AddsNothingError extends TaggedError("AddsNothingError")<{
  bundle: Bundle;
  message: string;
}> {
  constructor({ bundle }: { bundle: Bundle }) {
    super({ bundle, message: `${bundle.name} adds nothing to the base, which already holds it` });
  }
}

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.companion<Sizes>().build();

export type Build = Val<
  "Build",
  {
    sizes: Sizes;
    /** The code's length, leaving out the entry that imports the library. */
    library: number;
  }
>;
export const Build = Val.companion<Build>().build();

export type BuildResult = Val<
  "BuildResult",
  {
    imports: Imports;
    readsNodeEnv: boolean;
    production: Build;
    development: Build;
  }
>;
export const BuildResult = Val.companion<BuildResult>()
  .impl({
    check: (build): R<void, DevCodeKeptError> =>
      !build.readsNodeEnv || build.production.sizes.minified !== build.development.sizes.minified
        ? R.ok()
        : R.err(new DevCodeKeptError({ imports: build.imports })),
  })
  .build();

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
        : R.err(new AddsNothingError({ bundle: size.bundle })),
  })
  .build();
