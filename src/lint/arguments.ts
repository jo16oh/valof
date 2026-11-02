import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { isDirectory } from "./files.ts";
import { MissingPathError, NotAProjectError, UnknownRuleError } from "./errors.ts";
import { isKind, kinds, type Kind } from "./rules/index.ts";

/** A path with any of these is a glob, and stands for whatever it matches. */
const GLOB = /[*?[\]{}]/;

/** What the command was asked to do, before any file is read. */
export type Arguments = Val<
  "Arguments",
  {
    /** What the run reads. Empty means the default, `src/**\/*.ts`. */
    projects: string[];
    /** What the run reports on. Empty means the whole project. */
    targets: string[];
    /** Paths written with a leading `!`: out of the run and the report alike. */
    excluded: string[];
    /** Kinds left out with `--no-<kind>`. */
    skip: Kind[];
    help: boolean;
  }
>;

export const Arguments = Val.companion<Arguments>()
  .implAssoc(({ seal }) => ({
    /**
     * Reads the command line.
     *
     * A path goes where it was written, unless it starts with `!`. An exclusion belongs to
     * neither list: it is removed from the run and the report alike, so a generated tree named
     * once is out of the findings however it was reached.
     */
    fromArgv: (
      argv: readonly string[],
    ): R.Result<Arguments, UnknownRuleError | MissingPathError | NotAProjectError> => {
      const projects: string[] = [];
      const targets: string[] = [];
      const excluded: string[] = [];
      const loose: string[] = [];
      const skip: Kind[] = [];
      let help = false;
      let pending: "project" | "report-on" | undefined;

      const take = (into: string[], path: string): void => {
        if (path.startsWith("!")) excluded.push(path.slice(1));
        else into.push(path);
      };

      for (const argument of argv) {
        if (pending) {
          take(pending === "project" ? projects : targets, argument);
          pending = undefined;
        } else if (argument === "--help" || argument === "-h") {
          help = true;
        } else if (argument === "--project" || argument === "--report-on") {
          pending = argument.slice("--".length) as "project" | "report-on";
        } else if (argument.startsWith("--project=")) {
          take(projects, argument.slice("--project=".length));
        } else if (argument.startsWith("--report-on=")) {
          take(targets, argument.slice("--report-on=".length));
        } else if (argument.startsWith("--no-")) {
          const kind = argument.slice("--no-".length);
          if (!isKind(kind)) return R.fail(new UnknownRuleError({ kind, known: kinds }));
          skip.push(kind);
        } else {
          take(loose, argument);
        }
      }

      if (help) return R.succeed(seal({ projects, targets, excluded, skip, help }));
      if (pending) return R.fail(new MissingPathError({ flag: pending }));

      // The first loose path is the project, unless one was named.
      if (projects.length === 0 && loose.length > 0) {
        const first = loose.shift() as string;
        if (!GLOB.test(first) && !isDirectory(first))
          return R.fail(new NotAProjectError({ path: first }));
        projects.push(first);
      }
      targets.push(...loose);
      return R.succeed(seal({ projects, targets, excluded, skip, help }));
    },
  }))
  .build();
