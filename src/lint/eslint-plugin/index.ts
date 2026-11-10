import { extname, resolve } from "node:path";

import type { Rule } from "eslint";

import { Val } from "../../index.ts";
import { Ask, Reply } from "./messages.ts";
import { expand } from "../files.ts";
import { RULES, type Finding } from "../index.ts";
import { connect } from "../worker.ts";

export default valof();

/**
 * The plugin, with the state its rules share.
 *
 * The host creates every rule once per file, so whatever outlives one file, or is shared by the
 * rules of one file, lives here: the worker, the last answer and the globbed projects.
 */
// What a config file needs of the plugin, written out so ESLint's types stay out of the declaration.
function valof(): {
  meta: { name: string };
  rules: Record<
    string,
    {
      meta: { type: "problem"; docs: { description: string } };
      create(context: unknown): { Program(): void };
    }
  >;
  configs: { recommended: { rules: Record<string, "error" | "warn"> } };
} {
  /**
   * `lint` is async, and a rule is not.
   *
   * `create` returns a visitor, and a visitor cannot be async. So the run happens in a worker,
   * `worker` beside this file. Its extension is this file's own, since the source tree runs as
   * `.ts` and the package ships `.mjs`.
   *
   * The patience is long enough that no run reaches it, short enough that a wedged worker still
   * says so.
   */
  const ask = connect<Ask, Reply>(
    new URL(`./worker${extname(import.meta.url)}`, import.meta.url),
    60_000,
  );

  /**
   * One run per file, however many of the rules are on. The host creates every rule for a file
   * before it walks it, so the `Program` handlers run back to back over the same text, and the
   * ask blocks the thread: nothing runs in between. So the last answer is kept, and the same ask
   * gets it.
   *
   * It is dropped as soon as the stack empties, and not kept for the next pass, because the ask
   * says nothing about the rest of the project: a file saved in another editor tab changes what
   * this file's findings are while its own text is unchanged.
   */
  let last: Answer | undefined;
  const send = (what: Ask): readonly Finding[] => {
    const key = `${what.file}\n${what.text}\n${what.project.join("\n")}`;
    if (last?.key === key) return last.findings;

    const findings = Reply.match(ask(what), {
      Found: ({ findings }) => findings,
      Failed: ({ message }) => {
        throw new Error(message);
      },
    });
    last = Answer.seal({ key, findings });
    queueMicrotask(() => (last = undefined));
    return findings;
  };

  /**
   * The project, globbed once however many files are linted.
   *
   * The host walks the same project file by file, so the glob would otherwise run again for each.
   */
  const projects = new Map<string, string[]>();
  const glob = (given: string | readonly string[]): string[] => {
    const paths = typeof given === "string" ? [given] : [...given];
    const key = paths.join("\n");
    let found = projects.get(key);
    if (!found) {
      // A path starting with `!` is removed from the project, as it is on the command line.
      // Resolved, since the glob that reached a file and the one that excluded it need not be
      // spelled alike.
      const dropped = new Set(
        paths
          .filter(excludes)
          .flatMap((path) => expand(path.slice(1)).map((file) => resolve(file))),
      );
      found = paths
        .filter((path) => !excludes(path))
        .flatMap(expand)
        .map((file) => resolve(file))
        .filter((file) => !dropped.has(file));
      projects.set(key, found);
    }
    return found;
  };

  /** What to ask about the file the host is linting, with the project its settings name. */
  const read = ({
    filename,
    sourceCode: { text },
    settings,
  }: {
    filename: string;
    sourceCode: { text: string };
    // A host may leave the settings out.
    settings: { valof?: { project?: string | readonly string[] } } | undefined;
  }): Ask =>
    Ask.seal({
      project: glob(settings?.valof?.project ?? "src/**/*.ts"),
      file: resolve(filename),
      text,
    });

  return {
    meta: { name: "valof" },
    // One rule per kind, so a project sets the severity of each and turns off what it does not
    // want. They share one run all the same: the linter reports on every kind at once, and `send`
    // passes the same result to each rule of the same file. What a rule adds is which findings it
    // reports.
    rules: Object.fromEntries(
      RULES.map(({ kind, description }) => [
        kind,
        {
          meta: {
            type: "problem" as const,
            docs: { description },
            // The project to read is one setting for all of them, since repeating it per rule
            // lets the copies disagree. See `read`.
            schema: [],
          },
          create: (context: Rule.RuleContext) => ({
            Program(): void {
              for (const finding of send(read(context)))
                if (finding.kind === kind)
                  context.report({
                    loc: Underline.fromFinding(finding, context.sourceCode.text),
                    // No kind in the message: the rule the host names is the kind, and every
                    // host that renders a finding renders the rule name with it.
                    message: finding.message,
                  });
            },
          }),
        },
      ]),
    ),
    configs: {
      /**
       * The whole set, at the severity each rule carries: a finding about code that does nothing
       * warns, and one about code that is wrong errors.
       */
      recommended: {
        // `as const` for the severities: an array literal infers as `string[]`, and an index
        // signature of `string` does not fit the rule map Oxlint's `defineConfig` declares, so
        // `extends: [valof.configs.recommended]` would not typecheck for a caller.
        rules: Object.fromEntries(
          RULES.map(({ kind, warns }) => [`valof/${kind}`, warns ? "warn" : "error"] as const),
        ),
      },
    },
  };
}

/** The findings for one ask, under the key the next ask is compared by. */
type Answer = Val<"Answer", { key: string; findings: Finding[] }>;
const Answer = Val.companion<Answer>().build();

/** A point as ESLint counts it: lines from 1, columns from 0. */
type Point = Val<"Point", { line: number; column: number }>;
const Point = Val.companion<Point>().build();

/**
 * What the underline covers, from the point the finding names.
 *
 * A finding carries one position, and a report drawn from one position underlines one character.
 * So the name at that position is measured here: the linter points at `label`, `Val` or an alias,
 * and the editor should underline the whole of it. Where the position is not on a word, which is
 * the disable comments, the rest of the line stands in.
 */
type Underline = Val<"Underline", { start: Point; end: Point }>;
const Underline = Val.companion<Underline>()
  .implAssoc(({ seal }) => ({
    /** Columns count from 1 in a finding, as an editor shows them, and from 0 in a report. */
    fromFinding: ({ at: { line, column } }: Finding, text: string): Underline => {
      const rest = (text.split("\n")[line - 1] ?? "").slice(column - 1);
      const width = WORD.exec(rest)?.[0].length ?? rest.trimEnd().length;
      return seal({
        start: Point.seal({ line, column: column - 1 }),
        end: Point.seal({ line, column: column - 1 + Math.max(width, 1) }),
      });
    },
  }))
  .build();

/** A word, for the squiggle to cover. Runs of these are what a finding points at. */
const WORD = /^[\p{L}\p{N}_$]+/u;

function excludes(path: string): boolean {
  return path.startsWith("!");
}
