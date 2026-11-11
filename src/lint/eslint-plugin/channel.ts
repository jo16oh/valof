import {
  MessageChannel,
  parentPort,
  receiveMessageOnPort,
  Worker,
  workerData,
  type MessagePort,
} from "node:worker_threads";

import type { Query, Reply } from "./messages.ts";

/**
 * Asks a worker running `script` and blocks until it answers, for a caller that cannot be async.
 *
 * The thread blocks on `Atomics.wait` until the answer is in the port's queue, and
 * `receiveMessageOnPort` reads it without the event loop, which never gets a turn here. The port
 * and the signal go to the worker once, as it starts, so a query is all that each ask sends.
 *
 * The worker starts on the first query and answers the rest. One that does not answer within
 * `patience` milliseconds is stopped, and the next query starts another: a worker still busy would
 * leave every later query waiting behind it.
 */
export class LinterWorker {
  readonly #script: URL;
  readonly #patience: number;
  #worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;

  constructor(script: URL, patience: number) {
    this.#script = script;
    this.#patience = patience;
  }

  ask(query: Query): Reply {
    if (!this.#worker) {
      const { port1, port2 } = new MessageChannel();
      const signal = new Int32Array(new SharedArrayBuffer(4));
      const thread = new Worker(this.#script, {
        workerData: { port: port2, signal },
        transferList: [port2],
      });
      // The host decides when it exits. A linter waiting on its own worker would never finish.
      thread.unref();
      this.#worker = { thread, port: port1, signal };
    }

    const { thread, port, signal } = this.#worker;
    Atomics.store(signal, 0, 0);
    thread.postMessage(query);
    if (Atomics.wait(signal, 0, 0, this.#patience) === "timed-out") {
      void thread.terminate();
      this.#worker = undefined;
      throw new Error(`valof-lint: no answer in ${this.#patience / 1000}s`);
    }

    const reply = receiveMessageOnPort(port);
    if (!reply) throw new Error("valof-lint: the worker answered nothing");
    return reply.message as Reply;
  }
}

/**
 * Answers what {@link LinterWorker} asks, in the worker.
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
