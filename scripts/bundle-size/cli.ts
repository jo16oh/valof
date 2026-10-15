import { over, report } from "./format.ts";
import { capped } from "./measure.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  /**
   * Measures the suite, and prints its sizes and budgets, or the sizes as JSON with `--json`. Sets a
   * failing exit code when measuring fails or a bundle is over its budget.
   */
  run: async (suite: Suite): Promise<void> => {
    process.exitCode = (await Suite.measure(suite)).match({
      ok: (measurement) => {
        const { base, results } = measurement;
        console.log(report(measurement, process.argv.includes("--json")));
        const overs = results
          .filter((result) => capped(result, base) > result.bundle.budget)
          .map((result) => over(result, base));
        for (const line of overs.length > 0 ? ["", ...overs] : []) console.error(line);
        return overs.length > 0 ? 1 : 0;
      },
      err: (error) => {
        console.error(error.message);
        return 1;
      },
    });
  },
};
