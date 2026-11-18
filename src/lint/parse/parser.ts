import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { Val } from "../../index.ts";
import { fromOxc } from "./ast.ts";

/** oxc-parser, once {@link Parser.load} has imported it. */
let oxc: typeof import("oxc-parser") | undefined;

/** oxc-parser is an optional peer dependency, so a run can start without it. */
export class MissingParserError extends ErrorFactory({
  name: "MissingParserError",
  message: `valof-lint needs oxc-parser, which valof does not install for you.\n  pnpm add -D oxc-parser`,
}) {}

/** oxc-parser, loaded. Only {@link Parser.load} makes one. */
export type Parser = Val<"Parser", { visitorKeys: Record<string, string[]> }>;
export const Parser = Val.companion<Parser>()
  .implAssoc(({ seal }) => ({
    /**
     * Imports oxc-parser here rather than at the top, because a static import would be hoisted
     * above the caller's own error handling once bundled, turning a missing install into a stack
     * trace instead of an instruction. See {@link MissingParserError}.
     */
    load: async (): R.ResultAsync<Parser, MissingParserError> => {
      try {
        oxc = await import("oxc-parser");
      } catch (error) {
        if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
        return R.fail(new MissingParserError({ cause: error }));
      }

      return R.succeed(Parser.fromModule(oxc));
    },
    /** The parser that oxc-parser's module makes. */
    fromModule: (module: typeof import("oxc-parser")): Parser =>
      seal({ visitorKeys: module.visitorKeys }),
  }))
  .impl(() => ({
    exec(parser, file: string, source: string) {
      if (!oxc) throw new Error("valof-lint: oxc-parser is not loaded");
      const { program, comments } = oxc.parseSync(file, source);
      return { program: fromOxc(program, parser.visitorKeys), comments };
    },
  }))
  .build();
