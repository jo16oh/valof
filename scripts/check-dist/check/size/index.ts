import { Result as R } from "@praha/byethrow";

import { Val, type Dyn } from "#valof";

import { REPOSITORY } from "../../../shared/repository.ts";
import { Budget } from "../budget.ts";
import { Check } from "../check.ts";
import { problemLines, Report } from "../report.ts";
import { Claims, type ClaimedFile, type ClaimCountError } from "./claims.ts";
import { BundleSize } from "./measure/index.ts";
import { Measurement, Suite, type MeasureError } from "./suite.ts";

export type SizeError = MeasureError | ClaimCountError;

/** What the size check found: each bundle's sizes and budget, then the claims. */
export type SizeReport = Val<
  "SizeReport",
  { measurement: Measurement; claims: Claims; release: boolean; write: boolean },
  Report
>;
export const SizeReport = Val.companion<SizeReport>()
  .implTrait(Report, () => ({
    render: (report): string =>
      [
        Measurement.render(report.measurement),
        "",
        Claims.render(report.claims, report.write),
        ...problemLines(SizeReport.problems(report)),
      ].join("\n"),
    passed: (report): boolean => SizeReport.problems(report).length === 0,
  }))
  .impl(() => ({
    /** What the measurement found, each bundle over its budget, then each stale claim. */
    problems: ({ measurement, claims, release, write }): string[] => [
      ...Measurement.problems(measurement),
      ...measurement.bundles.map(BundleSize.budget).filter(Budget.over).map(Budget.overLine),
      ...Claims.problems(claims, { release, write }),
    ],
  }))
  .build();

export type SizeCheck = Val<
  "SizeCheck",
  { name: string; suite: Suite; claimed: ClaimedFile[]; release: boolean; write: boolean },
  Check
>;
export const SizeCheck = Val.companion<SizeCheck>()
  .implCreate(
    (options: { suite: Suite; claimed: ClaimedFile[]; release: boolean; write: boolean }) => ({
      name: "size",
      ...options,
    }),
  )
  .implTrait(Check, () => ({
    /**
     * Measures every bundle, then reads the claims against the base bundle's size and rewrites the
     * stale ones with `write`. Expects `dist` to be built.
     */
    run: async ({ suite, claimed, release, write }): R.ResultAsync<Dyn<Report>, SizeError> => {
      const measured = await Suite.measure(suite);
      if (R.isFailure(measured)) return measured;
      const measurement = measured.value;

      const base = measurement.bundles.find(({ bundle }) => bundle.base);
      const read = await Claims.read(
        claimed,
        base?.build.production.sizes.gzip ?? Number.NaN,
        release,
        REPOSITORY,
      );
      if (R.isFailure(read)) return read;
      const claims = read.value;

      if (write) {
        await Claims.rewrite(claims, REPOSITORY);
      }

      return R.succeed(
        Report.dyn(SizeReport, SizeReport.seal({ measurement, claims, release, write })),
      );
    },
  }))
  .build();
