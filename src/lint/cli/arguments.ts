import { Result as R } from "@praha/byethrow";

import { Val } from "../../lib/index.ts";
import { ALL_KINDS, KindSet, KINDS, type Kind } from "../rules/index.ts";
import { Path } from "../shared/files.ts";
import { Enabled, DataTypeSettings } from "../shared/options.ts";
import {
  MissingValueError,
  NotAProjectError,
  NotOptInError,
  UnknownOptionError,
  UnknownRuleError,
  UnknownSettingError,
} from "./errors.ts";

/** A path with any of these is a glob, and stands for whatever it matches. */
const GLOB = /[*?[\]{}]/;

/** The flags that take a value, after a space or an equals sign. */
const FLAGS = ["project", "skip", "enable"] as const;

/** The one rule off by default, which `--enable` turns on. */
const OPT_IN = "no-data-type-outside-valof";

/** What `--enable no-data-type-outside-valof=` takes, separated by commas. */
const SETTINGS = [
  "classes",
  "constraints",
  "extraction",
] as const satisfies readonly (keyof DataTypeSettings)[];

/** What the command was asked to do, before any file is read. */
export type Arguments = Val<
  "Arguments",
  {
    /** What the run reads. Empty means the default, `src/**\/*.ts`. */
    projects: Path[];
    /** What the run reports on. Empty means the whole project. */
    targets: Path[];
    /** Paths written with a leading `!`, removed from the run and the report alike. */
    excluded: Path[];
    /** Kinds left out with `--skip <kind>`. */
    skip: Kind[];
    /** Rules off by default that `--enable <kind>` turned on, with the settings after `=`. */
    enable: Enabled;
    help: boolean;
  }
>;
export const Arguments = Val.companion<Arguments>()
  .implAssoc(({ seal }) => ({
    /**
     * Reads the command line.
     *
     * A path joins the list it was written for, unless it starts with `!`. An exclusion joins
     * neither list. It is removed from the run and the report alike, so a generated tree written
     * once leaves no findings, however it was reached.
     */
    fromArgv: (
      argv: readonly string[],
    ): R.Result<
      Arguments,
      | UnknownRuleError
      | NotOptInError
      | UnknownSettingError
      | UnknownOptionError
      | MissingValueError
      | NotAProjectError
    > => {
      const projects: Path[] = [];
      const targets: Path[] = [];
      const excluded: Path[] = [];
      const loose: Path[] = [];
      const skip: Kind[] = [];
      let model: DataTypeSettings | undefined;
      let help = false;
      let pending: (typeof FLAGS)[number] | undefined;

      const take = (into: Path[], written: string): void => {
        const path = Path.seal(written);
        if (Path.excludes(path)) {
          excluded.push(Path.seal(path.slice(1)));
        } else {
          into.push(path);
        }
      };

      const given = (
        flag: (typeof FLAGS)[number],
        value: string,
      ): UnknownRuleError | NotOptInError | UnknownSettingError | undefined => {
        if (flag === "project") {
          take(projects, value);
          return undefined;
        }
        if (flag === "skip") {
          const kind = KindSet.find(ALL_KINDS, value);
          if (!kind) return new UnknownRuleError({ kind: value, known: KINDS });
          skip.push(kind);
          return undefined;
        }
        const [name = "", ...rest] = value.split("=");
        if (name !== OPT_IN) return new NotOptInError({ kind: name, known: [OPT_IN] });
        const settings: { -readonly [K in (typeof SETTINGS)[number]]?: boolean } = {};
        for (const setting of rest.join("=").split(",").filter(Boolean)) {
          if (!isSetting(setting)) return new UnknownSettingError({ setting, known: SETTINGS });
          settings[setting] = true;
        }
        model = DataTypeSettings.create(settings);
        return undefined;
      };

      for (const argument of argv) {
        const flag = FLAGS.find((name) => argument === `--${name}`);
        const assigned = FLAGS.find((name) => argument.startsWith(`--${name}=`));
        if (pending) {
          const failed = given(pending, argument);
          if (failed) return R.fail(failed);
          pending = undefined;
        } else if (argument === "--help" || argument === "-h") {
          help = true;
        } else if (flag) {
          pending = flag;
        } else if (assigned) {
          const failed = given(assigned, argument.slice(`--${assigned}=`.length));
          if (failed) return R.fail(failed);
        } else if (argument.startsWith("-")) {
          return R.fail(new UnknownOptionError({ option: argument.split("=")[0] ?? argument }));
        } else {
          take(loose, argument);
        }
      }

      const enable = Enabled.create(model ? { [OPT_IN]: model } : {});
      if (help) return R.succeed(seal({ projects, targets, excluded, skip, enable, help }));
      if (pending) {
        return R.fail(
          new MissingValueError({
            flag: pending,
            value: pending === "project" ? "a path" : "a rule",
          }),
        );
      }

      // The first loose path is the project, unless `--project` gave one.
      const first = projects.length === 0 ? loose.shift() : undefined;
      if (first !== undefined) {
        if (!GLOB.test(first) && !Path.isDirectory(first))
          return R.fail(new NotAProjectError({ path: first }));
        projects.push(first);
      }
      targets.push(...loose);

      return R.succeed(seal({ projects, targets, excluded, skip, enable, help }));
    },
  }))
  .build();

function isSetting(name: string): name is (typeof SETTINGS)[number] {
  return (SETTINGS as readonly string[]).includes(name);
}
