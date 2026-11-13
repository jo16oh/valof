import { Val } from "#valof";
import { Imports, type Bundle } from "../bundle.ts";
import { Budget } from "../../budget.ts";
import { align, bytes } from "../../report.ts";

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
    /** A line where production keeps the development branches the library reads. */
    problems: (build): string[] =>
      !build.readsNodeEnv || build.production.sizes.minified !== build.development.sizes.minified
        ? []
        : [
            `production keeps the development branches: import { ${Imports.names(build.imports).join(", ")} }`,
          ],
    /** The bundle's imports, over a table of each mode's sizes. */
    render: (build): string => {
      const heads = ["minified", "gzip", "brotli"] as const;
      const rows = [
        ["", ...heads],
        ...modes.map((mode) => [mode, ...heads.map((head) => bytes(build[mode].sizes[head]))]),
      ];
      const lines = align(rows, ["left", "right", "right", "right"]).map(
        (cells) => `  ${cells.join("  ")}`,
      );

      return [`bundle  import { ${Imports.names(build.imports).join(", ")} }`, ...lines].join("\n");
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
    /** A line where an added bundle's library is the base's, so it measures nothing. */
    problems: (size, base: BuildResult): string[] =>
      size.bundle.base || size.build.production.library !== base.production.library
        ? []
        : [`${size.bundle.name} adds nothing to the base, which already holds it`],
  }))
  .build();
