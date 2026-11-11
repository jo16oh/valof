import { parentPort, workerData, type MessagePort } from "node:worker_threads";

import type { Query, Reply } from "./messages.ts";

/**
 * Answers what `LinterWorker` asks, in the worker.
 *
 * `fail` makes the answer when `respond` throws, or when its answer cannot be sent: whatever
 * happened, the thread waiting on this has to receive something.
 */
export function serve(
  respond: (query: Query) => Promise<Reply>,
  fail: (error: unknown) => Reply,
): void {
  const { port, signal } = workerData as { port: MessagePort; signal: Int32Array };
  parentPort?.on("message", (query: Query) => {
    void respond(query)
      .catch(fail)
      .then((reply) => {
        try {
          port.postMessage(reply);
        } catch (error) {
          port.postMessage(fail(error));
        }
        Atomics.store(signal, 0, 1);
        Atomics.notify(signal, 0);
      });
  });
}
