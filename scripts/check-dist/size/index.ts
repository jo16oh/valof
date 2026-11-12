import { Result as R } from "@praha/byethrow";
import { Val, type Dyn } from "#valof";

import { Budget, OverBudgetError } from "../report.ts";
import { Check, Report } from "../run.ts";
import { repository } from "../../shared/repository.ts";

import { Claims, type ClaimCountError, type StaleClaimError } from "./claims.ts";
import { BundleSize } from "./measure/index.ts";
import { Bundle, Imports } from "./bundle.ts";
import { Measurement, Suite, type MeasureError } from "./suite.ts";

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

export type SizeError = MeasureError | OverBudgetError | ClaimCountError | StaleClaimError;

/** What the size check found: each bundle's sizes and budget, then the claims. */
type SizeReport = Val<
  "SizeReport",
  { measurement: Measurement; claims: Claims; release: boolean; write: boolean },
  Report
>;
const SizeReport = Val.companion<SizeReport>()
  .implTrait(Report, () => ({
    render: ({ measurement, claims, write }) =>
      `${Measurement.render(measurement)}\n\n${Claims.render(claims, write)}`,
    // An over-budget bundle fails first. The claims printed above show a stale one beside it.
    verdict: ({ measurement, claims, release, write }): R.Result<void, SizeError> => {
      const over = measurement.bundles.map(BundleSize.budget).filter(Budget.over);
      return over.length > 0
        ? R.fail(new OverBudgetError({ over }))
        : Claims.verdict(claims, { release, write });
    },
  }))
  .build();

export type SizeCheck = Val<"SizeCheck", { name: string; release: boolean; write: boolean }, Check>;
export const SizeCheck = Val.companion<SizeCheck>()
  .implCreate(({ release, write }: { release: boolean; write: boolean }) => ({
    name: "size",
    release,
    write,
  }))
  .implTrait(Check, () => ({
    /**
     * Measures every bundle, then reads the claims against the base bundle's size and rewrites the
     * stale ones with `write`. Expects `dist` to be built.
     */
    run: async ({ release, write }): R.ResultAsync<Dyn<Report>, SizeError> => {
      const measured = await Suite.measure(suite);
      if (R.isFailure(measured)) return measured;
      const measurement = measured.value;

      const base = measurement.bundles.find(({ bundle }) => bundle.base);
      const read = await Claims.read(
        base?.build.production.sizes.gzip ?? Number.NaN,
        release,
        repository,
      );
      if (R.isFailure(read)) return read;
      const claims = read.value;

      if (write) await Claims.rewrite(claims, repository);

      return R.succeed(
        Report.dyn(SizeReport, SizeReport.seal({ measurement, claims, release, write })),
      );
    },
  }))
  .build();
