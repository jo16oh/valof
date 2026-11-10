import { Result as R } from "@praha/byethrow";

import { Ask, Reply } from "./messages.ts";
import { Options } from "../options.ts";
import { run } from "../run.ts";
import { serve } from "../worker.ts";

// The worker the plugin asks, one file at a time. See `ask` in `index.ts`.
serve<Ask, Reply>(
  async ({ project, file, text }) => {
    const found = await run(project, Options.create({ targets: [file], overlay: [[file, text]] }));
    // The message the command prints, so a user of the plugin gets the same instruction.
    return R.isSuccess(found)
      ? Reply.Found.create({ findings: found.value })
      : Reply.Failed.create({ message: found.error.message });
  },
  (error) => Reply.Failed.create({ message: `valof-lint: ${String(error)}` }),
);
