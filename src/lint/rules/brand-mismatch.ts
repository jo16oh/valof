import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/**
 * A brand that does not end in the name of the type it brands. TypeScript cannot derive `X` from
 * `type X = Val<…>`, so the brand string is the type's name written a second time, and only a
 * rule keeps the two from drifting apart.
 */
export type BrandMismatch = Where & {
  kind: "brand-mismatch";
  file: string;
  brand: string;
  /** The alias that claims it, as written. */
  alias: string;
  message: string;
};

export const BrandMismatch: Rule<BrandMismatch> = {
  kind: "brand-mismatch",
  description: "a brand whose last segment is not the name of the type it brands",
  run: findings,
};

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
function findings(scans: readonly Scan[]): BrandMismatch[] {
  const found: BrandMismatch[] = [];
  for (const { file, brands, bound } of scans) {
    for (const { typeName, brand, alias, line, column } of brands) {
      if (original(bound, typeName) !== "Val" && original(bound, typeName) !== "Trait") continue;
      const namespace = brand.slice(0, brand.lastIndexOf("/") + 1);
      if (brand === `${namespace}${alias}`) continue;
      found.push({
        kind: "brand-mismatch",
        file,
        line,
        column,
        brand,
        alias,
        message: `${alias} claims the brand "${brand}", which should be "${namespace}${alias}"`,
      });
    }
  }
  return found;
}
