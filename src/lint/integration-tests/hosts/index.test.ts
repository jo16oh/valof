import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { Linter } from "eslint";
import type { OxlintConfig } from "oxlint";
import { expect, expectTypeOf, test } from "vite-plus/test";

import valof from "../../eslint-plugin/index.ts";

// What a host does with the plugin is beyond what a type can check, so both are run for real, over
// a fixture holding one finding each.

const CWD = fileURLToPath(new URL("fixtures/", import.meta.url));

function run(bin: string, args: string[]): string {
  const { stdout, stderr, error } = spawnSync(bin, args, { cwd: CWD, encoding: "utf8" });
  if (error) throw error;
  return `${stdout}${stderr}`;
}

/** Both are pinned in `devDependencies`, so the version a finding is asserted against is fixed. */
function bin(name: string): string {
  return fileURLToPath(new URL(`../../../../node_modules/.bin/${name}`, import.meta.url));
}

// Asked for as JSON, like ESLint below: what the default reporter draws is the terminal's, and
// the same finding comes out as one line here and as a framed excerpt there.
test("oxlint runs the plugin, and puts the finding where the finding says", () => {
  const output = run(bin("oxlint"), [
    "--threads",
    "1",
    "--format",
    "json",
    "--config",
    "oxlint.json",
    "src/app.js",
  ]);
  const { diagnostics } = JSON.parse(output) as {
    diagnostics: Record<string, unknown>[];
  };
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: "valof(no-unused-member)",
      message: "Id.shout is never read",
      filename: "src/app.js",
      labels: [{ span: expect.objectContaining({ line: 3, column: 3 }) }],
    }),
  ]);
});

test("eslint runs the same plugin", () => {
  const output = run(bin("eslint"), [
    "--no-config-lookup",
    "--config",
    "eslint.config.mjs",
    "--format",
    "json",
    "src/app.js",
  ]);
  const [file] = JSON.parse(output) as { messages: Record<string, unknown>[] }[];
  expect(file?.messages).toEqual([
    expect.objectContaining({
      ruleId: "valof/no-unused-member",
      message: "Id.shout is never read",
      line: 3,
      column: 3,
    }),
  ]);
});

// The fixture configs are JavaScript, so the hosts never see the plugin's type.
test("a config file in TypeScript takes the plugin", () => {
  expectTypeOf({ plugins: { valof }, ...valof.configs.recommended }).toExtend<Linter.Config>();
  expectTypeOf({ extends: [valof.configs.recommended] }).toExtend<OxlintConfig>();
});
