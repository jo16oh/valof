import { mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { LinterWorker, Query } from "../../../eslint-plugin/linter-worker.ts";
import { FilePath, Project } from "../../../shared/files.ts";
import { DataTypeSettings } from "../../../shared/options.ts";

const PATIENCE = 2000;

/**
 * What `worker/main.ts` beside this file says to a query whose overlay names `file`, over the files in
 * `project`. A failure is thrown.
 */
function say(
  worker: LinterWorker,
  file: string,
  text = "",
  project: readonly string[] = [],
): string | undefined {
  return worker.lint(
    Query.seal({
      project: Project.seal(project.map((path) => FilePath.seal(path))),
      overlay: { [file]: text },
      model: DataTypeSettings.create(),
      saved: false,
    }),
  )[0]?.message;
}

test("asks once for the same query over an unchanged project, however many ticks pass", async () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  expect(say(worker, "count")).toBe("asked 1");
  await pause();
  expect(say(worker, "count")).toBe("asked 1");
});

test("asks again once a project file changes on disk, in its time, its size or its being there", () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  const dir = mkdtempSync(join(tmpdir(), "valof-linter-worker-"));
  try {
    const file = join(dir, "a.ts");
    writeFileSync(file, "a");
    utimesSync(file, 1, 1);
    const asked = (): string | undefined => say(worker, "count", "", [file]);
    expect(asked()).toBe("asked 1");
    expect(asked()).toBe("asked 1");

    // The same size, and only the time differs.
    writeFileSync(file, "b");
    utimesSync(file, 2, 2);
    expect(asked()).toBe("asked 2");

    // The same time, and only the size differs.
    writeFileSync(file, "bb");
    utimesSync(file, 2, 2);
    expect(asked()).toBe("asked 3");

    unlinkSync(file);
    expect(asked()).toBe("asked 4");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps the answer for the buffers disk holds while another buffer is edited", () => {
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  const saved = (): string | undefined =>
    worker.lint(
      Query.seal({
        project: Project.seal([]),
        overlay: {},
        model: DataTypeSettings.create(),
        saved: true,
      }),
    )[0]?.message;
  expect(saved()).toBe("asked 1");
  expect(say(worker, "count", "a")).toBe("asked 2");
  expect(say(worker, "count", "ab")).toBe("asked 3");
  expect(saved()).toBe("asked 1");
});

test("runs with valof's development checks off, like the shipped linter", () => {
  expect(say(new LinterWorker(import.meta.url, PATIENCE), "env")).toBe("production");
});

test("keeps the last answer for the same file and text alone", () => {
  // As a fix pass lints the file again with its fixed text.
  const worker = new LinterWorker(import.meta.url, PATIENCE);
  expect(say(worker, "a.ts", "before")).toBe("answered a.ts before");
  expect(say(worker, "a.ts", "after")).toBe("answered a.ts after");
  expect(say(worker, "b.ts", "after")).toBe("answered b.ts after");
});

function at(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
const PROJECT = Project.seal([at("money.ts"), at("order.ts")].map((file) => FilePath.seal(file)));

/** What the plugin asks about `file`, the buffer holding `text`. */
function read(file: string, text = readFileSync(file, "utf8")): Query {
  return Query.read({ filename: file, sourceCode: { text }, settings: undefined }, PROJECT);
}

test("leaves out a buffer that disk holds, so the files of a batch ask the same", () => {
  expect(read(at("money.ts")).overlay).toEqual({});
  expect(read(at("money.ts")).saved).toBe(true);
  expect(Query.key(read(at("money.ts")))).toBe(Query.key(read(at("order.ts"))));
});

test("passes a buffer that disk does not hold, or a file the project leaves out", () => {
  expect(read(at("money.ts"), "export {};\n").overlay).toEqual({
    [at("money.ts")]: "export {};\n",
  });
  expect(read(at("money.ts"), "export {};\n").saved).toBe(false);
  // Outside the project, but saved.
  const silenced = at("silenced.ts");
  expect(read(silenced).overlay).toEqual({ [silenced]: readFileSync(silenced, "utf8") });
  expect(read(silenced).saved).toBe(true);
});

test("passes the buffer of a project file deleted from disk", () => {
  // The project still lists a file deleted after the last glob, while its buffer is open.
  const dir = mkdtempSync(join(tmpdir(), "valof-linter-worker-"));
  try {
    const file = join(dir, "a.ts");
    const listed = Project.seal([FilePath.seal(file)]);
    const query = Query.read(
      { filename: file, sourceCode: { text: "x" }, settings: undefined },
      listed,
    );
    expect(query.overlay).toEqual({ [file]: "x" });
    expect(query.saved).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// `.mjs`, the package's extension. Every other test passes this `.ts` file, and the worker takes the
// caller's extension.
test("says why the worker did not start, rather than wait out its patience", () => {
  const beside = new URL("missing/index.mjs", import.meta.url).href;
  const error = thrown(() => say(new LinterWorker(beside, PATIENCE), "after"));
  expect(error.message).toMatch(/^valof-lint: the worker did not start: /);
  expect(error.message).toContain("missing/worker/main.mjs");
});

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

function pause() {
  return new Promise((done) => {
    setTimeout(done, 200);
  });
}

/** The error `act` throws. A host reads the message off an `Error`, so anything else fails. */
function thrown(act: () => unknown): Error {
  try {
    act();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`threw ${String(error)}, not an Error`, { cause: error });
  }
  throw new Error("threw nothing");
}
