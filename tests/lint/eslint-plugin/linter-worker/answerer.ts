import { writeFileSync } from "node:fs";
import { threadId } from "node:worker_threads";

import { Position } from "../../../../src/lint/ast.ts";
import { Reply } from "../../../../src/lint/eslint-plugin/messages.ts";
import { serve } from "../../../../src/lint/eslint-plugin/serve.ts";
import { FilePath } from "../../../../src/lint/files.ts";
import { Finding, Kind } from "../../../../src/lint/rules/index.ts";

/** A reply holding one finding that says `message`. */
const says = (file: string, message: string): Reply =>
  Reply.Found.create({
    findings: [
      Finding.seal({
        kind: Kind.seal("unused-member"),
        file: FilePath.seal(file),
        at: Position.seal({ line: 1, column: 1 }),
        message,
      }),
    ],
  });

// Answers by the query's `file`: names its thread, rejects, answers with what cannot be sent, or
// wedges, writing a count to the path in `text` for as long as the thread runs. Anything else is
// echoed back.
serve(
  async ({ file, text }) => {
    if (file === "wedge") for (let count = 1; ; count++) writeFileSync(text, String(count));
    if (file === "reject") throw new Error("rejected");
    // A function cannot be cloned, which is what this one is for.
    if (file === "uncloneable")
      return Reply.Found.create({ findings: [(() => file) as unknown as Finding] });
    return says(file, file === "thread" ? `thread ${threadId}` : `answered ${file}`);
  },
  (error) => Reply.Failed.create({ message: `failed: ${String(error)}` }),
);
