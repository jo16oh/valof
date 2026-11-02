import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { claims } from "./claims.ts";
import { over, render } from "./format.ts";
import { BundleSize } from "./measure/index.ts";
import { Bundle, Imports } from "./bundle.ts";
import { Suite } from "./suite.ts";

export const suite = Suite.seal([
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

export class OverBudgetError extends ErrorFactory({
  message: ({ lines }) => lines.join("\n"),
  fields: ErrorFactory.fields<{ lines: string[] }>(),
}) {}

/**
 * Measures every bundle against its budget, then the claims against the base bundle's size.
 * Expects `dist` to be built.
 */
export async function checkSize(options: { release: boolean; write: boolean }) {
  const measured = await Suite.measure(suite);
  if (R.isFailure(measured)) return measured;
  console.log(render(measured.value));

  const overs = measured.value.bundles.filter(BundleSize.over).map(over);
  // The claims are read even when a bundle is over budget, so a stale claim shows together
  // with the over-budget error.
  console.log();
  const base = measured.value.bundles.find(({ bundle }) => bundle.base);
  const claimed = await claims(base?.build.production.sizes.gzip ?? Number.NaN, options);
  if (overs.length > 0) return R.fail(new OverBudgetError({ lines: overs }));
  return claimed;
}
