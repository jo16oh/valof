import { budgets, json, over, sizes } from "./format.ts";
import { capped } from "./measure.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  /**
   * Measures the suite, and prints its sizes and budgets, or the sizes as JSON with `--json`. Sets a
   * failing exit code when measuring fails or a bundle is over its budget.
   */
  run: async (suite: Suite): Promise<void> => {
    process.exitCode = (await Suite.measure(suite)).match({
      ok: ({ base, results, extra }) => {
        console.log(
          process.argv.includes("--json")
            ? json(results)
            : [
                ...[...extra, ...results].map((each) => `${sizes(each)}\n`),
                budgets(results, base),
              ].join("\n"),
        );
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
