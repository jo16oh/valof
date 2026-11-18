import { ErrorFactory } from "@praha/error-factory";

import type { MissingParserError } from "../parse/parser.ts";

/** `--no-<kind>` with a kind no rule has. */
export class UnknownRuleError extends ErrorFactory({
  name: "UnknownRuleError",
  message: ({ kind, known }) =>
    `valof-lint: no rule called ${JSON.stringify(kind)}\n  known rules: ${known.join(", ")}`,
  fields: ErrorFactory.fields<{ kind: string; known: readonly string[] }>(),
}) {}

/** A setting after `--data-type-outside-valof=` that the rule does not take. */
export class UnknownSettingError extends ErrorFactory({
  name: "UnknownSettingError",
  message: ({ setting, known }) =>
    `valof-lint: no setting called ${JSON.stringify(setting)}\n  known settings: ${known.join(", ")}`,
  fields: ErrorFactory.fields<{ setting: string; known: readonly string[] }>(),
}) {}

/** `--project` as the last argument. */
export class MissingPathError extends ErrorFactory({
  name: "MissingPathError",
  message: ({ flag }) => `valof-lint: --${flag} needs a path`,
  fields: ErrorFactory.fields<{ flag: string }>(),
}) {}

/** An argument starting with `-` that the command does not take, rather than a path read as one. */
export class UnknownOptionError extends ErrorFactory({
  name: "UnknownOptionError",
  message: ({ option }) => `valof-lint: no option called ${JSON.stringify(option)}`,
  fields: ErrorFactory.fields<{ option: string }>(),
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
  | UnknownRuleError
  | UnknownSettingError
  | UnknownOptionError
  | MissingPathError
  | NotAProjectError
  | NoFilesMatchedError;
