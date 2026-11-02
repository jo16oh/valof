import { Val } from "../../index.ts";
import type { Directive, Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A directive that leaves out what it needs: the rules it silences, or the scope it applies to.
 *
 * Naming no rule on a line silences every one there, ones written after it included, so what it
 * hides grows without anyone deciding to. Over a whole file it silences nothing at all, since a
 * whole file is turned off by saying so: `valof-lint-disable-all-whole-file`.
 */
export type IncompleteDisable = Val<"IncompleteDisable", { kind: "incomplete-disable" }, Rule>;
export const IncompleteDisable = Val.companion<IncompleteDisable>()
  .implCreate(() => ({
    kind: "incomplete-disable",
    description: "a disable comment leaving out the rules it silences, or its scope",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/** What the directive left out, or `undefined` when it left out nothing. */
function missing({ spelling, kinds }: Directive): string | undefined {
  if (spelling === "valof-lint-disable")
    return "names no scope; write valof-lint-disable-next-line or valof-lint-disable-whole-file";
  // The `-all` arm cannot be observed: that directive silences its own file, this finding with
  // it. It stands so the rule says what it means, rather than leaning on being silenced.
  if (spelling === "valof-lint-disable-all-whole-file" || kinds.size > 0) return undefined;
  const every =
    spelling === "valof-lint-disable-whole-file"
      ? ", or valof-lint-disable-all-whole-file for every one"
      : "";
  return `names no rule; name the ones it silences${every}`;
}

/**
 * Reports every directive that left something out.
 *
 * A line directive goes on silencing what it silences. Reporting is the whole change: the line
 * below is already written the way its author wanted, and turning the directive off here would
 * bury the finding under the ones it was holding back.
 */
function findings({ kind }: IncompleteDisable, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, directives }) =>
    directives.flatMap((written) => {
      const left = missing(written);
      if (!left) return [];
      return [
        Finding.seal({
          kind,
          file,
          line: written.line,
          column: written.column,
          message: `${written.spelling} ${left}`,
        }),
      ];
    }),
  );
}
