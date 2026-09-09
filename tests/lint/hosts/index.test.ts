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

// Asked for as JSON, like ESLint below: what the default reporter draws is the terminal's, and
// the same finding comes out as one line here and as a framed excerpt there.
test("oxlint runs the plugin, and puts the finding where the finding says", () => {
  const output = run(bin("oxlint"), [
    // One thread. Each reserves around 6 GB of address space, and Linux refuses to fork a
    // process whose mapping runs that far past the machine's memory, so the worker's
    // `tsc --lsp` never starts: every file comes back as `spawn ENOMEM` instead. The cap comes
    // off once https://github.com/oxc-project/oxc/issues/20331 lands.
    "--threads",
    "1",
    "--format",
    "json",
    "--config",
    "oxlint.json",
    "src/order.ts",
    "src/money.ts",
  ]);
  const { diagnostics } = JSON.parse(output) as {
    diagnostics: Record<string, unknown>[];
  };
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: "valof(structural-equals)",
      message: "Order.total holds Money, which has its own equals",
      filename: "src/order.ts",
      labels: [{ span: expect.objectContaining({ line: 6, column: 22 }) }],
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
      ruleId: "valof/unused-member",
      message: "Id.shout is never read",
      line: 3,
      column: 3,
    }),
  ]);
});
