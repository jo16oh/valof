import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import { pipe } from "../shared/pipe/index.ts";
import type { MissingParserError } from "./errors.ts";
import { Context, KindSet, RULES, type Finding } from "./rules/index.ts";
import { Parser } from "./parser.ts";
import { DirectiveMap, Scan } from "./scan/index.ts";
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
  const scans = toScan.map((file) =>
    Scan.exec(file, parser, modules, Options.sourceOf(options, file)),
  );

  const directives = DirectiveMap.from(scans);

  return pipe(
    RULES.filter(({ kind }) => !KindSet.has(options.skip, kind)),
    // Each rule sees what the rules before it reported, which is what `unused-disable` checks.
    (rules) =>
      rules.reduce<Finding[]>(
        (reported, rule) => [
          ...reported,
          ...rule.run(scans, Context.seal({ reported, notRun: options.skip })),
        ],
        [],
      ),
    (findings) =>
      findings.filter(
        ({ file, at: { line }, kind }) =>
          Options.isTarget(options, file) && !DirectiveMap.silences(directives, file, line, kind),
      ),
    (findings) =>
      findings.sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.at.line - b.at.line ||
          a.at.column - b.at.column ||
          a.kind.localeCompare(b.kind),
      ),
    (findings) => R.succeed(findings),
  );
}
