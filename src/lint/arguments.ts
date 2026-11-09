import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { isDirectory } from "./files.ts";
import {
  MissingPathError,
  NotAProjectError,
  UnknownRuleError,
  UnknownSettingError,
} from "./errors.ts";
import { Enabled, ModelSettings } from "./options.ts";
import { isKind, kinds } from "./rules/index.ts";

/** A path with any of these is a glob, and stands for whatever it matches. */
const GLOB = /[*?[\]{}]/;

const MODEL = "--model-only-in-valof";

/** What `--model-only-in-valof=` takes, separated by commas. */
const SETTINGS = [
  "classes",
  "constraints",
  "extraction",
] as const satisfies readonly (keyof ModelSettings)[];

const isSetting = (name: string): name is (typeof SETTINGS)[number] =>
  (SETTINGS as readonly string[]).includes(name);

/** What the command was asked to do, before any file is read. */
export type Arguments = Val<
  "Arguments",
  {
    /** What the run reads. Empty means the default, `src/**\/*.ts`. */
    projects: string[];
    /** What the run reports on. Empty means the whole project. */
    targets: string[];
    /** Paths written with a leading `!`, removed from the run and the report alike. */
    excluded: string[];
    /** Kinds left out with `--no-<kind>`. */
    skip: string[];
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
      UnknownRuleError | UnknownSettingError | MissingPathError | NotAProjectError
    > => {
      const projects: string[] = [];
      const targets: string[] = [];
      const excluded: string[] = [];
      const loose: string[] = [];
      const skip: string[] = [];
      let model: ModelSettings | undefined;
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
          model = ModelSettings.create(settings);
        } else if (argument.startsWith("--no-")) {
          const kind = argument.slice("--no-".length);
          if (!isKind(kind)) return R.fail(new UnknownRuleError({ kind, known: kinds }));
          skip.push(kind);
        } else {
          take(loose, argument);
        }
      }

      const enable = Enabled.create(model ? { "model-only-in-valof": model } : {});
      if (help) return R.succeed(seal({ projects, targets, excluded, skip, enable, help }));
      if (pending) return R.fail(new MissingPathError({ flag: pending }));

      // The first loose path is the project, unless `--project` gave one.
      if (projects.length === 0 && loose.length > 0) {
        const first = loose.shift() as string;
        if (!GLOB.test(first) && !isDirectory(first))
          return R.fail(new NotAProjectError({ path: first }));
        projects.push(first);
      }
      targets.push(...loose);
      return R.succeed(seal({ projects, targets, excluded, skip, enable, help }));
    },
  }))
  .build();
