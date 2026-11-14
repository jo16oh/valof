import { resolve } from "node:path";

import type { Rule } from "eslint";

import { RULES } from "../rules/index.ts";
import { Patterns } from "../shared/files.ts";
import { LinterWorker, Query } from "./linter-worker.ts";
import { PassCache } from "./pass-cache.ts";
import { ProjectCache } from "./project-cache.ts";
import { Underline } from "./underline.ts";

/**
 * The plugin, with the state its rules share.
 *
 * The host creates every rule once per file, so whatever outlives one file, or is shared by the
 * rules of one file, lives here: the worker, the answer a file's rules share, and the globbed
 * projects.
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
  const worker = new LinterWorker(import.meta.url);
  const projects = new ProjectCache();
  const pass = new PassCache();

  return {
    meta: { name: "valof" },
    // One rule per kind, so a project sets the severity of each and turns off what it does not
    // want. They share one run all the same: the linter reports on every kind at once, and `worker`
    // passes the same result to every rule of every file. What a rule adds is which findings it
    // reports: its own kind, in its own file.
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
          create: (context: Rule.RuleContext) => {
            // The worker imports the linter while this thread globs the project and reads the file.
            worker.start();
            return {
              Program(): void {
                const file = resolve(context.filename);
                const findings = pass.findings(
                  `${file}\n${JSON.stringify(context.settings)}\n${context.sourceCode.text}`,
                  () =>
                    worker.lint(
                      Query.read(context, projects.glob(Patterns.fromSettings(context.settings))),
                    ),
                );
                for (const finding of findings) {
                  if (finding.kind === kind && resolve(finding.file) === file) {
                    context.report({
                      loc: Underline.fromFinding(finding, context.sourceCode.text),
                      // No kind in the message: the rule the host names is the kind, and every
                      // host that renders a finding renders the rule name with it.
                      message: finding.message,
                    });
                  }
                }
              },
            };
          },
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
          RULES.filter(({ optIn }) => optIn !== true).map(
            ({ kind, warns }) => [`valof/${kind}`, warns ? "warn" : "error"] as const,
          ),
        ),
      },
    },
  };
}

export default valof();
