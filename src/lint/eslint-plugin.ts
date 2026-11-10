import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";

import { Result as R } from "@praha/byethrow";

import type { Rule } from "eslint";

import { Enum, Val } from "../index.ts";
import { expand } from "./files.ts";
import { RULES, type Finding } from "./index.ts";
import { Options } from "./options.ts";
import { run } from "./run.ts";
import { connect, serve } from "./worker.ts";

/** What a config file needs of the plugin, written out so ESLint's types stay out of the declaration. */
const plugin: {
  meta: { name: string };
  rules: Record<
    string,
    {
      meta: { type: "problem"; docs: { description: string } };
      create(context: unknown): { Program(): void };
    }
  >;
  configs: { recommended: { rules: Record<string, "error" | "warn"> } };
} = {
  meta: { name: "valof" },
  // One rule per kind, so a project sets the severity of each and turns off what it does not want.
  // They share one run all the same: the linter reports on every kind at once, and `Ask.send`
  // passes the same result to each rule of the same file. What a rule adds is which findings it
  // reports.
  rules: Object.fromEntries(
    RULES.map(({ kind, description }) => [
      kind,
      {
        meta: {
          type: "problem" as const,
          docs: { description },
          // The project to read is one setting for all of them, since repeating it per rule lets
          // the copies disagree. See `Ask.read`.
          schema: [],
        },
        create: (context: Rule.RuleContext) => ({
          Program(): void {
            for (const finding of Ask.send(Ask.read(context)))
              if (finding.kind === kind)
                context.report({
                  loc: Underline.fromFinding(finding, context.sourceCode.text),
                  // No kind in the message: the rule the host names is the kind, and every host
                  // that renders a finding renders the rule name with it.
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
export default plugin;

type Ask = Val<
  "Ask",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: string[];
    file: string;
    text: string;
  }
>;
const Ask = Val.companion<Ask>()
  .impl(() => {
    /** Long enough that no run reaches it, short enough that a wedged worker still says so. */
    const ask = connect<Ask, Reply>(new URL(import.meta.url), 60_000);
    let last: { key: string; findings: readonly Finding[] } | undefined;
    return {
      /**
       * `lint` is async, and a rule is not.
       *
       * `create` returns a visitor, and a visitor cannot be async. So the run happens in a worker,
       * which is this file again: no path has to be guessed for it, since the source tree runs as
       * `.ts` and the package ships `.mjs`, and `import.meta.url` is already whichever is running.
       *
       * One run per file, however many of the rules are on. The host creates every rule for a file
       * before it walks it, so the `Program` handlers run back to back over the same text, and the
       * ask blocks the thread: nothing runs in between. So the last answer is kept, and the same ask
       * gets it.
       *
       * It is dropped as soon as the stack empties, and not kept for the next pass, because the ask
       * says nothing about the rest of the project: a file saved in another editor tab changes what
       * this file's findings are while its own text is unchanged.
       */
      send: (what): readonly Finding[] => {
        const key = `${what.file}\n${what.text}\n${what.project.join("\n")}`;
        if (last?.key === key) return last.findings;

        const findings = Reply.match(ask(what), {
          Found: ({ findings }) => findings,
          Failed: ({ message }) => {
            throw new Error(message);
          },
        });
        last = { key, findings };
        queueMicrotask(() => (last = undefined));
        return findings;
      },
    };
  })
  .implAssoc(({ seal }) => {
    /**
     * The project, globbed once however many files are linted.
     *
     * The host walks the same project file by file, so the glob would otherwise run again for each.
     */
    const projects = new Map<string, string[]>();
    const excludes = (path: string): boolean => path.startsWith("!");
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

    return {
      /** What to ask about the file the host is linting, with the project its settings name. */
      read: ({
        filename,
        sourceCode: { text },
        settings,
      }: {
        filename: string;
        sourceCode: { text: string };
        // A host may leave the settings out.
        settings: { valof?: { project?: string | readonly string[] } } | undefined;
      }): Ask =>
        seal({
          project: glob(settings?.valof?.project ?? "src/**/*.ts"),
          file: resolve(filename),
          text,
        }),
    };
  })
  .build();

type Reply = Enum<"Reply", { Found: { findings: Finding[] }; Failed: { message: string } }>;
const Reply = Enum.companion<Reply>().build();

if (!isMainThread)
  serve<Ask, Reply>(
    async ({ project, file, text }) => {
      const found = await run(
        project,
        Options.create({ targets: [file], overlay: [[file, text]] }),
      );
      // The message the command prints, so a user of the plugin gets the same instruction.
      return R.isSuccess(found)
        ? Reply.Found.create({ findings: found.value })
        : Reply.Failed.create({ message: found.error.message });
    },
    (error) => Reply.Failed.create({ message: `valof-lint: ${String(error)}` }),
  );

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
  .implAssoc(({ seal }) => {
    /** A word, for the squiggle to cover. Runs of these are what a finding points at. */
    const WORD = /^[\p{L}\p{N}_$]+/u;
    return {
      /** Columns count from 1 in a finding, as an editor shows them, and from 0 in a report. */
      fromFinding: ({ at: { line, column } }: Finding, text: string): Underline => {
        const rest = (text.split("\n")[line - 1] ?? "").slice(column - 1);
        const width = WORD.exec(rest)?.[0].length ?? rest.trimEnd().length;
        return seal({
          start: Point.seal({ line, column: column - 1 }),
          end: Point.seal({ line, column: column - 1 + Math.max(width, 1) }),
        });
      },
    };
  })
  .build();
