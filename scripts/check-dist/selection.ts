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
  .implAssoc(() => ({
    fromArgv: (_argv: readonly string[]): R.Result<Selection, UsageError> =>
      R.fail(new UsageError({ problem: "not yet" })),
  }))
  .build();
