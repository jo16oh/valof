import { resolver, type Resolver } from "./typecheck/index.ts";
import { RULES, type Finding, type Kind } from "./rules/index.ts";
import { scan, type Parser } from "./scan/index.ts";

export { RULES, kinds, isKind, type Finding, type Kind } from "./rules/index.ts";
export { resolver, type Resolver } from "./typecheck/index.ts";

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
  { skip, types: given }: Options = {},
): Promise<Finding[]> {
  const parser = (await import("oxc-parser")) as unknown as Parser;
  const scans = files.map((file) => scan(file, parser));

  // Started by the first rule that asks for it, and closed however the run ends. Resolving type
  // references costs a TypeScript the project may not have; absent one, the rule asking gets
  // `undefined` and reports nothing.
  let started = false;
  let opened: Resolver | undefined;
  const types = (): Resolver | undefined => {
    if (given) return given;
    if (!started) {
      started = true;
      opened = resolver(process.cwd(), files);
    }
    return opened;
  };

  const findings: Finding[] = [];
  try {
    for (const rule of RULES) {
      if (skip?.has(rule.kind)) continue;
      findings.push(...(await rule.run(scans, { types })));
    }
  } finally {
    // Only what this run opened. A resolver handed in belongs to the caller.
    opened?.close();
  }

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const disabled = new Map(scans.map(({ file, disabled: lines }) => [file, lines]));
  const silenced = ({ file, line, kind }: Finding): boolean => {
    const silences = disabled.get(file)?.get(line);
    return silences !== undefined && (silences.size === 0 || silences.has(kind));
  };

  return findings
    .filter((finding) => !silenced(finding))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        a.kind.localeCompare(b.kind),
    );
}
