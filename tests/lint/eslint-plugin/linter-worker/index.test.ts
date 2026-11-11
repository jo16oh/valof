import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { LinterWorker } from "../../../../src/lint/eslint-plugin/linter-worker.ts";
import { Query } from "../../../../src/lint/eslint-plugin/messages.ts";
import { Project } from "../../../../src/lint/files.ts";

const script = new URL("answerer.ts", import.meta.url);
const PATIENCE = 2000;

/** What the answerer says to a query naming `file`. A failure is thrown. */
const say = (worker: LinterWorker, file: string, text = ""): string | undefined =>
  worker.lint(Query.seal({ project: Project.seal([]), file, text }))[0]?.message;

test("asks the same worker again, once it has answered", () => {
  const worker = new LinterWorker(script, PATIENCE);
  // Two texts, so the second query is not the first one's kept answer.
  const first = say(worker, "thread", "one");
  expect(first).toMatch(/^thread \d+$/);
  expect(say(worker, "thread", "two")).toBe(first);
});

test("keeps the last answer for the same file and text alone", () => {
  // In one tick, as a fix pass lints the file again with its fixed text.
  const worker = new LinterWorker(script, PATIENCE);
  expect(say(worker, "a.ts", "before")).toBe("answered a.ts before");
  expect(say(worker, "a.ts", "after")).toBe("answered a.ts after");
  expect(say(worker, "b.ts", "after")).toBe("answered b.ts after");
});

test("stops a wedged worker, and asks a new one next", async () => {
  const worker = new LinterWorker(script, PATIENCE);
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
  const worker = new LinterWorker(script, PATIENCE);
  expect(() => say(worker, "reject")).toThrow("failed: Error: rejected");
  expect(() => say(worker, "uncloneable")).toThrow(/^failed: DataCloneError/);
});

const pause = () => new Promise((done) => setTimeout(done, 200));
