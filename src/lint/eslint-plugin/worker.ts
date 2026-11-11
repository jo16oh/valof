import { Result as R } from "@praha/byethrow";

import { pipe } from "../../shared/pipe/index.ts";
import { Options } from "../options.ts";
import { ParseCache } from "../parse-cache.ts";
import { run } from "../run.ts";
import { LinterWorker } from "./linter-worker.ts";

// The worker the plugin asks, one project state at a time. Each run re-parses only the files whose
// text changed since the last.
const cache = new ParseCache();

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
