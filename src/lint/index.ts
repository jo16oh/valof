import { resolve } from "node:path";

import { requireTypeScript, resolver, type Resolver } from "./typecheck/index.ts";
import { RULES, type Finding, type Kind } from "./rules/index.ts";
import { scan, silences, type Parser } from "./scan/index.ts";

export { RULES, kinds, isKind, type Finding, type Kind } from "./rules/index.ts";
export { NO_TYPESCRIPT, resolver, type Resolver } from "./typecheck/index.ts";

export type Options = {
  /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
  skip?: ReadonlySet<Kind>;
  /**
   * A resolver to use instead of starting one, for a caller that runs `lint` more than once.
   *
   * Starting one costs about 85 ms, so many runs save most of their time by sharing a single
   * one. Ownership stays with the caller: this never closes what it was handed, and the caller
   * must build it over every file any of its runs will touch, since the TypeScript 5 / 6
   * backend takes that list as the project.
   */
  types?: Resolver;
  /**
   * Files to report on, as paths resolved against the same root. Everything else in `files` is
   * still scanned.
   *
   * Three rules need a second file to say anything: a duplicate brand needs the other alias, a
   * child's own equality needs the parent holding it, and a member is read from wherever it is
   * read. Narrowing the run instead of the report turns those into silence, and turns a
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
   * The type checker is told too, so a name declared only in the buffer still resolves.
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
  { skip, types: given, report, overlay }: Options = {},
): Promise<Finding[]> {
  // Before the scan, so a project with no TypeScript hears it at once rather than after the
  // work. A caller holding its own resolver has one by definition.
  if (!given) requireTypeScript(process.cwd());
  const parser = (await import("oxc-parser")) as unknown as Parser;
  const sources = new Map([...(overlay ?? [])].map(([file, text]) => [resolve(file), text]));
  // Paths keep the spelling they came in with, since a finding prints it. An overlaid file the
  // caller did not list joins them, as itself.
  const listed = new Set(files.map((file) => resolve(file)));
  const walk = [...files, ...[...sources.keys()].filter((file) => !listed.has(file))];
  const scans = walk.map((file) => scan(file, parser, sources.get(resolve(file))));

  // Started by the first rule that asks for it, and closed however the run ends.
  let opened: Resolver | undefined;
  let told = false;
  const types = (): Resolver => {
    const it = given ?? (opened ??= resolver(process.cwd(), files));
    // Once per run, and even where the overlay is empty: a resolver handed in may still hold
    // what the last run gave it.
    if (!told) {
      told = true;
      it.overlay(sources);
    }
    return it;
  };

  const findings: Finding[] = [];
  const notRun = new Set(skip ?? []);
  try {
    for (const rule of RULES) {
      if (notRun.has(rule.kind)) continue;
      findings.push(...(await rule.run(scans, { types, reported: findings, notRun })));
    }
  } finally {
    // Only what this run opened. A resolver handed in belongs to the caller.
    opened?.close();
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
