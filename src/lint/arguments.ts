import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { Path } from "./files.ts";
import {
  MissingPathError,
  NotAProjectError,
  UnknownOptionError,
  UnknownRuleError,
  UnknownSettingError,
} from "./errors.ts";
import { Enabled, DataTypeSettings } from "./options.ts";
import { ALL_KINDS, KindSet, kinds, type Kind } from "./rules/index.ts";

/** A path with any of these is a glob, and stands for whatever it matches. */
const GLOB = /[*?[\]{}]/;

const MODEL = "--data-type-outside-valof";

/** What `--data-type-outside-valof=` takes, separated by commas. */
const SETTINGS = [
  "classes",
  "constraints",
  "extraction",
] as const satisfies readonly (keyof DataTypeSettings)[];

const isSetting = (name: string): name is (typeof SETTINGS)[number] =>
  (SETTINGS as readonly string[]).includes(name);

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
    /** Kinds left out with `--no-<kind>`. */
    skip: Kind[];
    /** Rules off by default that `--<kind>` turned on, with the settings after `=`. */
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
      | UnknownSettingError
      | UnknownOptionError
      | MissingPathError
      | NotAProjectError
    > => {
      const projects: Path[] = [];
      const targets: Path[] = [];
      const excluded: Path[] = [];
      const loose: Path[] = [];
      const skip: Kind[] = [];
      let model: DataTypeSettings | undefined;
      let help = false;
      let pending = false;

      const take = (into: Path[], written: string): void => {
        const path = Path.seal(written);
        if (Path.excludes(path)) excluded.push(Path.seal(path.slice(1)));
        else into.push(path);
      };

      for (const argument of argv) {
        if (pending) {
          take(projects, argument);
          pending = false;
        } else if (argument === "--help" || argument === "-h") {
          help = true;
        } else if (argument === "--project") {
          pending = true;
        } else if (argument.startsWith("--project=")) {
          take(projects, argument.slice("--project=".length));
        } else if (argument === MODEL || argument.startsWith(`${MODEL}=`)) {
          const settings: { -readonly [K in (typeof SETTINGS)[number]]?: boolean } = {};
          for (const setting of argument
            .slice(MODEL.length + 1)
            .split(",")
            .filter(Boolean)) {
            if (!isSetting(setting))
              return R.fail(new UnknownSettingError({ setting, known: SETTINGS }));
            settings[setting] = true;
          }
          model = DataTypeSettings.create(settings);
        } else if (argument.startsWith("--no-")) {
          const name = argument.slice("--no-".length);
          const kind = KindSet.find(ALL_KINDS, name);
          if (!kind) return R.fail(new UnknownRuleError({ kind: name, known: kinds }));
          skip.push(kind);
        } else if (argument.startsWith("-")) {
          return R.fail(new UnknownOptionError({ option: argument.split("=")[0] ?? argument }));
        } else {
          take(loose, argument);
        }
      }

      const enable = Enabled.create(model ? { "data-type-outside-valof": model } : {});
      if (help) return R.succeed(seal({ projects, targets, excluded, skip, enable, help }));
      if (pending) return R.fail(new MissingPathError({ flag: "project" }));

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
