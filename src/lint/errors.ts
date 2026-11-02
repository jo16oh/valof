import { ErrorFactory } from "@praha/error-factory";

/** The install line every message about the missing parser ends with. */
const INSTALL = "  pnpm add -D oxc-parser";

/** oxc-parser is an optional peer dependency, so a run can start without it. */
export class MissingParserError extends ErrorFactory({
  name: "MissingParserError",
  message: `valof-lint needs oxc-parser, which valof does not install for you.\n${INSTALL}`,
}) {}

/**
 * TypeScript 7.1 or later is an optional peer dependency. Only a rule that reads a type needs it,
 * and only where the code gives that rule something to ask.
 */
export class MissingTypeScriptError extends ErrorFactory({
  name: "MissingTypeScriptError",
  message:
    "valof-lint needs TypeScript 7.1 or later to read the annotations here, which valof does not" +
    " install for you.\n  pnpm add -D typescript",
}) {}

/** `--no-<kind>` with a kind no rule has. */
export class UnknownRuleError extends ErrorFactory({
  name: "UnknownRuleError",
  message: ({ kind, known }) =>
    `valof-lint: no rule called ${JSON.stringify(kind)}\n  known rules: ${known.join(", ")}`,
  fields: ErrorFactory.fields<{ kind: string; known: readonly string[] }>(),
}) {}

/** `--project` or `--report-on` as the last argument. */
export class MissingPathError extends ErrorFactory({
  name: "MissingPathError",
  message: ({ flag }) => `valof-lint: --${flag} needs a path`,
  fields: ErrorFactory.fields<{ flag: string }>(),
}) {}

/**
 * A file given as the project. It would narrow the run rather than the report, and keeping those
 * apart is why both exist.
 */
export class NotAProjectError extends ErrorFactory({
  name: "NotAProjectError",
  message: ({ path }) =>
    `valof-lint: the project must be a directory or a glob, and ${JSON.stringify(path)} is` +
    ` neither\n  valof-lint 'src/**/*.ts' ${path}`,
  fields: ErrorFactory.fields<{ path: string }>(),
}) {}

export class NoFilesMatchedError extends ErrorFactory({
  name: "NoFilesMatchedError",
  message: "valof-lint: no files matched",
}) {}

/** What the command reports before exiting 2, because the run never started. */
export type UsageError =
  | MissingParserError
  | MissingTypeScriptError
  | UnknownRuleError
  | MissingPathError
  | NotAProjectError
  | NoFilesMatchedError;
