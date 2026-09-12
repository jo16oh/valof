import type { Where } from "../ast.ts";
import { symbolIdentity, type CompanionSite, type Scan } from "../scan/index.ts";
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
 * Resolution keeps the source module through a renamed import, namespace import or re-export.
 * The display name stays separate from that identity.
 *
 * `Val.of` spelling no type argument is left to the unnamed-of rule. That form takes the type
 * from the target it is assigned to, and there is no name here to key it by.
 */
function findings(scans: readonly Scan[]): BypassedCompanion[] {
  const identity = symbolIdentity(scans);
  const companions = new Map<string, CompanionSite>();
  for (const { sites } of scans)
    for (const site of sites)
      if (!companions.has(identity(site.typeRef))) companions.set(identity(site.typeRef), site);

  const found: BypassedCompanion[] = [];
  for (const { file, lifts } of scans) {
    for (const { typeName, typeRef, line, column } of lifts) {
      // A lift naming no type is the unnamed-of rule's finding. Which companion it goes around,
      // if any, is not written anywhere here.
      if (typeName === undefined) continue;
      if (!typeRef) continue;
      const site = companions.get(identity(typeRef));
      if (!site) continue;
      found.push({
        kind: "bypassed-companion",
        file,
        line,
        column,
        typeName,
        message: `Val.of<${typeName}> ${instead(site, site.typeRef.name)}`,
      });
    }
  }
  return found;
}
