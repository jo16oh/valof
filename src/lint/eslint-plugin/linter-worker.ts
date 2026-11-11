import { readFileSync } from "node:fs";
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
import { Project } from "../files.ts";
import type { Finding } from "../index.ts";
import { DataTypeSettings } from "../options.ts";

/**
 * What the plugin asks the worker: the findings of the whole project, as the host's buffer of one
 * file has it.
 */
export type Query = Val<
  "Query",
  {
    /** The project files scanned together, absolute. */
    project: Project;
    /**
     * The buffer of the file being linted, keyed by its path, where disk does not hold it or the
     * project leaves the file out. Empty otherwise, so every file of a batch asks the same.
     */
    overlay: Record<string, string>;
    /**
     * The settings of `data-type-outside-valof`. It always runs here, because the host reports it
     * only where the project turned it on.
     */
    model: DataTypeSettings;
  }
>;
export const Query = Val.companion<Query>()
  .implAssoc(({ seal }) => ({
    /** What to ask about the file the host is linting. Reads the file, to compare the buffer. */
    read: (
      {
        filename,
        sourceCode: { text },
        settings,
      }: {
        filename: string;
        sourceCode: { text: string };
        // A host may leave the settings out.
        settings:
          | {
              valof?: {
                "data-type-outside-valof"?: Parameters<typeof DataTypeSettings.create>[0];
              };
            }
          | undefined;
      },
      project: Project,
    ): Query => {
      const file = resolve(filename);
      const saved = project.some((path) => path === file) && readSaved(file) === text;

      return seal({
        project,
        overlay: saved ? {} : { [file]: text },
        model: DataTypeSettings.create(settings?.valof?.["data-type-outside-valof"]),
      });
    },
  }))
  .impl(() => ({
    /** The same project, buffer and settings give the same key. */
    key: ({ project, overlay, model }): string =>
      JSON.stringify([project, Object.entries(overlay), model]),
  }))
  .build();

/**
 * What the worker answers: the findings, or the message to throw. A message rather than the error,
 * since an error's class does not survive the copy between threads.
 */
// valof-lint-disable-next-line data-type-outside-valof -- byethrow's Result, sent as is
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
 * One run per project state, however many files and rules ask. Each answer is kept, keyed by the
 * query and by the path, modification time and size of each project file, so a file saved in
 * another editor tab still changes the key. Every file of a batch whose buffer disk holds asks the
 * same query, so the batch costs one run.
 *
 * Two answers are kept: the last for a query with no buffer, and the last for one with a buffer.
 * A file outside the project, or one being edited, then does not replace the answer every other
 * file shares.
 */
export class LinterWorker {
  readonly #script: URL;
  readonly #patience: number;
  #worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;
  #saved: { key: string; findings: readonly Finding[] } | undefined;
  #edited: { key: string; findings: readonly Finding[] } | undefined;

  constructor(beside: string, patience = 60_000) {
    this.#script = new URL(`./worker${extname(beside)}`, beside);
    this.#patience = patience;
  }

  /** The findings for the query. Throws the message the worker failed with. */
  lint(query: Query): readonly Finding[] {
    const key = `${Project.stat(query.project)}\n${Query.key(query)}`;
    const saved = Object.keys(query.overlay).length === 0;
    const kept = saved ? this.#saved : this.#edited;
    if (kept?.key === key) return kept.findings;

    const findings = pipe(
      query,
      (asked) => this.#ask(asked),
      R.mapError((message) => new Error(message)),
      R.unwrap(),
    );
    if (saved) this.#saved = { key, findings };
    else this.#edited = { key, findings };

    return findings;
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

/** What disk holds of the file, or `undefined` where it holds nothing. */
function readSaved(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
