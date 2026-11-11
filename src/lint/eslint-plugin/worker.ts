import { Result as R } from "@praha/byethrow";

import { pipe } from "../../shared/pipe/index.ts";
import { Options } from "../options.ts";
import { run } from "../run.ts";
import { serve } from "./serve.ts";

// The worker the plugin asks, one file at a time. See `LinterWorker`.
serve(
  async ({ project, file, text }) =>
    pipe(
      await run(project, Options.create({ targets: [file], overlay: [[file, text]] })),
      // The message the command prints, so a user of the plugin gets the same instruction.
      R.mapError((error) => error.message),
    ),
  (error) => R.fail(`valof-lint: ${String(error)}`),
);
