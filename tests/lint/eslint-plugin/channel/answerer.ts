import { writeFileSync } from "node:fs";
import { threadId } from "node:worker_threads";

import { serve } from "../../../../src/lint/eslint-plugin/channel.ts";
import { Reply } from "../../../../src/lint/eslint-plugin/messages.ts";

// Answers by the query's `file`: names its thread, rejects, answers with what cannot be sent, or
// wedges, writing a count to the path in `text` for as long as the thread runs. Anything else is
// echoed back. What it says goes in a failure's message, the one reply that carries text.
serve(
  async ({ file, text }) => {
    if (file === "wedge") for (let count = 1; ; count++) writeFileSync(text, String(count));
    if (file === "reject") throw new Error("rejected");
    // A function cannot be cloned, which is what this one is for.
    if (file === "uncloneable")
      return { ...Reply.Failed.create({ message: file }), send: () => file } as unknown as Reply;
    return Reply.Failed.create({
      message: file === "thread" ? `thread ${threadId}` : `answered ${file}`,
    });
  },
  (error) => Reply.Failed.create({ message: `failed: ${String(error)}` }),
);
