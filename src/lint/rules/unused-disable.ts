import type { Where } from "../ast.ts";
import type { Scan } from "../scan/index.ts";
import type { Context, Rule } from "./rule.ts";

/**
 * A `valof-lint-disable-next-line` naming a rule that reports nothing on the line below. The
 * finding it was written for is gone, and what stays is a claim about the code that is no longer
 * true.
 */
export type UnusedDisable = Where & {
  kind: "unused-disable";
  file: string;
  /** The name in the directive that silenced nothing. */
  silenced: string;
  message: string;
};

export const UnusedDisable: Rule<UnusedDisable> = {
  kind: "unused-disable",
  description: "a disable comment naming a rule that reports nothing there",
  run: findings,
};

/** What a finding answers for: its own line, and its file as a whole. */
const answers = ({ file, line, kind }: { file: string; line: number; kind: string }): string[] => [
  `${file}\0${line}\0${kind}`,
  `${file}\0file\0${kind}`,
];

/**
 * Reports every name in a directive that silenced nothing.
 *
 * One finding per name, so a directive whose other names still do their job says which one to
 * drop. A bare directive is left to the bare-disable rule: it names nothing to blame, and the
 * two findings would ask for the same edit.
 *
 * A kind left out of the run is not blamed: `--no-<kind>` leaves a directive naming it looking
 * unused, which is not the directive's fault. What a partial glob hides is not covered, though:
 * a duplicate brand needs the other file in the run, so linting one file at a time can report a
 * directive that is doing its job in the whole project.
 */
function findings(scans: readonly Scan[], { reported, notRun }: Context): UnusedDisable[] {
  const used = new Set(reported.flatMap(answers));
  return scans.flatMap(({ file, directives }) =>
    directives.flatMap(({ line, column, covers, kinds, spelling }) =>
      // One naming no scope silences nothing whatever it lists, which is bare-disable's to say.
      spelling === "valof-lint-disable"
        ? []
        : [...kinds]
            .filter((kind) => !notRun.has(kind) && !used.has(`${file}\0${covers}\0${kind}`))
            .map((kind) => ({
              kind: "unused-disable" as const,
              file,
              line,
              column,
              silenced: kind,
              message: `${spelling} names ${kind}, which reports nothing ${
                covers === "file" ? "in this file" : "here"
              }`,
            })),
    ),
  );
}
