import { expect, test } from "vite-plus/test";

import { cli } from "./support.ts";

// The package linting itself. Not about the command: a finding here means `src/` grew one, which
// `vp check` cannot see, since the rules are about `valof` usage rather than about TypeScript.
test("has nothing to report about the package's own sources", () => {
  const { status, stdout } = cli();
  expect([status, stdout]).toEqual([0, ""]);
});
