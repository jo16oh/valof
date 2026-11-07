import { Result as R } from "@praha/byethrow";

import type { Finding } from "./rules/index.ts";
import { Options } from "./options.ts";
import { run } from "./run.ts";

export { RULES, kinds, isKind, type Finding } from "./rules/index.ts";
export { MissingParserError, MissingTypeScriptError } from "./errors.ts";
export { ModelSettings, Options } from "./options.ts";

/**
 * Reports what the type checker cannot. See {@link RULES} for what each rule looks for.
 *
 * Throws {@link MissingParserError} when oxc-parser is not installed, and
 * {@link MissingTypeScriptError} when a rule needs TypeScript and it is not installed.
 */
export const lint = async (
  files: readonly string[],
  options: Options = Options.create(),
): Promise<Finding[]> => R.unwrap(await run(files, options));
