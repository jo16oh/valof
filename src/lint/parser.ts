import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { fromOxc } from "./ast.ts";
import { MissingParserError } from "./errors.ts";

/** oxc-parser, once {@link loadParser} has imported it. */
let oxc: typeof import("oxc-parser") | undefined;

/** oxc-parser, loaded. Only {@link loadParser} makes one. */
export type Parser = Val<"Parser", { visitorKeys: Record<string, readonly string[]> }>;
export const Parser = Val.companion<Parser>()
  .impl(() => ({
    read(parser, file: string, source: string) {
      if (!oxc) throw new Error("valof-lint: oxc-parser is not loaded");
      const { program, comments } = oxc.parseSync(file, source);
      return { program: fromOxc(program, parser.visitorKeys), comments };
    },
  }))
  .build();

/**
 * The parser, loaded here rather than imported at the top, because a static import would be
 * hoisted above the caller's own error handling once bundled, turning a missing install into a
 * stack trace instead of an instruction. See {@link MissingParserError}.
 */
export const loadParser = (): Promise<R.Result<Parser, MissingParserError>> =>
  R.try({
    try: async () => {
      oxc = await import("oxc-parser");
      return Parser.seal({ visitorKeys: oxc.visitorKeys });
    },
    catch: (error) => {
      if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      return new MissingParserError({ cause: error });
    },
  });
