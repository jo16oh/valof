import { globSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { Options, lint } from "../../../src/lint/index.ts";
import { ROOT } from "../support.ts";

// The linter and the scripts use the library, so the linter's rules apply to them too.
test("finds nothing in valof's own source and scripts", async () => {
  const files = globSync(["src/**/*.ts", "scripts/**/*.ts"], {
    cwd: ROOT,
    exclude: (file) => file.includes("fixtures"),
  });
  const findings = await lint(files.map((file) => ROOT + file));
  expect(findings.map(({ file, at: { line }, kind }) => `${file}:${line} ${kind}`)).toEqual([]);
});

// Every setting but `classes`: the linter keeps state in classes, and builds its errors as classes.
test("finds no data type outside Valof in the linter", async () => {
  const files = globSync("src/lint/**/*.ts", { cwd: ROOT });
  const findings = await lint(
    files.map((file) => ROOT + file),
    Options.create({
      enable: { "data-type-outside-valof": { constraints: true, extraction: true } },
    }),
  );
  expect(findings.map(({ file, at: { line }, kind }) => `${file}:${line} ${kind}`)).toEqual([]);
});
