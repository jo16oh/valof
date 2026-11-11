import { Result as R } from "@praha/byethrow";

import { pipe } from "../../shared/pipe/index.ts";
import { Options } from "../options.ts";
import { ScanCache } from "../scan-cache.ts";
import { run } from "../run.ts";
import { LinterWorker } from "./linter-worker.ts";

// The worker the plugin asks, one project state at a time. Each run walks again only the files whose
// text changed since the last, unless the files in the run changed.
const cache = new ScanCache();

LinterWorker.serve(
  async ({ project, overlay, model }) =>
    pipe(
      await run(
        project,
        Options.create({
          overlay: Object.entries(overlay),
          enable: { "data-type-outside-valof": model },
        }),
        cache,
      ),
      // The message the command prints, so a user of the plugin gets the same instruction.
      R.mapError((error) => error.message),
    ),
  (error) => R.fail(`valof-lint: ${String(error)}`),
);
