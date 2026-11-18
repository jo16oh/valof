import { Val } from "../../lib/index.ts";
import { Exports, type CompanionSite, type Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/** A `Val.of<X>(…)` for a type that has a companion of its own. */
export type BypassedCompanion = Val<"BypassedCompanion", { kind: Kind }, Rule>;
export const BypassedCompanion = Val.companion<BypassedCompanion>()
  .implCreate(() => ({
    kind: Kind.seal("bypassed-companion"),
    description: "a `Val.of` for a type whose companion is how it is built",
    // The value that comes out is a well-formed Val. What it went around is the type's own way in.
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/** What the companion offers instead, or what it does not. */
function instead(site: CompanionSite, type: string, variant: string | null): string {
  // An enum's companion holds one frame per variant.
  if (site.of === "Enum") return `bypasses ${type}.${variant}.seal, the constructor for it`;
  if (site.seals) return `bypasses ${type}.seal, which checks the payload`;
  return `bypasses ${type}.seal, the constructor for it`;
}

/**
 * Reports every `Val.of<X>(…)` where a companion for `X` is in the scanned files.
 *
 * Resolution keeps the source module through a renamed import, namespace import or re-export.
 * The display name stays separate from that identity.
 *
 * `Val.of` spelling no type argument is left to the inferred-val-of rule. That form takes the type
 * from the target it is assigned to, and there is no name here to key it by.
 */
function findings({ kind }: BypassedCompanion, scans: readonly Scan[]): Finding[] {
  const exports = Exports.from(scans);
  const companions = new Map<string, CompanionSite>();
  for (const { sites } of scans) {
    for (const site of sites) {
      if (!companions.has(Exports.identify(exports, site.typeRef))) {
        companions.set(Exports.identify(exports, site.typeRef), site);
      }
    }
  }

  const found: Finding[] = [];
  for (const { file, lifts } of scans) {
    for (const { typeName, typeRef, variant, at } of lifts) {
      // A lift naming no type is the inferred-val-of rule's finding. Which companion it goes
      // around, if any, is not written anywhere here.
      if (typeName === null || typeRef === null) continue;
      const site = companions.get(Exports.identify(exports, typeRef));
      if (!site) continue;
      // `Val.of` builds one Val, and the enum's union is not one: the type error says so.
      if (site.of === "Enum" && variant === null) continue;
      const written = variant === null ? typeName : `VariantOf<${typeName}, "${variant}">`;
      found.push(
        Finding.seal({
          kind,
          file,
          at,
          message: `Val.of<${written}> ${instead(site, site.typeRef.name, variant)}`,
        }),
      );
    }
  }
  return found;
}
