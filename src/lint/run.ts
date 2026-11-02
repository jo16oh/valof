import { resolve } from "node:path";

import { Result as R } from "@praha/byethrow";

import { MissingParserError } from "./errors.ts";
import { RULES, type Finding } from "./rules/index.ts";
import { scan, silences, type Parser } from "./scan/index.ts";
import { moduleResolver } from "./scan/bindings.ts";
import type { Options } from "./index.ts";

/** What `lint` reports, with a missing parser as a failure rather than a throw. */
// Every file is walked once, by `scan`, and each rule runs over what it collected. There is no
// branch per rule here: a rule is the object in `RULES`, and adding one changes nothing in this
// function.
export async function run(
  files: readonly string[],
  { skip, report, overlay }: Options = {},
): Promise<R.Result<Finding[], MissingParserError>> {
  const loaded = await loadParser();
  if (R.isFailure(loaded)) return loaded;
  const parser = loaded.value;
  const sources = new Map([...(overlay ?? [])].map(([file, text]) => [resolve(file), text]));
  // Paths keep the spelling they came in with, since a finding prints it. An overlaid file the
  // caller did not list joins them, as itself.
  const listed = new Set(files.map((file) => resolve(file)));
  const walk = [...files, ...[...sources.keys()].filter((file) => !listed.has(file))];
  const resolveModule = moduleResolver(walk);
  const scans = walk.map((file) => scan(file, parser, sources.get(resolve(file)), resolveModule));

  const findings: Finding[] = [];
  const notRun = new Set(skip ?? []);
  for (const rule of RULES) {
    if (notRun.has(rule.kind)) continue;
    findings.push(...rule.run(scans, { reported: findings, notRun }));
  }

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const disabled = new Map(scans.map(({ file, directives }) => [file, silences(directives)]));
  const silenced = ({ file, line, kind }: Finding): boolean =>
    disabled.get(file)?.(line, kind) === true;
  const asked = ({ file }: Finding): boolean => report === undefined || report.has(resolve(file));

  return R.succeed(
    findings
      .filter((finding) => asked(finding) && !silenced(finding))
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.line - b.line ||
          a.column - b.column ||
          a.kind.localeCompare(b.kind),
      ),
  );
}

/**
 * The parser, loaded here rather than imported at the top: it is an optional peer dependency, and
 * a static import would be hoisted above the caller's own error handling once bundled, turning a
 * missing install into a stack trace instead of an instruction.
 */
const loadParser = (): Promise<R.Result<Parser, MissingParserError>> =>
  R.try({
    try: async () => (await import("oxc-parser")) as unknown as Parser,
    catch: (error) => {
      if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      return new MissingParserError({ cause: error });
    },
  });
