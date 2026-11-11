import { extname } from "node:path";
import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from "node:worker_threads";

import type { Query, Reply } from "./messages.ts";

/**
 * The worker that lints, asked from a rule and blocked on until it answers.
 *
 * `lint` is async, and a rule is not: `create` returns a visitor, and a visitor cannot be async. So
 * the run happens in a worker, `worker` beside this file, started with its extension: the source
 * tree runs as `.ts` and the package ships `.mjs`. Only the plugin's entry imports this file, so
 * the build keeps it there, beside `worker.mjs`. Imported by the worker as well, it would move to a
 * chunk of its own and look for the worker in the wrong directory.
 *
 * The thread blocks on `Atomics.wait` until the answer is in the port's queue, and
 * `receiveMessageOnPort` reads it without the event loop, which never gets a turn here. The port
 * and the signal go to the worker once, as it starts, so a query is all that each ask sends.
 *
 * The worker starts on the first query and answers the rest. One that does not answer within
 * `patience` milliseconds is stopped, and the next query starts another: a worker still busy would
 * leave every later query waiting behind it. The default is long enough that no run reaches it,
 * short enough that a wedged worker still says so.
 */
export class LinterWorker {
  readonly #script: URL;
  readonly #patience: number;
  #worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;

  constructor(
    script = new URL(`./worker${extname(import.meta.url)}`, import.meta.url),
    patience = 60_000,
  ) {
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
