import { Result as R } from "better-result";
import { budgets, json, over, sizes } from "./format.ts";
import { checkProduction, capped, measure, pack } from "./measure.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  /**
   * Builds `dist`, measures the suite, and prints its sizes and budgets, or the sizes as JSON with
   * `--json`. Sets a failing exit code when a step fails or a bundle is over its budget.
   */
  run: async (suite: Suite): Promise<void> => {
    const measured = await R.gen(async function* () {
      yield* R.await(pack());
      const baseImports = yield* Suite.base(suite);
      const results = yield* R.await(Suite.measure(suite, measure));
      const [only, ...more] = results.filter(({ bundle }) => bundle.base);
      // With one base bundle, the base is that bundle, already measured.
      const base =
        only !== undefined && more.length === 0 ? only : yield* R.await(measure(baseImports));
      for (const each of [base, ...results]) yield* checkProduction(each);
      return R.ok({ base, results, extra: base === only ? [] : [base] });
    });

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
