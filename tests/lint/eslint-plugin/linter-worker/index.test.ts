import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { LinterWorker, Query } from "../../../../src/lint/eslint-plugin/linter-worker.ts";
import { Project } from "../../../../src/lint/files.ts";

const PATIENCE = 2000;

/** What `worker.ts` beside this file says to a query naming `file`. A failure is thrown. */
const say = (worker: LinterWorker, file: string, text = ""): string | undefined =>
  worker.lint(Query.seal({ project: Project.seal([]), file, text }))[0]?.message;

test("asks once for the same query in one tick, and again after it", async () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  expect(say(worker, "count")).toBe("asked 1");
  expect(say(worker, "count")).toBe("asked 1");
  await Promise.resolve();
  expect(say(worker, "count")).toBe("asked 2");
});

test("keeps the last answer for the same file and text alone", () => {
  // In one tick, as a fix pass lints the file again with its fixed text.
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  expect(say(worker, "a.ts", "before")).toBe("answered a.ts before");
  expect(say(worker, "a.ts", "after")).toBe("answered a.ts after");
  expect(say(worker, "b.ts", "after")).toBe("answered b.ts after");
});

// With the caller's extension, which is `.mjs` in the package.
test.each(["ts", "mjs"])(
  "says why the worker did not start, rather than wait out its patience (.%s)",
  (extension) => {
    const beside = new URL(`missing/index.${extension}`, import.meta.url).href;
    const error = thrown(() => say(new LinterWorker(beside, PATIENCE), "after"));
    expect(error.message).toMatch(/^valof-lint: the worker did not start: /);
    expect(error.message).toContain(`missing/worker.${extension}`);
  },
);

test("stops a wedged worker, and asks a new one next", async () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  const dir = mkdtempSync(join(tmpdir(), "valof-linter-worker-"));
  try {
    const count = join(dir, "count");
    expect(() => say(worker, "wedge", count)).toThrow(
      `valof-lint: no answer in ${PATIENCE / 1000}s`,
    );

    await pause();
    const stopped = readFileSync(count, "utf8");
    await pause();
    expect(Number(stopped)).toBeGreaterThan(0);
    expect(readFileSync(count, "utf8")).toBe(stopped);

    expect(say(worker, "after")).toBe("answered after");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("throws what the worker makes of a failure, in the answer or in sending it", () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  expect(thrown(() => say(worker, "reject")).message).toBe("failed: Error: rejected");
  expect(thrown(() => say(worker, "uncloneable")).message).toMatch(/^failed: DataCloneError/);
});

const pause = () => new Promise((done) => setTimeout(done, 200));

/** The error `act` throws. A host reads the message off an `Error`, so anything else fails. */
function thrown(act: () => unknown): Error {
  try {
    act();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`threw ${String(error)}, not an Error`);
  }
  throw new Error("threw nothing");
}
