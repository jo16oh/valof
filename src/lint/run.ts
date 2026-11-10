import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import type { MissingParserError } from "./errors.ts";
import { Context, KindSet, RULES, type Finding } from "./rules/index.ts";
import { loadParser } from "./parser.ts";
import { DirectiveMap, scan } from "./scan/index.ts";
import { Modules } from "./scan/bindings.ts";
import { Options } from "./options.ts";

/** What `lint` reports, with a missing parser as a failure rather than a throw. */
// Every file is walked once, by `scan`, and each rule runs over what it collected. There is no
// branch per rule here: a rule is the object in `RULES`, and adding one changes nothing in this
// function.
export async function run(
  files: readonly string[],
  options: Options = Options.create(),
): Promise<R.Result<Finding[], MissingParserError>> {
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

  // Each rule sees what the rules before it reported, which is what `unused-disable` checks.
  const findings = RULES.filter(({ kind }) => !KindSet.has(options.skip, kind)).reduce<Finding[]>(
    (reported, rule) => [
      ...reported,
      ...rule.run(scans, Context.seal({ reported, notRun: options.skip })),
    ],
    [],
  );

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
