import { extname, resolve } from "node:path";
import {
  MessageChannel,
  parentPort,
  receiveMessageOnPort,
  Worker,
  workerData,
  type MessagePort,
} from "node:worker_threads";

import { Result as R } from "@praha/byethrow";

import { Val } from "../../index.ts";
import { pipe } from "../../shared/pipe/index.ts";
import type { Project } from "../files.ts";
import type { Finding } from "../index.ts";

/** What the plugin asks the worker about one file. */
export type Query = Val<
  "Query",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: Project;
    file: string;
    text: string;
  }
>;
export const Query = Val.companion<Query>()
  .implAssoc(({ seal }) => ({
    /** What to ask about the file the host is linting. */
    fromContext: (
      { filename, sourceCode: { text } }: { filename: string; sourceCode: { text: string } },
      project: Project,
    ): Query => seal({ project, file: resolve(filename), text }),
  }))
  .impl(() => ({
    /** The same file, text and project give the same key. */
    key: ({ file, text, project }): string => `${file}\n${text}\n${project.join("\n")}`,
  }))
  .build();

/**
 * What the worker answers: the findings, or the message to throw. A message rather than the error,
 * since an error's class does not survive the copy between threads.
 */
export type Reply = R.Result<Finding[], string>;

/**
 * The worker that lints, asked from a rule and blocked on until it answers.
 *
 * `lint` is async, and a rule is not: `create` returns a visitor, and a visitor cannot be async. So
 * the run happens in a worker, `worker` beside the caller, which answers with
 * {@link LinterWorker.serve}. The caller passes its own `import.meta.url`, since this file is in
 * whichever chunk the build puts it in, and its own URL says nothing about where the worker is.
 * The worker has the caller's extension: the source tree runs as `.ts` and the package ships `.mjs`.
 *
 * The thread blocks on `Atomics.wait` until the answer is in the port's queue, and
 * `receiveMessageOnPort` reads it without the event loop, which never gets a turn here. The port
 * and the signal go to the worker once, as it starts, so a query is all that each ask sends.
 *
 * The worker starts on the first query and answers the rest. One that does not answer within
 * `patience` milliseconds is stopped, and the next query starts another: a worker still busy would
 * leave every later query waiting behind it. The default is long enough that no run reaches it,
 * short enough that a wedged worker still says so.
 *
 * One run per file, however many of the rules are on. The host creates every rule for a file
 * before it walks it, so the `Program` handlers run back to back over the same text, and asking
 * blocks the thread: nothing runs in between. So the last answer is kept, and the same query gets
 * it. It is dropped as soon as the stack empties, and not kept for the next pass, because the query
 * says nothing about the rest of the project: a file saved in another editor tab changes what this
 * file's findings are while its own text is unchanged.
 */
export class LinterWorker {
  readonly #script: URL;
  readonly #patience: number;
  #worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;
  #lastKey: string | undefined;
  #lastFindings: readonly Finding[] = [];

  constructor(beside: string, patience = 60_000) {
    this.#script = new URL(`./worker${extname(beside)}`, beside);
    this.#patience = patience;
  }

  /** The findings for the query. Throws the message the worker failed with. */
  lint(query: Query): readonly Finding[] {
    const key = Query.key(query);
    if (this.#lastKey === key) return this.#lastFindings;

    this.#lastFindings = pipe(
      query,
      (asked) => this.#ask(asked),
      R.mapError((message) => new Error(message)),
      R.unwrap(),
    );
    this.#lastKey = key;
    queueMicrotask(() => (this.#lastKey = undefined));
    return this.#lastFindings;
  }

  #ask(query: Query): Reply {
    if (!this.#worker) {
      const { port1, port2 } = new MessageChannel();
      const signal = new Int32Array(new SharedArrayBuffer(4));
      const thread = new Worker(START, {
        workerData: { port: port2, signal, script: this.#script.href },
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

  /**
   * Answers what a `LinterWorker` asks, in the worker.
   *
   * `fail` makes the answer when `respond` throws, or when its answer cannot be sent: whatever
   * happened, the thread waiting on this has to receive something.
   */
  static serve(respond: (query: Query) => Promise<Reply>, fail: (error: unknown) => Reply): void {
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
}

/**
 * Starts the worker on its script, and answers every query with why when the script does not load.
 *
 * Without it, a script that fails to load leaves the caller waiting out its patience: the caller's
 * thread is blocked, so it cannot hear the worker's `error` event, and nothing else answers. The
 * failure is what `R.fail` makes, written out because this runs as source in the worker.
 *
 * A module rather than `eval`, because an `eval` worker skips the `--import` preloads the host was
 * started with, and so the loaders they register.
 */
const START = new URL(
  `data:text/javascript,${encodeURIComponent(`
import { parentPort, workerData } from "node:worker_threads";
import(workerData.script).catch((error) => {
  const { port, signal } = workerData;
  parentPort.on("message", () => {
    port.postMessage({ type: "Failure", error: "valof-lint: the worker did not start: " + String(error) });
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  });
});
`)}`,
);
