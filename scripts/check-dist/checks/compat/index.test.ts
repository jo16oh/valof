import { Result as R } from "@praha/byethrow";
import { expect, test, vi } from "vite-plus/test";

import { CompatCheck, CompatReport, LineResult } from "./index.ts";

vi.mock(import("../../../pin-valof/index.ts"), () => ({
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
  const result = await CompatCheck.run(CompatCheck.create({ release: true }));
  expect(R.isFailure(result) && result.error.message).toBe(
    "valof 8d32b2a builds a different dist; run `vp run pin-valof origin/main`",
  );
  expect(writes).toEqual([]);
});

const pin = "8d32b2ae3ab76618b3c577cc19b25da177c4242f";
const passing = LineResult.seal({ version: "5.9.3", failures: [] });
const failing = LineResult.seal({ version: "6.0.3", failures: ["    the declaration changes x"] });

test("fails on each TypeScript line with a failure, naming its version", () => {
  const verdict = CompatReport.verdict(
    CompatReport.seal({ blocks: 1, fixtures: 1, pin, lines: [passing, failing] }),
  );
  expect(
    R.isFailure(verdict) && verdict.error.name === "IncompatibleError" && verdict.error.failed,
  ).toEqual(["6.0.3"]);
  expect(
    R.isSuccess(
      CompatReport.verdict(CompatReport.seal({ blocks: 1, fixtures: 1, pin, lines: [passing] })),
    ),
  ).toBe(true);
});

test("says whether it checked the scripts, or skipped them on a pin that builds another dist", () => {
  const report = (scripts?: number) =>
    CompatReport.render(
      CompatReport.seal({
        blocks: 68,
        fixtures: 2,
        pin,
        ...(scripts === undefined ? {} : { scripts }),
        lines: [failing],
      }),
    );
  expect(report(3).split("\n").slice(0, 4)).toEqual([
    "  68 blocks from the book, 2 fixtures",
    "  3 scripts on valof 8d32b2a",
    "  typescript@6.0.3  fail",
    "    the declaration changes x",
  ]);
  expect(report()).toContain("  scripts skipped: valof 8d32b2a builds a different dist");
});
