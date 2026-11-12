import { Result as R } from "@praha/byethrow";
import { expect, test } from "vite-plus/test";

import { Bundle, Imports } from "./bundle.ts";
import { Claims } from "./claims.ts";
import { SizeReport } from "./index.ts";
import { Build, BuildResult, BundleSize, Sizes } from "./measure/index.ts";
import { Measurement } from "./suite.ts";

const build = (gzip: number) => {
  const mode = Build.seal({ sizes: Sizes.seal({ minified: 0, gzip, brotli: 0 }), library: 0 });
  return BuildResult.seal({
    imports: Imports.seal({}),
    readsNodeEnv: false,
    production: mode,
    development: mode,
  });
};

const report = (gzip: number) => {
  const base = build(gzip);
  const val = Bundle.seal({ name: "Val", base: true, imports: Imports.seal({}), budget: 1024 });
  return SizeReport.seal({
    measurement: Measurement.seal({
      base,
      bundles: [BundleSize.create(val, base, base)],
      separateBase: [],
    }),
    claims: Claims.seal({ size: "1 kB gzipped", claims: [] }),
    release: false,
    write: false,
  });
};

test("fails on a bundle over its budget, naming it", () => {
  const verdict = SizeReport.verdict(report(1025));
  expect(R.isFailure(verdict) && verdict.error.message).toBe(
    "over budget: Val is 1.00 kB, budget 1.00 kB",
  );
  expect(R.isSuccess(SizeReport.verdict(report(1024)))).toBe(true);
});
