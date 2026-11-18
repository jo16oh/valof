import { spawnSync } from "node:child_process";

import { expect, test } from "vite-plus/test";

import { ROOT } from "./support.ts";

// A rule's test stays green when its fixture uses an API the library no longer has. Type-checking
// the fixtures is what turns a rename in the library into a red test here. A fixture that is
// invalid on purpose says so with `@ts-expect-error`, on a line of its own.
test("type-checks every fixture against the library", () => {
  const { status, stdout } = spawnSync(
    `${ROOT}node_modules/.bin/tsc`,
    ["-p", "src/lint/integration-tests/tsconfig.fixtures.json", "--noEmit"],
    { cwd: ROOT, encoding: "utf8" },
  );
  expect(stdout).toBe("");
  expect(status).toBe(0);
});
