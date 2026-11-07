import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import { MissingTypeScriptError, type MissingParserError } from "./errors.ts";
import { Context, KindSet, compile, type Finding } from "./rules/index.ts";
import { loadParser } from "./parser.ts";
import { scan, silences } from "./scan/index.ts";
import { moduleResolver } from "./scan/bindings.ts";
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
  const listed = new Set(files.map((file) => resolve(file)));
  const walk = [...files, ...Object.keys(options.overlay).filter((file) => !listed.has(file))];
  const resolveModule = moduleResolver(walk);
  const scans = walk.map((file) =>
    scan(file, parser, Options.sourceOf(options, file), resolveModule),
  );

  const findings: Finding[] = [];
  const notRun = options.skip;
  // Started by the first rule that asks, and by none when no rule does.
  let program: ReturnType<typeof arities> | undefined;
  const types = (): Arity => (program ??= arities(walk.map((file) => resolve(file)))).arity;
  try {
    for (const rule of compile(options.enable)) {
      if (KindSet.has(notRun, rule.kind)) continue;
      findings.push(...rule.run(scans, Context.seal({ reported: findings, notRun }), types));
    }
  } catch (error) {
    if (error instanceof MissingTypeScriptError) return R.fail(error);
    throw error;
  } finally {
    program?.close();
  }

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const disabled = new Map(scans.map(({ file, directives }) => [file, silences(directives)]));
  const silenced = ({ file, at: { line }, kind }: Finding): boolean =>
    disabled.get(file)?.(line, kind) === true;
  const asked = ({ file }: Finding): boolean => Options.reports(options, file);

  return R.succeed(
    findings
      .filter((finding) => asked(finding) && !silenced(finding))
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.at.line - b.at.line ||
          a.at.column - b.at.column ||
          a.kind.localeCompare(b.kind),
      ),
  );
}
