import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

// The rule API is not a contract valof can typecheck against, since neither host is a dependency.
// So both are run for real, over a fixture holding one finding each.

const cwd = fileURLToPath(new URL("fixtures/", import.meta.url));

const run = (bin: string, args: string[]): string => {
  const { stdout, stderr, error } = spawnSync(bin, args, { cwd, encoding: "utf8" });
  if (error) throw error;
  return `${stdout}${stderr}`;
};

/** Both are pinned in `devDependencies`, so the version a finding is asserted against is fixed. */
const bin = (name: string): string =>
  fileURLToPath(new URL(`../../../node_modules/.bin/${name}`, import.meta.url));

test("oxlint runs the plugin, and puts the finding where the finding says", () => {
  const output = run(bin("oxlint"), ["--config", "oxlint.json", "src/order.ts", "src/money.ts"]);
  expect(output).toContain(
    "src/order.ts:6:22: error valof(structural-equals):" +
      " Order.total holds Money, which has its own equals",
  );
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
      ruleId: "valof/unused-member",
      message: "Id.shout is never read",
      line: 3,
      column: 3,
    }),
  ]);
});
