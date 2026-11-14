import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { fromOxc } from "./ast.ts";

/** oxc-parser is an optional peer dependency, so a run can start without it. */
export class MissingParserError extends ErrorFactory({
  name: "MissingParserError",
  message: `valof-lint needs oxc-parser, which valof does not install for you.\n  pnpm add -D oxc-parser`,
}) {}

/** oxc-parser, loaded. Only {@link Parser.load} makes one. */
export class Parser {
  readonly #oxc: typeof import("oxc-parser");

  private constructor(oxc: typeof import("oxc-parser")) {
    this.#oxc = oxc;
  }

  /**
   * Imports oxc-parser here rather than at the top, because a static import would be hoisted
   * above the caller's own error handling once bundled, turning a missing install into a stack
   * trace instead of an instruction. See {@link MissingParserError}.
   */
  static async load(): R.ResultAsync<Parser, MissingParserError> {
    try {
      return R.succeed(new Parser(await import("oxc-parser")));
    } catch (error) {
      if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      return R.fail(new MissingParserError({ cause: error }));
    }
  }

  exec(file: string, source: string) {
    const { program, comments } = this.#oxc.parseSync(file, source);
    return { program: fromOxc(program, this.#oxc.visitorKeys), comments };
  }
}
