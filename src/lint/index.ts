import { resolve } from "node:path";

import { RULES, type Finding, type Kind } from "./rules/index.ts";
import { scan, silences, type Parser } from "./scan/index.ts";

export { RULES, kinds, isKind, type Finding, type Kind } from "./rules/index.ts";
export type Options = {
  /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
  skip?: ReadonlySet<Kind>;
  /**
   * Files to report on, as paths resolved against the same root. Everything else in `files` is
   * still scanned.
   *
   * Three rules need a second file to say anything: a duplicate brand needs the other alias, a
   * second name needs the Val alias, and a member is read from wherever it is read. Narrowing the
   * run instead of the report turns those into silence, and turns a
   * directive that is doing its job into an `unused-disable`.
   */
  report?: ReadonlySet<string>;
  /**
   * Source to read instead of the file on disk, keyed by path.
   *
   * For an editor: the buffer the user is typing in has not been saved, and a run over what disk
   * holds answers about the file as it was. A path here that is not in `files` is scanned all the
   * same, and the file need not exist.
   *
   */
  overlay?: ReadonlyMap<string, string>;
};

/**
 * Reports what the type checker cannot. See {@link RULES} for what each rule looks for.
 *
 * Every file is walked once, by {@link scan}, and each rule runs over what it collected. There is
 * no branch per rule here: a rule is the object in `RULES`, and adding one changes nothing in
 * this function.
 *
 * The parser is loaded here rather than imported at the top: it is an optional peer dependency,
 * and a static import would be hoisted above the caller's own error handling once bundled,
 * turning a missing install into a stack trace instead of an instruction.
 */
export async function lint(
  files: readonly string[],
  { skip, report, overlay }: Options = {},
): Promise<Finding[]> {
  const parser = (await import("oxc-parser")) as unknown as Parser;
  const sources = new Map([...(overlay ?? [])].map(([file, text]) => [resolve(file), text]));
  // Paths keep the spelling they came in with, since a finding prints it. An overlaid file the
  // caller did not list joins them, as itself.
  const listed = new Set(files.map((file) => resolve(file)));
  const walk = [...files, ...[...sources.keys()].filter((file) => !listed.has(file))];
  const scans = walk.map((file) => scan(file, parser, sources.get(resolve(file))));

  const findings: Finding[] = [];
  const notRun = new Set(skip ?? []);
  for (const rule of RULES) {
    if (notRun.has(rule.kind)) continue;
    findings.push(...(await rule.run(scans, { reported: findings, notRun })));
  }

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const disabled = new Map(scans.map(({ file, directives }) => [file, silences(directives)]));
  const silenced = ({ file, line, kind }: Finding): boolean =>
    disabled.get(file)?.(line, kind) === true;
  const asked = ({ file }: Finding): boolean => report === undefined || report.has(resolve(file));

  return findings
    .filter((finding) => asked(finding) && !silenced(finding))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        a.kind.localeCompare(b.kind),
    );
}
