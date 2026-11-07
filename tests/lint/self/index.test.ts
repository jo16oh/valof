import { globSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { lint } from "../../../src/lint/index.ts";
import { root } from "../support.ts";

// The linter and the scripts use the library, so the linter's rules apply to them too.
test("finds nothing in valof's own source and scripts", async () => {
  const files = globSync(["src/**/*.ts", "scripts/**/*.ts"], {
    cwd: root,
    exclude: (file) => file.includes("fixtures"),
  });
  const findings = await lint(files.map((file) => root + file));
  expect(findings.map(({ file, at: { line }, kind }) => `${file}:${line} ${kind}`)).toEqual([]);
});
