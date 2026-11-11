import type { Rule } from "eslint";

import { AnswerCache, ProjectCache } from "./caches.ts";
import { Query } from "./messages.ts";
import { Underline } from "./underline.ts";
import { Patterns } from "../files.ts";
import { RULES } from "../index.ts";
import { LinterWorker } from "./linter-worker.ts";

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
  const answers = new AnswerCache(new LinterWorker());
  const projects = new ProjectCache();

  return {
    meta: { name: "valof" },
    // One rule per kind, so a project sets the severity of each and turns off what it does not
    // want. They share one run all the same: the linter reports on every kind at once, and `answers`
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
            // lets the copies disagree. See `Patterns.fromSettings`.
            schema: [],
          },
          create: (context: Rule.RuleContext) => ({
            Program(): void {
              const project = projects.glob(Patterns.fromSettings(context.settings));
              for (const finding of answers.send(Query.fromContext(context, project)))
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
