import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Result as R } from "@praha/byethrow";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";

import { Bundle, Imports } from "./bundle.ts";
import { ClaimedFile, Claims } from "./claims.ts";
import { SizeReport } from "./index.ts";
import { Build, BuildResult, BundleSize, Sizes } from "./measure/index.ts";
import { Measurement } from "./suite.ts";

let directory: string;
let fresh: Claims;
let stale: Claims;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "valof-size-test-"));
  await mkdir(join(directory, "docs/src"), { recursive: true });
  await writeFile(
    join(directory, "docs/src/introduction.md"),
    "<!-- valof-minimal-bundle-size -->1000 B gzipped<!-- /valof-minimal-bundle-size -->\n",
  );
  const root = pathToFileURL(`${directory}/`);
  const files = [ClaimedFile.Markdown.create({ path: "docs/src/introduction.md", release: false })];
  fresh = R.unwrap(await Claims.read(files, 1000, false, root));
  stale = R.unwrap(await Claims.read(files, 900, false, root));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const build = (gzip: number) => {
  const mode = Build.seal({ sizes: Sizes.seal({ minified: 0, gzip, brotli: 0 }), library: 0 });
  return BuildResult.seal({
    imports: Imports.seal({}),
    readsNodeEnv: false,
    production: mode,
    development: mode,
  });
};

const report = (gzip: number, claims: Claims) => {
  const base = build(gzip);
  const val = Bundle.seal({ name: "Val", base: true, imports: Imports.seal({}), budget: 1024 });
  return SizeReport.seal({
    measurement: Measurement.seal({
      base,
      bundles: [BundleSize.create(val, base, base)],
      separateBase: [],
    }),
    claims,
    release: false,
    write: false,
  });
};

test("fails on a bundle over its budget and on a stale claim, naming each", () => {
  const named = (gzip: number, claims: Claims) =>
    SizeReport.render(report(gzip, claims))
      .split("\n")
      .filter((line) => line.startsWith("over budget") || line.startsWith("stale claim"));
  const outdated =
    "stale claim: docs/src/introduction.md says 1000 B gzipped, measured 900 B gzipped. Rerun with --write.";

  expect(SizeReport.passed(report(1100, stale))).toBe(false);
  expect(named(1100, stale)).toEqual(["over budget: Val is 1.07 kB, budget 1.00 kB", outdated]);
  expect(SizeReport.passed(report(1000, stale))).toBe(false);
  expect(named(1000, stale)).toEqual([outdated]);
  expect(SizeReport.passed(report(1000, fresh))).toBe(true);
  expect(named(1000, fresh)).toEqual([]);
});
