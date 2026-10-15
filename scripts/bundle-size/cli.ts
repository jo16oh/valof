import { over, report } from "./format.ts";
import { MeasuredBundle } from "./measure/index.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  run: async (suite: Suite): Promise<void> => {
    process.exitCode = (await Suite.measure(suite)).match({
      ok: (measurement) => {
        console.log(report(measurement, process.argv.includes("--json")));
        const overs = measurement.results.filter(MeasuredBundle.over).map(over);
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
