import { parseArgs } from "node:util";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

export class UsageError extends ErrorFactory({
  name: "UsageError",
  message: ({ problem }) => `check-dist: ${problem}`,
  fields: ErrorFactory.fields<{ problem: string }>(),
}) {}

/** Which checks to run, and how. */
export type Selection = Val<
  "Selection",
  { size: boolean; types: boolean; compat: boolean; release: boolean; write: boolean }
>;
export const Selection = Val.companion<Selection>()
  .implAssoc(({ seal }) => ({
    /**
     * Reads the command line. With no check named, every one runs. `--write` rewrites the claims,
     * so it requires the size check. An unknown flag is an error, so a typo such as `--ts` does
     * not run everything instead.
     */
    fromArgv: (argv: readonly string[]): R.Result<Selection, UsageError> => {
      const parsed = R.try({
        try: () =>
          parseArgs({
            args: [...argv],
            strict: true,
            allowPositionals: false,
            options: {
              size: { type: "boolean", default: false },
              types: { type: "boolean", default: false },
              compat: { type: "boolean", default: false },
              release: { type: "boolean", default: false },
              write: { type: "boolean", default: false },
            },
          }).values,
        catch: (error) => new UsageError({ problem: problem(error) }),
      });
      if (R.isFailure(parsed)) return parsed;
      const { size, types, compat, release, write } = parsed.value;
      const all = !size && !types && !compat;
      if (write && !size && !all)
        return R.fail(
          new UsageError({
            problem: "--write rewrites the bundle-size claims, which only --size checks",
          }),
        );
      return R.succeed(
        seal({ size: all || size, types: all || types, compat: all || compat, release, write }),
      );
    },
  }))
  .build();

/** What `parseArgs` rejected, without the advice it adds about `--`. */
function problem(error: unknown): string {
  const { code, message } = error as { code?: string; message: string };
  const flag = /'(-[^']*)'/.exec(message)?.[1];
  const argument = /'([^']*)'/.exec(message)?.[1];
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") return `unknown option ${flag ?? message}`;
  if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL")
    return `unexpected argument ${argument ?? message}`;
  return message;
}
