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
 * elsewhere. `Val` is recognised however it was bound: renamed, imported for its type alone,
 * reached through a namespace, or re-exported from a barrel. Something else bound to the name
 * `Val` is left alone.
 *
 * The alias must spell `Val<…>` itself. A user's helper around it, `type Branded<K, T> =
 * Val<K, T>`, is invisible here and to the structural-equals rule with it.
 */
function findings(scans: readonly Scan[]): DuplicateBrand[] {
  const claims = new Map<string, DuplicateBrand[]>();
  for (const { file, brands, bound } of scans) {
    for (const { typeName, brand, alias, line, column } of brands) {
      if (original(bound, typeName) !== "Val") continue;
      const claimed = claims.get(brand) ?? [];
      claimed.push({
        kind: "duplicate-brand",
        file,
        line,
        column,
        brand,
        alias,
        message: `${alias} claims the brand "${brand}", and so does another type`,
      });
      claims.set(brand, claimed);
    }
  }
  return [...claims.values()].filter((claimed) => claimed.length > 1).flat();
}
