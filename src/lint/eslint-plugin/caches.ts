import { pipe } from "../../shared/pipe/index.ts";
import { Answer, type Query, Reply } from "./messages.ts";
import { Patterns, type Project } from "../files.ts";
import type { Finding } from "../index.ts";
import type { LinterWorker } from "./linter-worker.ts";

/**
 * The worker's answer, asked once per file, however many of the rules are on. The host creates
 * every rule for a file before it walks it, so the `Program` handlers run back to back over the
 * same text, and asking blocks the thread: nothing runs in between. So the last answer is kept, and
 * the same query gets it.
 *
 * It is dropped as soon as the stack empties, and not kept for the next pass, because the query
 * says nothing about the rest of the project: a file saved in another editor tab changes what this
 * file's findings are while its own text is unchanged.
 */
export class AnswerCache {
  readonly #worker: LinterWorker;
  #last: Answer | undefined;

  constructor(worker: LinterWorker) {
    this.#worker = worker;
  }

  send(query: Query): readonly Finding[] {
    const key = `${query.file}\n${query.text}\n${query.project.join("\n")}`;
    if (this.#last?.key === key) return this.#last.findings;

    const findings = pipe(
      query,
      (asked) => this.#worker.ask(asked),
      Reply.match({
        Found: ({ findings }) => findings,
        Failed: ({ message }) => {
          throw new Error(message);
        },
      }),
    );
    this.#last = Answer.seal({ key, findings });
    queueMicrotask(() => (this.#last = undefined));
    return findings;
  }
}

/**
 * Each project, globbed once however many files are linted.
 *
 * The host walks the same project file by file, so the glob would otherwise run again for each.
 */
export class ProjectCache {
  readonly #projects = new Map<string, Project>();

  glob(patterns: Patterns): Project {
    const key = Patterns.key(patterns);
    let found = this.#projects.get(key);
    if (!found) this.#projects.set(key, (found = Patterns.glob(patterns)));
    return found;
  }
}
