import { renameSync, writeFileSync } from "node:fs";

import { Result as R } from "@praha/byethrow";

import { Position } from "../../../../src/lint/ast.ts";
import { LinterWorker, type Reply } from "../../../../src/lint/eslint-plugin/linter-worker.ts";
import { FilePath } from "../../../../src/lint/files.ts";
import { Finding, Kind } from "../../../../src/lint/rules/index.ts";

/** A reply holding one finding that says `message`. */
const says = (file: string, message: string): Reply =>
  R.succeed([
    Finding.seal({
      kind: Kind.seal("unused-member"),
      file: FilePath.seal(file),
      at: Position.seal({ line: 1, column: 1 }),
      message,
    }),
  ]);

/** How many queries this thread has answered. */
let asked = 0;

// Answers by the file the query's overlay names, and an overlay that names none as `count` does:
// says how many queries it was asked, rejects, answers with what cannot be sent, or wedges, writing
// a count to the path in its text for as long as the thread runs. Each count is renamed into place,
// so a reader never sees one half written. Anything else is echoed back, with its text.
LinterWorker.serve(
  async ({ overlay }) => {
    const [file = "", text = ""] = Object.entries(overlay)[0] ?? [];
    asked++;
    if (file === "count" || file === "") return says(file, `asked ${asked}`);
    if (file === "wedge")
      for (let count = 1; ; count++) {
        writeFileSync(`${text}.next`, String(count));
        renameSync(`${text}.next`, text);
      }
    if (file === "reject") throw new Error("rejected");
    // A function cannot be cloned, even as a property of the list, which is what this one is for.
    if (file === "uncloneable") {
      const findings: Finding[] = [];
      return R.succeed(Object.assign(findings, { send: () => file }));
    }
    return says(file, `answered ${file} ${text}`.trim());
  },
  (error) => R.fail(`failed: ${String(error)}`),
);
