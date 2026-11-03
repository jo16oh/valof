import { Result as R } from "@praha/byethrow";

import type { Finding } from "./rules/index.ts";
import { run } from "./run.ts";

export { RULES, kinds, isKind, type Finding } from "./rules/index.ts";
export { MissingParserError, MissingTypeScriptError } from "./errors.ts";
/** What `model-only-in-valof` reports beyond what it always reports. Each defaults to `false`. */
export type ModelSettings = {
  /** Report a class, declared or as an expression. */
  classes?: boolean;
  /** Report a data shape in a type parameter's constraint: `<T extends { id: string }>`. */
  constraints?: boolean;
  /** Report a type taken out of a value: `typeof`, `ReturnType`, `Awaited` and the like. */
  extraction?: boolean;
};

export type Options = {
  /** The rules that are off unless named here, with their settings. */
  enable?: { "model-only-in-valof"?: ModelSettings };
  /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
  skip?: ReadonlySet<string>;
  /**
   * Files to report on, as paths resolved against the same root. Everything else in `files` is
   * still scanned.
   *
   * Three rules need a second file to say anything: a duplicate brand needs the other alias, a
   * second name needs the Val alias, and a member is read from wherever it is read. Narrowing the
   * run instead of the report turns those into silence, and turns a directive that is doing its
   * job into an `unused-disable`.
   */
  report?: ReadonlySet<string>;
  /**
   * Source to read instead of the file on disk, keyed by path.
   *
   * For an editor: the buffer the user is typing in has not been saved, and a run over what disk
   * holds reports on the file as it was. A path here that is not in `files` is scanned all the
   * same, and the file need not exist.
   */
  overlay?: ReadonlyMap<string, string>;
};

/**
 * Reports what the type checker cannot. See {@link RULES} for what each rule looks for.
 *
 * Throws {@link MissingParserError} when oxc-parser is not installed, and
 * {@link MissingTypeScriptError} when a rule needs TypeScript and it is not installed.
 */
export const lint = async (files: readonly string[], options: Options = {}): Promise<Finding[]> =>
  R.unwrap(await run(files, options));
