import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import type { MissingParserError } from "./errors.ts";
import { Context, Kind, KindSet, RULES, compile, type Finding } from "./rules/index.ts";
import { Parser } from "./parser.ts";
import { ScanCache } from "./scan-cache.ts";
import { DirectiveMap } from "./scan/index.ts";
import { Modules } from "./scan/bindings.ts";
import { FilePath } from "./files.ts";
import { Options } from "./options.ts";

/** What `lint` reports, with a missing parser as a failure rather than a throw. */
// Every file is walked once, by `scan`, and each rule runs over what it collected. There is no
// branch per rule here: a rule is the object in `RULES`, and adding one changes nothing in this
// function.
export async function run(
  files: readonly string[],
  options: Options = Options.create(),
  cache: ScanCache = new ScanCache(),
): Promise<R.Result<Finding[], MissingParserError>> {
  const loaded = await Parser.load();
  if (R.isFailure(loaded)) return loaded;
  const parser = loaded.value;

  // Paths keep the spelling they came in with, since a finding prints it. An overlaid file the
  // caller did not list joins them, as itself.
  const toScan = [
    ...files,
    ...Object.keys(options.overlay).filter((key) => !files.some((file) => resolve(file) === key)),
  ].map((file) => FilePath.seal(file));
  const modules = Modules.create(toScan);
  const sources = toScan.map((file) => [file, FilePath.read(file, options.overlay)] as const);
  const scans = cache.scan(parser, sources, modules);

  const rules = compile(options.enable);
  // An opt-in rule left off is out of the run as much as a skipped one.
  const notRun = KindSet.create([
    ...Object.keys(options.skip).map((kind) => Kind.seal(kind)),
    ...RULES.filter(({ kind }) => !rules.some((rule) => rule.kind === kind)).map(
      ({ kind }) => kind,
    ),
  ]);
  // Each rule sees what the rules before it reported, which is what `unused-disable` checks.
  const reported: Finding[] = [];
  for (const rule of rules.filter(({ kind }) => !KindSet.has(notRun, kind)))
    reported.push(...rule.run(scans, Context.seal({ reported, notRun })));

  const directives = DirectiveMap.from(scans);

  return R.succeed(
    reported
      .filter(
        ({ file, at: { line }, kind }) =>
          FilePath.isTarget(file, options.targets) &&
          !DirectiveMap.silences(directives, file, line, kind),
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
