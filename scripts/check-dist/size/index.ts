import { Result as R } from "@praha/byethrow";
import { Val } from "#valof";

import { Budget, OverBudgetError } from "../report.ts";
import { Check } from "../run.ts";

import { claims, type ClaimCountError, type StaleClaimError } from "./claims.ts";
import { render } from "./format.ts";
import { BundleSize } from "./measure/index.ts";
import { Bundle, Imports } from "./bundle.ts";
import { Suite, type MeasureError } from "./suite.ts";

const suite = Suite.seal([
  Bundle.seal({
    name: "Val",
    base: true,
    imports: Imports.seal({ "./dist/index.js": ["Val.companion"] }),
    budget: 1024,
  }),
  Bundle.seal({
    name: "Equals",
    imports: Imports.seal({ "./dist/index.js": ["equals"] }),
    budget: 256,
  }),
  Bundle.seal({
    name: "Trait",
    imports: Imports.seal({ "./dist/index.js": ["Trait.companion"] }),
    budget: 256,
  }),
  Bundle.seal({
    name: "Enum",
    imports: Imports.seal({ "./dist/index.js": ["Enum.companion"] }),
    budget: 640,
  }),
  Bundle.seal({
    name: "Equals + Enum + Trait",
    imports: Imports.seal({
      "./dist/index.js": ["equals", "Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
  Bundle.seal({
    name: "All",
    imports: Imports.seal({
      "./dist/index.js": ["equals", "Val.of", "Val.unwrap", "Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
]);

/**
 * Measures every bundle against its budget, then the claims against the base bundle's size.
 * Expects `dist` to be built.
 */
export async function checkSize(options: {
  release: boolean;
  write: boolean;
}): R.ResultAsync<void, MeasureError | OverBudgetError | ClaimCountError | StaleClaimError> {
  const measured = await Suite.measure(suite);
  if (R.isFailure(measured)) return measured;
  console.log(render(measured.value));

  const over = measured.value.bundles.map(BundleSize.budget).filter(Budget.over);
  // The claims are read even when a bundle is over budget, so a stale claim shows together
  // with the over-budget error.
  console.log();
  const base = measured.value.bundles.find(({ bundle }) => bundle.base);
  const claimed = await claims(base?.build.production.sizes.gzip ?? Number.NaN, options);
  if (over.length > 0) return R.fail(new OverBudgetError({ over }));
  return claimed;
}

export type SizeCheck = Val<"SizeCheck", { name: string; release: boolean; write: boolean }, Check>;
export const SizeCheck = Val.companion<SizeCheck>()
  .implCreate(({ release, write }: { release: boolean; write: boolean }) => ({
    name: "size",
    release,
    write,
  }))
  .implTrait(Check, () => ({ run: (check) => checkSize(check) }))
  .build();
