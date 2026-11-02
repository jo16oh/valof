import { spawnSync } from "node:child_process";

import { expect, test } from "vite-plus/test";

import { root } from "./support.ts";

// A fixture written against an API the library no longer has keeps its rule's test green. Type
// checking them is what turns a rename in the library into a red test here. A fixture that is
// invalid on purpose says so with `@ts-expect-error`, on a line of its own.
test("every fixture type-checks against the library", () => {
  const { status, stdout } = spawnSync(
    `${root}node_modules/.bin/tsc`,
    ["-p", "tests/lint/tsconfig.fixtures.json", "--noEmit"],
    { cwd: root, encoding: "utf8" },
  );
  expect(stdout).toBe("");
  expect(status).toBe(0);
});
