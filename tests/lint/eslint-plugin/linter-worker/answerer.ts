import { renameSync, writeFileSync } from "node:fs";
import { threadId } from "node:worker_threads";

import { Result as R } from "@praha/byethrow";

import { Position } from "../../../../src/lint/ast.ts";
import type { Reply } from "../../../../src/lint/eslint-plugin/messages.ts";
import { serve } from "../../../../src/lint/eslint-plugin/serve.ts";
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

// Answers by the query's `file`: names its thread, rejects, answers with what cannot be sent, or
// wedges, writing a count to the path in `text` for as long as the thread runs. Each count is
// renamed into place, so a reader never sees one half written. Anything else is echoed back, with
// its text.
serve(
  async ({ file, text }) => {
    if (file === "wedge")
      for (let count = 1; ; count++) {
        writeFileSync(`${text}.next`, String(count));
        renameSync(`${text}.next`, text);
      }
    if (file === "reject") throw new Error("rejected");
    // A function cannot be cloned, which is what this one is for.
    if (file === "uncloneable") return R.succeed([(() => file) as unknown as Finding]);
    return says(file, file === "thread" ? `thread ${threadId}` : `answered ${file} ${text}`.trim());
  },
  (error) => R.fail(`failed: ${String(error)}`),
);
