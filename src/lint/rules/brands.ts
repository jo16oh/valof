import type { Scan } from "../scan.ts";

/**
 * A brand string that more than one type alias claims. Two Vals with the same brand and the same
 * payload are silently assignable to each other, which is the whole failure the brand exists to
 * prevent.
 */
export type DuplicateBrand = {
  kind: "duplicate-brand";
  file: string;
  line: number;
  brand: string;
  /** The alias that claims it, as written. */
  alias: string;
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
export function duplicateBrands(scans: readonly Scan[]): DuplicateBrand[] {
  const claims = new Map<string, DuplicateBrand[]>();
  for (const { file, brands, imported } of scans) {
    for (const { typeName, brand, alias, line } of brands) {
      if ((imported.get(typeName) ?? typeName) !== "Val") continue;
      const claimed = claims.get(brand) ?? [];
      claimed.push({ kind: "duplicate-brand", file, line, brand, alias });
      claims.set(brand, claimed);
    }
  }
  return [...claims.values()].filter((claimed) => claimed.length > 1).flat();
}
