import { expect, test } from "vite-plus/test";

import { Bundle, Imports } from "./bundle.ts";
import { Build, BuildResult, BundleSize, Sizes } from "./measure/index.ts";
import { Measurement } from "./suite.ts";

const build = (names: string[], production: Sizes, development: Sizes) =>
  BuildResult.seal({
    imports: Imports.seal({ "./dist/index.js": names }),
    readsNodeEnv: true,
    production: Build.seal({ sizes: production, library: 0 }),
    development: Build.seal({ sizes: development, library: 0 }),
  });

test("prints each build's sizes, then each bundle's budget", () => {
  const base = build(
    ["Val.companion"],
    Sizes.seal({ minified: 2400, gzip: 1000, brotli: 900 }),
    Sizes.seal({ minified: 3100, gzip: 1250, brotli: 1120 }),
  );
  const enumBuild = build(
    ["Enum.companion"],
    Sizes.seal({ minified: 3500, gzip: 1454, brotli: 1300 }),
    Sizes.seal({ minified: 4200, gzip: 1700, brotli: 1520 }),
  );
  const val = Bundle.seal({ name: "Val", base: true, imports: base.imports, budget: 1024 });
  const enumBundle = Bundle.seal({ name: "Enum", imports: enumBuild.imports, budget: 640 });
  const measurement = Measurement.seal({
    base,
    bundles: [BundleSize.create(val, base, base), BundleSize.create(enumBundle, enumBuild, base)],
    separateBase: [],
  });

  expect(Measurement.render(measurement).split("\n")).toEqual([
    "bundle  import { Val.companion }",
    "               minified     gzip   brotli",
    "  production    2.34 kB   1000 B    900 B",
    "  development   3.03 kB  1.22 kB  1.09 kB",
    "",
    "bundle  import { Enum.companion }",
    "               minified     gzip   brotli",
    "  production    3.42 kB  1.42 kB  1.27 kB",
    "  development   4.10 kB  1.66 kB  1.48 kB",
    "",
    "budget (production gzip)",
    "  Val            1000 B / 1.00 kB  24 B left (2%)",
    "  added by Enum  +454 B /  +640 B  186 B left (29%)",
  ]);
});
