import type { Where } from "../ast.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/**
 * A `valof-lint-disable-next-line` that names no kind. It silences every rule on the line below,
 * including ones written after it was, so what it hides grows without anyone deciding to.
 */
export type BareDisable = Where & {
  kind: "bare-disable";
  file: string;
  message: string;
};

export const BareDisable: Rule<BareDisable> = {
  kind: "bare-disable",
  description: "a disable comment that names no rule, and so silences all of them",
  run: findings,
};

/**
 * Reports every directive that named nothing.
 *
 * It goes on silencing what it silences. Reporting is the whole change: the line below is
 * already written the way its author wanted, and turning the directive off here would bury the
 * finding under the ones it was holding back.
 */
function findings(scans: readonly Scan[]): BareDisable[] {
  return scans.flatMap(({ file, bare }) =>
    bare.map(({ line, column }) => ({
      kind: "bare-disable" as const,
      file,
      line,
      column,
      message: "valof-lint-disable-next-line names no rule; name the ones it silences",
    })),
  );
}
