import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";
import { Imports, type Bundle } from "../bundle.ts";

export class DevCodeKeptError extends ErrorFactory({
  message: ({ imports }) =>
    `production keeps the development branches: import { ${Imports.names(imports).join(", ")} }`,
  fields: ErrorFactory.fields<{ imports: Imports }>(),
}) {}

export class AddsNothingError extends ErrorFactory({
  message: ({ bundle }) => `${bundle.name} adds nothing to the base, which already holds it`,
  fields: ErrorFactory.fields<{ bundle: Bundle }>(),
}) {}

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
  .impl(() => ({
    check: (build): R.Result<void, DevCodeKeptError> =>
      !build.readsNodeEnv || build.production.sizes.minified !== build.development.sizes.minified
        ? R.succeed()
        : R.fail(new DevCodeKeptError({ imports: build.imports })),
  }))
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
  .impl(() => ({
    over: (size) => size.capped > size.bundle.budget,
    check: (size, base: BuildResult): R.Result<void, AddsNothingError> =>
      size.bundle.base || size.build.production.library !== base.production.library
        ? R.succeed()
        : R.fail(new AddsNothingError({ bundle: size.bundle })),
  }))
  .build();
