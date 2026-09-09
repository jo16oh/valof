import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { CompanionSite, Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A `Val.of<X>(…)` for a type that has a companion of its own. */
export type BypassedCompanion = Where & {
  kind: "bypassed-companion";
  file: string;
  /** The type argument, as written. */
  typeName: string;
  message: string;
};

export const BypassedCompanion: Rule<BypassedCompanion> = {
  kind: "bypassed-companion",
  description: "a `Val.of` for a type whose companion is how it is built",
  // The value that comes out is a well-formed Val. What it went around is the type's own way in.
  warns: true,
  run: findings,
};

/** What the companion offers instead, or what it does not. */
function instead(site: CompanionSite, type: string): string {
  if (site.root === "sealer") return `bypasses ${type}, the constructor for it`;
  if (site.seals) return `bypasses ${type}.seal, which checks the payload`;
  // A companion with no seal of its own has no other way in: `Val.of` is how such a type is
  // built (§6.5). Reported all the same, at a severity that says "look", since the payload
  // reaches the value unchecked. A boundary that hands over checked values silences the line.
  return `brands a payload that no seal checked`;
}

/**
 * Reports every `Val.of<X>(…)` where a companion for `X` is in the scanned files.
 *
 * Resolution is by name, the way the unused-member rule resolves a read: the type argument is
 * taken as the declaring module names it, through a renamed import or a namespace. The
 * split-companion rule is what makes that enough, since it puts the alias and its companion in
 * one file.
 *
 * `Val.of` spelling no type argument is not seen. That form takes the type from the target it is
 * assigned to, and there is no name here to key it by.
 */
function findings(scans: readonly Scan[]): BypassedCompanion[] {
  const companions = new Map<string, CompanionSite>();
  for (const { sites } of scans)
    for (const site of sites)
      if (!companions.has(site.typeName)) companions.set(site.typeName, site);

  const found: BypassedCompanion[] = [];
  for (const { file, lifts, bound } of scans) {
    for (const { typeName, qualifier, line, column } of lifts) {
      // A namespace-qualified name already arrives as the declaring module names it.
      const declared = qualifier === undefined ? original(bound, typeName) : typeName;
      const site = companions.get(declared);
      if (!site) continue;
      found.push({
        kind: "bypassed-companion",
        file,
        line,
        column,
        typeName,
        message: `Val.of<${typeName}> ${instead(site, declared)}`,
      });
    }
  }
  return found;
}
