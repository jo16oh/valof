import { describe, expect, test } from "vite-plus/test";

import { Bundle, Imports } from "../bundle.ts";
import { Build, BuildResult, BundleSize, Sizes } from "./index.ts";

// Development is twice the size, so a budget read from it shows.
function build(gzip: number) {
  const mode = (gzip: number) =>
    Build.seal({ sizes: Sizes.seal({ minified: 0, gzip, brotli: 0 }), library: 0 });
  return BuildResult.seal({
    imports: Imports.seal({}),
    readsNodeEnv: false,
    production: mode(gzip),
    development: mode(gzip * 2),
  });
}

test("budgets a base bundle by its size, and any other by what it adds", () => {
  const base = build(1000);
  const val = Bundle.seal({ name: "Val", base: true, imports: Imports.seal({}), budget: 1024 });
  const enumBundle = Bundle.seal({ name: "Enum", imports: Imports.seal({}), budget: 500 });

  expect(BundleSize.budget(BundleSize.create(val, base, base))).toEqual({
    name: "Val",
    used: 1000,
    limit: 1024,
    unit: "bytes",
  });
  expect(BundleSize.budget(BundleSize.create(enumBundle, build(1600), base))).toEqual({
    name: "added by Enum",
    used: 600,
    limit: 500,
    unit: "bytes",
  });
});

describe("problems", () => {
  const imports = Imports.seal({ "./dist/index.js": ["Val.companion"] });
  const kept = (readsNodeEnv: boolean, development: number) => {
    const mode = (minified: number) =>
      Build.seal({ sizes: Sizes.seal({ minified, gzip: 0, brotli: 0 }), library: 10 });
    return BuildResult.seal({
      imports,
      readsNodeEnv,
      production: mode(100),
      development: mode(development),
    });
  };

  test("names a build whose production keeps the development branches it reads", () => {
    expect(BuildResult.problems(kept(true, 100))).toEqual([
      "production keeps the development branches: import { Val.companion }",
    ]);
    expect(BuildResult.problems(kept(true, 200))).toEqual([]);
    expect(BuildResult.problems(kept(false, 100))).toEqual([]);
  });

  test("names a bundle that adds nothing to the base", () => {
    const base = kept(false, 200);
    const enumBundle = Bundle.seal({ name: "Enum", imports, budget: 500 });
    const added = (library: number) =>
      BundleSize.create(
        enumBundle,
        BuildResult.seal({
          ...base,
          production: Build.seal({ ...base.production, library }),
        }),
        base,
      );

    expect(BundleSize.problems(added(10), base)).toEqual([
      "Enum adds nothing to the base, which already holds it",
    ]);
    expect(BundleSize.problems(added(20), base)).toEqual([]);
  });
});
