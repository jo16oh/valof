import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";
import { Imports, type Bundle } from "../bundle.ts";
import { pipe } from "../../../../src/shared/pipe/index.ts";
import { align, Budget, bytes } from "../../report.ts";

export class DevCodeKeptError extends ErrorFactory({
  name: "DevCodeKeptError",
  message: ({ imports }) =>
    `production keeps the development branches: import { ${Imports.names(imports).join(", ")} }`,
  fields: ErrorFactory.fields<{ imports: Imports }>(),
}) {}

export class AddsNothingError extends ErrorFactory({
  name: "AddsNothingError",
  message: ({ bundle }) => `${bundle.name} adds nothing to the base, which already holds it`,
  fields: ErrorFactory.fields<{ bundle: Bundle }>(),
}) {}

// oxlint-disable-next-line valof/data-type-outside-valof -- two modes, never more
export type Mode = "production" | "development";
/** Production, then development. */
export const modes: readonly [Mode, Mode] = ["production", "development"];

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
    /** The bundle's imports, over a table of each mode's sizes. */
    render: (build): string => {
      const heads = ["minified", "gzip", "brotli"] as const;
      return pipe(
        [
          ["", ...heads],
          ...modes.map((mode) => [mode, ...heads.map((head) => bytes(build[mode].sizes[head]))]),
        ],
        (rows) => align(rows, ["left", "right", "right", "right"]),
        (rows) => rows.map((cells) => `  ${cells.join("  ")}`),
        (lines) => [`bundle  import { ${Imports.names(build.imports).join(", ")} }`, ...lines],
        (lines) => lines.join("\n"),
      );
    },
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
    budget: (size) =>
      Budget.seal({
        name: size.bundle.base ? size.bundle.name : `added by ${size.bundle.name}`,
        used: size.capped,
        limit: size.bundle.budget,
        unit: "bytes",
      }),
    // An added bundle is budgeted by what it adds to the base.
    amount: (size, value: number): string => (size.bundle.base ? bytes(value) : `+${bytes(value)}`),
    check: (size, base: BuildResult): R.Result<void, AddsNothingError> =>
      size.bundle.base || size.build.production.library !== base.production.library
        ? R.succeed()
        : R.fail(new AddsNothingError({ bundle: size.bundle })),
  }))
  .build();
