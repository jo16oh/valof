import { Result as R } from "better-result";
import { over, render } from "./format.ts";
import { BundleSize } from "./measure/index.ts";
import { Suite } from "./suite.ts";
import { flow } from "../shared/pipe/index.ts";

export const Cli = {
  run: async (suite: Suite): Promise<void> => {
    process.exitCode = await flow(
      suite,
      Suite.measure,
      R.match({
        ok: (report) => {
          console.log(render(report, process.argv.includes("--json")));

          const overs = report.bundles.filter(BundleSize.over).map(over);
          for (const line of overs.length > 0 ? ["", ...overs] : []) {
            console.error(line);
          }

          return overs.length > 0 ? 1 : 0;
        },
        err: (error) => {
          console.error(error.message);
          return 1;
        },
      }),
    );
  },
};
