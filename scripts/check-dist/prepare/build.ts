import { join } from "node:path";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { output, root, run } from "../../shared/repository.ts";

export class BuildError extends ErrorFactory({
  name: "BuildError",
  message: ({ output }) => `vp run build failed\n${output}`,
  fields: ErrorFactory.fields<{ output: string }>(),
}) {}

/** Builds `dist`, which every check reads: the consumer's entry, not `src`. Called once per run. */
export function build(): R.ResultAsync<void, BuildError> {
  return R.try({
    try: async () => {
      await run(join(root, "node_modules/.bin/vp"), ["run", "build"], { cwd: root });
    },
    catch: (cause) => new BuildError({ output: output(cause), cause }),
  });
}
