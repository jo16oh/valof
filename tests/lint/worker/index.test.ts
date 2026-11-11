import { expect, test } from "vite-plus/test";

import { WorkerClient } from "../../../src/lint/worker.ts";

const script = new URL("answerer.ts", import.meta.url);
const PATIENCE = 2000;

test("asks the same worker again, once it has answered", () => {
  const worker = new WorkerClient<string, string>(script, PATIENCE);
  expect(worker.ask("one")).toBe("answered one");
  expect(worker.ask("two")).toBe("answered two");
});

test("stops a wedged worker, and asks a new one next", async () => {
  const worker = new WorkerClient<string | Int32Array, string>(script, PATIENCE);
  const spins = new Int32Array(new SharedArrayBuffer(4));
  expect(() => worker.ask(spins)).toThrow(`valof-lint: no answer in ${PATIENCE / 1000}s`);

  await pause();
  const stopped = Atomics.load(spins, 0);
  await pause();
  expect(stopped).toBeGreaterThan(0);
  expect(Atomics.load(spins, 0)).toBe(stopped);

  expect(worker.ask("after")).toBe("answered after");
});

test("returns what the worker makes of a failure, in the answer or in sending it", () => {
  const worker = new WorkerClient<string, string>(script, PATIENCE);
  expect(worker.ask("reject")).toBe("failed: Error: rejected");
  expect(worker.ask("uncloneable")).toMatch(/^failed: DataCloneError/);
});

const pause = () => new Promise((done) => setTimeout(done, 200));
