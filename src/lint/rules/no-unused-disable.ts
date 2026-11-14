import { Val } from "../../lib/index.ts";
import type { Scan } from "../scan/index.ts";
import { Kind, Finding, KindSet, Rule, type Context } from "./rule.ts";

/**
 * A `valof-lint-disable-next-line` naming a rule that reports nothing on the line below. The
 * finding it was written for is gone, and what stays is a claim about the code that is no longer
 * true.
 */
export type UnusedDisable = Val<"UnusedDisable", { kind: Kind }, Rule>;
export const UnusedDisable = Val.companion<UnusedDisable>()
  .implCreate(() => ({
    kind: Kind.seal("no-unused-disable"),
    description: "a disable comment naming a rule that reports nothing there",
    // A directive that silences nothing changes nothing about the code.
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/** What a finding answers for: its own line, and its file as a whole. */
function answers({ file, at: { line }, kind }: Finding): string[] {
  return [`${file}\0${line}\0${kind}`, `${file}\0file\0${kind}`];
}

/**
 * Reports every name in a directive that silenced nothing.
 *
 * One finding per name, so a directive whose other names still do their job says which one to
 * drop. A bare directive is left to the no-vague-disable rule: it names nothing to blame, and the
 * two findings would ask for the same edit.
 *
 * A kind left out of the run is not blamed: `--skip <kind>` leaves a directive naming it looking
 * unused, which is not the directive's fault. What a partial glob hides is not covered, though:
 * a duplicate brand needs the other file in the run, so linting one file at a time can report a
 * directive that is doing its job in the whole project.
 */
function findings(
  { kind }: UnusedDisable,
  scans: readonly Scan[],
  { reported, notRun }: Context,
): Finding[] {
  const used = new Set(reported.flatMap(answers));
  return scans.flatMap(({ file, directives }) =>
    directives.flatMap(({ at, covers, kinds, spelling }) =>
      // One naming no scope silences nothing whatever it lists, which is no-vague-disable's to say.
      spelling === "valof-lint-disable"
        ? []
        : [...kinds]
            .filter(
              (named) => !KindSet.has(notRun, named) && !used.has(`${file}\0${covers}\0${named}`),
            )
            .map((named) =>
              Finding.seal({
                kind,
                file,
                at,
                message: `${spelling} names ${named}, which reports nothing ${
                  covers === "file" ? "in this file" : "here"
                }`,
              }),
            ),
    ),
  );
}
