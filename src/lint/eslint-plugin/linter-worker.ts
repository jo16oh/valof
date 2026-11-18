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

import { Val } from "../../lib/index.ts";
import { pipe } from "../../shared/pipe/index.ts";
import type { Finding } from "../rules/index.ts";
import { Project } from "../shared/files.ts";
import { DataTypeSettings, Overlay } from "../shared/options.ts";

/**
 * Starts the worker on its script, and answers every query with why when the script does not load.
 * The caller's thread is blocked, so it never hears the worker's `error` event, and would wait out
 * its patience. The failure is what `R.fail` makes, written out because this runs as source in the
 * worker. It is a module rather than `eval`, because an `eval` worker skips the host's `--import`
 * preloads and the loaders they register.
 */
const START = new URL(
  `data:text/javascript,${encodeURIComponent(`
import { parentPort, workerData } from "node:worker_threads";
import(workerData.script).catch((error) => {
  const { port, signal } = workerData;
  parentPort.on("message", () => {
    port.postMessage({ type: "Failure", error: { message: "valof-lint: the worker did not start: " + String(error) } });
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  });
});
`)}`,
);

/** What the worker answers: the findings, or why it has none. */
// valof-lint-disable-next-line no-data-type-outside-valof -- byethrow's Result, sent as is
export type Reply = R.Result<Finding[], WorkerFailure>;

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
    overlay: Overlay;
    /**
     * The settings of `no-data-type-outside-valof`. It always runs here, because the host reports it
     * only where the project turned it on.
     */
    model: DataTypeSettings;
    /**
     * Whether disk holds the buffer, so the worker may keep its scans for the next process.
     * A file outside the project is passed as a buffer even when disk holds it.
     */
    saved: boolean;
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
                "no-data-type-outside-valof"?: Parameters<typeof DataTypeSettings.create>[0];
              };
            }
          | undefined;
      },
      project: Project,
    ): Query => {
      const file = resolve(filename);
      const saved = readSaved(file) === text;
      const listed = project.some((path) => path === file);

      return seal({
        project,
        overlay: Overlay.fromEntries(saved && listed ? [] : [[file, text]]),
        model: DataTypeSettings.create(settings?.valof?.["no-data-type-outside-valof"]),
        saved,
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
 * Why the worker has no findings: the message to throw. A message rather than the error, since an
 * error's class does not survive the copy between threads.
 */
export type WorkerFailure = Val<"WorkerFailure", { message: string }>;
export const WorkerFailure = Val.companion<WorkerFailure>().build();

/**
 * The worker that lints, asked from a rule and blocked on until it answers, because a visitor
 * cannot be async and `lint` is. The caller passes its own `import.meta.url`, since this file lands
 * in whichever chunk the build picks. The worker is `worker/main` beside the caller, with the
 * caller's extension.
 *
 * The thread blocks on `Atomics.wait`, and `receiveMessageOnPort` reads the answer without the event
 * loop. The worker starts on the first query, or earlier through {@link LinterWorker.start}. One that
 * does not answer within `patience` milliseconds is stopped, and the next query starts another,
 * since a busy worker would hold every later query behind it.
 *
 * An answer is kept under the query and the path, modification time and size of each project file.
 * Every file of a batch whose buffer disk holds asks the same query, so the batch costs one run. The
 * last answer with a buffer is kept apart from the last without, so a file being edited does not
 * replace the answer every other file shares.
 */
export class LinterWorker {
  readonly #script: URL;
  readonly #patience: number;
  #worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;
  #saved: { key: string; findings: readonly Finding[] } | undefined;
  #edited: { key: string; findings: readonly Finding[] } | undefined;

  constructor(beside: string, patience = 60_000) {
    this.#script = new URL(`./worker/main${extname(beside)}`, beside);
    this.#patience = patience;
  }

  /** The findings for the query. Throws the message the worker failed with. */
  lint(query: Query): readonly Finding[] {
    const key = `${Project.stat(query.project)}\n${Query.key(query)}`;
    const bufferless = Object.keys(query.overlay).length === 0;
    const kept = bufferless ? this.#saved : this.#edited;
    if (kept?.key === key) return kept.findings;

    const findings = pipe(
      query,
      (asked) => this.#ask(asked),
      R.mapError(({ message }) => new Error(message)),
      R.unwrap(),
    );
    if (bufferless) {
      this.#saved = { key, findings };
    } else {
      this.#edited = { key, findings };
    }

    return findings;
  }

  /**
   * Starts the worker, if it is not running, so it imports the linter while the caller does other
   * work.
   */
  start(): { thread: Worker; port: MessagePort; signal: Int32Array } {
    if (this.#worker) return this.#worker;

    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const thread = new Worker(START, {
      workerData: { port: port2, signal, script: this.#script.href },
      transferList: [port2],
      // As in the shipped package, which builds the linter with NODE_ENV=production. The linter
      // declares every Val it builds from the parser's output, so valof's development checks
      // guard no user code. From source, they take most of the time converting the AST.
      env: { ...process.env, NODE_ENV: "production" },
    });
    // The host decides when it exits. A linter waiting on its own worker would never finish.
    thread.unref();
    this.#worker = { thread, port: port1, signal };

    return this.#worker;
  }

  #ask(query: Query): Reply {
    const { thread, port, signal } = this.start();
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
   * Answers what a `LinterWorker` asks, in the worker. `fail` makes the answer when `respond` throws
   * or its answer cannot be sent, since the waiting thread has to receive something.
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

/** What disk holds of the file, or `undefined` where it holds nothing. */
function readSaved(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
