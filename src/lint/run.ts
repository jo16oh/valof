import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import { MissingTypeScriptError, type MissingParserError } from "./errors.ts";
import { Context, KindSet, RULES, compile, type Finding } from "./rules/index.ts";
import { loadParser } from "./parser.ts";
import { Val } from "../index.ts";
import { Directive, scan, type Scan } from "./scan/index.ts";
import { Modules } from "./scan/bindings.ts";
import { arities, type Arity } from "./types.ts";
import { Options } from "./options.ts";

/** What `lint` reports, with a missing parser as a failure rather than a throw. */
// Every file is walked once, by `scan`, and each rule runs over what it collected. There is no
// branch per rule here: a rule is the object in `RULES`, and adding one changes nothing in this
// function.
export async function run(
  files: readonly string[],
  options: Options = Options.create(),
): Promise<R.Result<Finding[], MissingParserError | MissingTypeScriptError>> {
  const loaded = await loadParser();
  if (R.isFailure(loaded)) return loaded;
  const parser = loaded.value;
  // Paths keep the spelling they came in with, since a finding prints it. An overlaid file the
  // caller did not list joins them, as itself.
  const walk = [
    ...files,
    ...Object.keys(options.overlay).filter((key) => !files.some((file) => resolve(file) === key)),
  ];
  const modules = Modules.create(walk);
  const scans = walk.map((file) => scan(file, parser, modules, Options.sourceOf(options, file)));

  const rules = compile(options.enable);
  // An opt-in rule left off is out of the run as much as a skipped one.
  const notRun = KindSet.create([
    ...Object.keys(options.skip),
    ...RULES.filter(({ kind }) => !rules.some((rule) => rule.kind === kind)).map(
      ({ kind }) => kind,
    ),
  ]);
  // Started by the first rule that asks, and by none when no rule does.
  let program: ReturnType<typeof arities> | undefined;
  const types = (): Arity => (program ??= arities(walk.map((file) => resolve(file)))).arity;
  const ran = ((): R.Result<Finding[], MissingTypeScriptError> => {
    try {
      // Each rule sees what the rules before it reported, which is what `unused-disable` checks.
      return R.succeed(
        rules
          .filter(({ kind }) => !KindSet.has(notRun, kind))
          .reduce<Finding[]>(
            (reported, rule) => [
              ...reported,
              ...rule.run(scans, Context.seal({ reported, notRun }), types),
            ],
            [],
          ),
      );
    } catch (error) {
      if (error instanceof MissingTypeScriptError) return R.fail(error);
      throw error;
    } finally {
      program?.close();
    }
  })();
  if (R.isFailure(ran)) return ran;
  const findings = ran.value;

  const directives = DirectiveMap.create(scans);

  return R.succeed(
    findings
      .filter(
        ({ file, at: { line }, kind }) =>
          Options.isTarget(options, file) && !DirectiveMap.silences(directives, file, line, kind),
      )
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.at.line - b.at.line ||
          a.at.column - b.at.column ||
          a.kind.localeCompare(b.kind),
      ),
  );
}

/**
 * The directives of each file in a run, by the path the file was scanned under.
 *
 * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
 * brand is still reported, since silencing it is its own line's decision.
 */
type DirectiveMap = Val<"DirectiveMap", Record<string, Directive[]>>;
const DirectiveMap = Val.companion<DirectiveMap>()
  .implCreate((scans: readonly Scan[]) =>
    Object.fromEntries(scans.map((scanned) => [scanned.file, scanned.directives])),
  )
  .impl(() => ({
    /** Whether a directive in the file silences a finding of `kind` on `line`. */
    silences: (map, file: string, line: number, kind: string) =>
      (Object.hasOwn(map, file) ? map[file]! : []).some((directive) =>
        Directive.silences(directive, line, kind),
      ),
  }))
  .build();
