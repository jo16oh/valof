import { Result as R } from "@praha/byethrow";

import { pipe } from "../../shared/pipe/index.ts";
import { Options } from "../options.ts";
import { ScanCache } from "../scan-cache.ts";
import { ScanStore } from "../scan-store.ts";
import { run } from "../run.ts";
import { LinterWorker, WorkerFailure } from "./linter-worker.ts";

// The worker the plugin asks, one project state at a time. Each run walks again only the files
// whose text changed since the last, unless the files in the run changed. The store keeps the scans
// for the next process. The worker writes it after a run over a buffer that disk holds, before
// answering, because the host may exit as soon as it has the answer.
const store = ScanStore.open();
const cache = new ScanCache(store);

LinterWorker.serve(
  async ({ project, overlay, model, saved }) => {
    const ran = await run(
      project,
      Options.create({
        overlay: Object.entries(overlay),
        enable: { "data-type-outside-valof": model },
      }),
      cache,
    );
    if (saved) {
      store.save();
    }

    // The message the command prints, so a user of the plugin gets the same instruction.
    return pipe(
      ran,
      R.mapError((error) => WorkerFailure.seal({ message: error.message })),
    );
  },
  (error) => R.fail(WorkerFailure.seal({ message: `valof-lint: ${String(error)}` })),
);
