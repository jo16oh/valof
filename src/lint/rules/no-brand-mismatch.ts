import { Val } from "../../lib/index.ts";
import { ImportMap, type Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/**
 * A brand that does not end in the name of the type it brands. TypeScript cannot derive `X` from
 * `type X = Val<…>`, so the brand string is the type's name written a second time, and only a
 * rule keeps the two from drifting apart.
 */
export type BrandMismatch = Val<"BrandMismatch", { kind: Kind }, Rule>;
export const BrandMismatch = Val.companion<BrandMismatch>()
  .implCreate(() => ({
    kind: Kind.seal("no-brand-mismatch"),
    description: "a brand whose last segment is not the name of the type it brands",
    warns: false,
    optIn: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every alias whose brand ends in something other than its own name. Only the last segment
 * is compared, so `Val<"billing/BillingId">` passes. An LSP rename does not change the string
 * literal, so the brand stops matching the name.
 */
function findings({ kind }: BrandMismatch, scans: readonly Scan[]): Finding[] {
  const found: Finding[] = [];
  for (const { file, brands, imported } of scans) {
    for (const { typeName, brand, alias, at } of brands) {
      const owner = ImportMap.nameOf(imported, typeName);
      if (owner !== "Val" && owner !== "Trait" && owner !== "Enum") continue;
      const namespace = brand.slice(0, brand.lastIndexOf("/") + 1);
      if (brand === `${namespace}${alias}`) continue;
      found.push(
        Finding.seal({
          kind,
          file,
          at,
          message: `${alias} claims the brand "${brand}", which should be "${namespace}${alias}"`,
        }),
      );
    }
  }
  return found;
}
