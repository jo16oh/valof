import { renameSync, writeFileSync } from "node:fs";

import { Result as R } from "@praha/byethrow";

import { Position } from "../../../../parse/ast.ts";
import {
  LinterWorker,
  WorkerFailure,
  type Reply,
} from "../../../../eslint-plugin/linter-worker.ts";
import { FilePath } from "../../../../shared/files.ts";
import { Finding, Kind } from "../../../../rules/index.ts";

function main(): void {
  /** How many queries this thread has answered. */
  let asked = 0;

  // Answers by the file the query's overlay names, and an overlay that names none as `count` does:
  // says how many queries it was asked, says its `NODE_ENV`, rejects, answers with what cannot be
  // sent, or wedges, writing a count to the path in its text for as long as the thread runs. Each
  // count is renamed into place, so a reader never sees one half written. Anything else is echoed
  // back, with its text.
  LinterWorker.serve(
    async ({ overlay }) => {
      const [file = "", text = ""] = Object.entries(overlay)[0] ?? [];
      asked++;
      if (file === "count" || file === "") return says(file, `asked ${asked}`);
      if (file === "wedge") {
        for (let count = 1; ; count++) {
          writeFileSync(`${text}.next`, String(count));
          renameSync(`${text}.next`, text);
        }
      }
      if (file === "env") return says(file, String(process.env["NODE_ENV"]));
      if (file === "reject") throw new Error("rejected");
      // A function cannot be cloned, even as a property of the list, which is what this one is for.
      if (file === "uncloneable") {
        const findings: Finding[] = [];
        return R.succeed(Object.assign(findings, { send: () => file }));
      }
      return says(file, `answered ${file} ${text}`.trim());
    },
    (error) => R.fail(WorkerFailure.seal({ message: `failed: ${String(error)}` })),
  );
}

/** A reply holding one finding that says `message`. */
function says(file: string, message: string): Reply {
  return R.succeed([
    Finding.seal({
      kind: Kind.seal("unused-member"),
      file: FilePath.seal(file),
      at: Position.seal({ line: 1, column: 1 }),
      message,
    }),
  ]);
}

main();
