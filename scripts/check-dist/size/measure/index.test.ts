import { expect, test } from "vite-plus/test";

import { Bundle, Imports } from "../bundle.ts";
import { Build, BuildResult, BundleSize, Sizes } from "./index.ts";

const build = (gzip: number) => {
  const mode = Build.seal({ sizes: Sizes.seal({ minified: 0, gzip, brotli: 0 }), library: 0 });
  return BuildResult.seal({
    imports: Imports.seal({}),
    readsNodeEnv: false,
    production: mode,
    development: mode,
  });
};

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
