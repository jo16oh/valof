import { resolve } from "node:path";
import {
  isMainThread,
  MessageChannel,
  parentPort,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from "node:worker_threads";

import { expand } from "./files.ts";
import { lint, NO_TYPESCRIPT, resolver, type Finding, type Kind, type Resolver } from "./index.ts";

/**
 * The slice of the rule API this uses. Written out rather than imported: neither ESLint nor
 * oxlint is a dependency of valof, and both call a rule with the same shape.
 */
type Context = {
  filename: string;
  options: readonly unknown[];
  sourceCode: { text: string };
  report: (report: { loc: { line: number; column: number }; message: string }) => void;
};

type Ask = {
  /** The files the run reads, absolute. The one being linted is among them. */
  files: readonly string[];
  /** What the resolver is keyed on, so a file after the first reuses it. */
  project: readonly string[];
  file: string;
  text: string;
  skip: readonly Kind[];
};

type Reply = { findings: Finding[] } | { failed: string };

type Message = Ask & { port: MessagePort; signal: Int32Array };

/** Long enough that no run reaches it, short enough that a wedged worker still says so. */
const PATIENCE = 60_000;

/**
 * The one rule. Every finding valof-lint has arrives through it.
 *
 * One rule rather than one per kind because a run answers about the whole project at once: six
 * rules would be six runs of the same work. `skip` is how a project leaves a kind out.
 */
const findings = {
  meta: {
    type: "problem",
    docs: { description: "what the type checker cannot catch about Vals" },
    schema: [
      {
        type: "object",
        properties: {
          project: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          skip: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: Context) {
    return {
      Program(): void {
        const { project: given, skip = [] } = (context.options[0] ?? {}) as {
          project?: string | readonly string[];
          skip?: readonly Kind[];
        };
        const file = resolve(context.filename);
        const project = read(given ?? "src/**/*.ts");
        for (const finding of ask({
          files: project.includes(file) ? project : [...project, file],
          project,
          file,
          text: context.sourceCode.text,
          skip,
        }))
          context.report({
            // The finding counts a column from 1, as an editor does. A report counts from 0.
            loc: { line: finding.line, column: finding.column - 1 },
            message: `${finding.kind}: ${finding.message}`,
          });
      },
    };
  },
};

export default { meta: { name: "valof" }, rules: { findings } };

/**
 * The project, globbed once however many files are linted.
 *
 * The host walks the same project file by file, so the glob would otherwise run again for each.
 */
const projects = new Map<string, string[]>();
const read = (given: string | readonly string[]): string[] => {
  const paths = typeof given === "string" ? [given] : [...given];
  const key = paths.join("\n");
  let found = projects.get(key);
  if (!found) projects.set(key, (found = paths.flatMap(expand).map((file) => resolve(file))));
  return found;
};

/**
 * `lint` is async, and a rule is not.
 *
 * The linter waits on a language server in another process, which no rule API has a way to
 * express: `create` returns a visitor, and a visitor returns nothing. So the run happens in a
 * worker and this thread blocks on `Atomics.wait` until the answer is in the port's queue.
 * `receiveMessageOnPort` reads it without the event loop, which never gets a turn here.
 */
let worker: Worker | undefined;
function ask(what: Ask): readonly Finding[] {
  // Started on the first file and kept for the rest, which is what lets the worker hold a
  // resolver: starting one costs about 85 ms against a run's 23 ms.
  if (!worker) {
    worker = new Worker(new URL(import.meta.url));
    // The host decides when it exits. A linter waiting on its own worker would never finish.
    worker.unref();
  }

  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  worker.postMessage({ ...what, port: port2, signal } satisfies Message, [port2]);
  if (Atomics.wait(signal, 0, 0, PATIENCE) === "timed-out")
    throw new Error(`valof-lint: no answer in ${PATIENCE / 1000}s`);

  const reply = receiveMessageOnPort(port1)?.message as Reply | undefined;
  if (!reply) throw new Error("valof-lint: the worker answered nothing");
  if ("failed" in reply) throw new Error(reply.failed);
  return reply.findings;
}

/** The same two mistakes the command explains, in the terms a plugin's reader is in. */
function explain(error: unknown): string {
  const { code } = error as { code?: string };
  if (code === "ERR_MODULE_NOT_FOUND")
    return "valof-lint needs oxc-parser, which valof does not install for you.\n  pnpm add -D oxc-parser";
  if (code === NO_TYPESCRIPT)
    return "valof-lint found no typescript in the project it is linting.\n  pnpm add -D typescript";
  return `valof-lint: ${String(error)}`;
}

// The worker is this file again, so no path has to be guessed for it: the source tree runs as
// `.ts` and the package ships `.mjs`, and `import.meta.url` is already whichever is running.
if (!isMainThread && parentPort) {
  // Held across files, so only the first of them pays for a language server.
  let held: { key: string; types: Resolver } | undefined;

  parentPort.on("message", ({ port, signal, files, project, file, text, skip }: Message) => {
    void (async () => {
      let reply: Reply;
      try {
        const key = project.join("\n");
        if (held?.key !== key) {
          held?.types.close();
          held = { key, types: resolver(process.cwd(), project) };
        }
        reply = {
          findings: await lint(files, {
            types: held.types,
            skip: new Set(skip),
            report: new Set([file]),
            overlay: new Map([[file, text]]),
          }),
        };
      } catch (error) {
        reply = { failed: explain(error) };
      }
      // Whatever happened, the thread waiting on this has to hear it.
      try {
        port.postMessage(reply);
      } catch (error) {
        port.postMessage({ failed: `valof-lint: ${String(error)}` } satisfies Reply);
      }
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    })();
  });
}
