import { Result as R } from "@praha/byethrow";
import { over, render } from "./format.ts";
import { BundleSize } from "./measure/index.ts";
import { Suite } from "./suite.ts";

export const Cli = {
  run: async (suite: Suite): Promise<void> => {
    const measured = await Suite.measure(suite);
    if (R.isFailure(measured)) {
      console.error(measured.error.message);
      process.exitCode = 1;
      return;
    }

    console.log(render(measured.value, process.argv.includes("--json")));

    const overs = measured.value.bundles.filter(BundleSize.over).map(over);
    for (const line of overs.length > 0 ? ["", ...overs] : []) {
      console.error(line);
    }

    process.exitCode = overs.length > 0 ? 1 : 0;
  },
};
