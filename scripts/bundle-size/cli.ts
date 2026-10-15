import { budgets, json, over, sizes } from "./format.ts";
import { capped } from "./measure.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  /**
   * Measures the suite, and prints its sizes and budgets, or the sizes as JSON with `--json`. Sets a
   * failing exit code when measuring fails or a bundle is over its budget.
   */
  run: async (suite: Suite): Promise<void> => {
    const measured = await Suite.measure(suite);

    if (measured.isErr()) {
      console.error(measured.error.message);
      process.exitCode = 1;
      return;
    }
    const { base, results, extra } = measured.value;

    if (process.argv.includes("--json")) {
      console.log(json(results));
    } else {
      for (const each of [...extra, ...results]) {
        console.log(sizes(each));
        console.log();
      }
      console.log(budgets(results, base));
    }

    const exceeded = results.filter((result) => capped(result, base) > result.bundle.budget);
    if (exceeded.length > 0) {
      console.error();
      for (const result of exceeded) console.error(over(result, base));
      process.exitCode = 1;
    }
  },
};
