import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/**
 * A brand string that more than one type alias claims. Two Vals with the same brand and the same
 * payload are silently assignable to each other, which is the whole failure the brand exists to
 * prevent.
 */
export type DuplicateBrand = Where & {
  kind: "duplicate-brand";
  file: string;
  brand: string;
  /** The alias that claims it, as written. */
  alias: string;
  message: string;
};

export const DuplicateBrand: Rule<DuplicateBrand> = {
  kind: "duplicate-brand",
  description: "a brand string claimed by more than one type alias",
  run: findings,
};

/**
 * Reports every alias claiming a brand another alias also claims.
 *
 * Only top-level aliases are considered, since nothing else can be imported and assigned
 * elsewhere. `Val` is recognized however it was bound: renamed, imported for its type alone,
 * reached through a namespace, or re-exported from a barrel. Something else bound to the name
 * `Val` is left alone.
 *
 * The alias must spell `Val<…>` itself. A user's helper around it, `type Branded<K, T> =
 * Val<K, T>`, is invisible here.
 */
function findings(scans: readonly Scan[]): DuplicateBrand[] {
  const claims = new Map<string, DuplicateBrand[]>();
  for (const { file, brands, bound, enumAliases } of scans) {
    /** The variants each enum in this file declared, for the brands they derive. */
    const declared = new Map(enumAliases.map(({ alias, variants }) => [alias, variants]));
    for (const { typeName, brand, alias, line, column } of brands) {
      const owner = original(bound, typeName);
      if (owner !== "Val" && owner !== "Trait" && owner !== "Enum") continue;
      const claim = (name: string, claimed: string, how: string): void => {
        // A Val, a Trait and an Enum intentionally use separate phantom-brand fields.
        const together = claims.get(name) ?? [];
        together.push({
          kind: "duplicate-brand",
          file,
          line,
          column,
          brand: claimed,
          alias,
          message: `${alias} ${how} the brand "${claimed}", and so does another type`,
        });
        claims.set(name, together);
      };
      claim(`${owner}:${brand}`, brand, "claims");
      // Each variant derives a Val branded `` `${enum}.${variant}` ``, which a hand-written Val
      // can claim too. The enum's declaration is where that collision is fixed, so the finding
      // sits there rather than at a variant nobody wrote.
      if (owner === "Enum")
        for (const variant of declared.get(alias) ?? [])
          claim(`Val:${brand}.${variant}`, `${brand}.${variant}`, "derives");
    }
  }
  const reported = new Set<string>();
  return [...claims.values()]
    .filter((claimed) => claimed.length > 1)
    .flat()
    .filter(({ file, line, column }) => {
      // One declaration, one finding: an enum claims a brand per variant beside its own.
      const at = `${file}:${line}:${column}`;
      if (reported.has(at)) return false;
      reported.add(at);
      return true;
    });
}
