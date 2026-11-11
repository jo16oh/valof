import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { LinterWorker } from "../../../../src/lint/eslint-plugin/channel.ts";
import { Query, Reply } from "../../../../src/lint/eslint-plugin/messages.ts";
import { Project } from "../../../../src/lint/files.ts";

const script = new URL("answerer.ts", import.meta.url);
const PATIENCE = 2000;

/** What the answerer says to a query naming `file`. */
const say = (worker: LinterWorker, file: string, text = ""): string =>
  Reply.match(worker.ask(Query.seal({ project: Project.seal([]), file, text })), {
    Found: () => "found",
    Failed: ({ message }) => message,
  });

test("asks the same worker again, once it has answered", () => {
  const worker = new LinterWorker(script, PATIENCE);
  const first = say(worker, "thread");
  expect(first).toMatch(/^thread \d+$/);
  expect(say(worker, "thread")).toBe(first);
});

test("stops a wedged worker, and asks a new one next", async () => {
  const worker = new LinterWorker(script, PATIENCE);
  const dir = mkdtempSync(join(tmpdir(), "valof-channel-"));
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

test("returns what the worker makes of a failure, in the answer or in sending it", () => {
  const worker = new LinterWorker(script, PATIENCE);
  expect(say(worker, "reject")).toBe("failed: Error: rejected");
  expect(say(worker, "uncloneable")).toMatch(/^failed: DataCloneError/);
});

const pause = () => new Promise((done) => setTimeout(done, 200));
