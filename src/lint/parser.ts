import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { fromOxc } from "./ast.ts";
import { MissingParserError } from "./errors.ts";

/** oxc-parser, once {@link Parser.load} has imported it. */
let oxc: typeof import("oxc-parser") | undefined;

/** oxc-parser, loaded. Only {@link Parser.load} makes one. */
export type Parser = Val<"Parser", { visitorKeys: Record<string, string[]> }>;
export const Parser = Val.companion<Parser>()
  .implAssoc(({ seal }) => ({
    /**
     * Imports oxc-parser here rather than at the top, because a static import would be hoisted
     * above the caller's own error handling once bundled, turning a missing install into a stack
     * trace instead of an instruction. See {@link MissingParserError}.
     */
    load: (): Promise<R.Result<Parser, MissingParserError>> =>
      R.try({
        try: async () => {
          oxc = await import("oxc-parser");
          return seal({ visitorKeys: oxc.visitorKeys });
        },
        catch: (error) => {
          if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
          return new MissingParserError({ cause: error });
        },
      }),
  }))
  .impl(() => ({
    parse(parser, file: string, source: string) {
      if (!oxc) throw new Error("valof-lint: oxc-parser is not loaded");
      const { program, comments } = oxc.parseSync(file, source);
      return { program: fromOxc(program, parser.visitorKeys), comments };
    },
  }))
  .build();
