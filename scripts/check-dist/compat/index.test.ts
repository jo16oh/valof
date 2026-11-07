import { Result as R } from "@praha/byethrow";
import { expect, test, vi } from "vite-plus/test";

import { checkCompat, StalePinError } from "./index.ts";

vi.mock(import("../../pin-valof/index.ts"), () => ({
  pinned: async () => "8d32b2ae3ab76618b3c577cc19b25da177c4242f",
  matches: async () => false,
}));

// Records each write instead of making it, so a check that reaches `dist` shows here.
const writes = vi.hoisted((): string[] => []);
vi.mock(import("node:fs/promises"), async (original) => {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      writes.push(`${name} ${String(args[0])}`);
    };
  return {
    ...(await original()),
    rm: record("rm"),
    mkdir: record("mkdir"),
    cp: record("cp"),
    copyFile: record("copyFile"),
    writeFile: record("writeFile"),
  } as typeof import("node:fs/promises");
});

test("a release fails on a pin that builds a different dist, before it copies dist", async () => {
  const result = await checkCompat({ release: true });
  expect(R.isFailure(result) && result.error).toBeInstanceOf(StalePinError);
  expect(R.isFailure(result) && result.error.message).toBe(
    "valof 8d32b2a builds a different dist; run `vp run pin-valof origin/main`",
  );
  expect(writes).toEqual([]);
});
