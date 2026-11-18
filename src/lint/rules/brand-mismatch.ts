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
    kind: Kind.seal("brand-mismatch"),
    description: "a brand whose last segment is not the name of the type it brands",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every alias whose brand ends in something other than its own name.
 *
 * Only the last segment is compared, so a namespace prefix is free: `Val<"billing/BillingId">`
 * passes and nothing is required of `billing/`. What comes before the last `/` is the user's,
 * and this rule makes no convention for it.
 *
 * Renaming is where the drift comes from. An LSP rename leaves string literals alone, so
 * `OrderId` becomes `PurchaseOrderId` while the brand stays `"OrderId"`, and the assignability
 * error a reader opens then names a type that no longer exists.
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
