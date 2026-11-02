import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

const root = new URL("../../", import.meta.url);

export class PackError extends ErrorFactory({
  message: ({ output }) => `vp run build failed\n${output}`,
  fields: ErrorFactory.fields<{ output: string }>(),
}) {}

/** Builds `dist`, which every check reads: the consumer's entry, not `src`. Once per run. */
export function pack(): R.ResultAsync<void, PackError> {
  return R.try({
    try: async () => {
      await promisify(execFile)(
        fileURLToPath(new URL("node_modules/.bin/vp", root)),
        ["run", "build"],
        {
          cwd: fileURLToPath(root),
        },
      );
    },
    catch: (cause) => {
      const { stdout = "", stderr = "" } = cause as { stdout?: string; stderr?: string };
      return new PackError({ output: `${stdout}${stderr}` || String(cause), cause });
    },
  });
}
