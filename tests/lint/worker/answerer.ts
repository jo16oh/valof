import { threadId } from "node:worker_threads";

import { serve } from "../../../src/lint/worker.ts";

// Answers a question with itself, and for the ones named here names its thread, rejects or answers
// with what cannot be sent. A counter wedges it, counting up for as long as the thread runs.
serve(
  async (question: string | Int32Array) => {
    if (typeof question !== "string") for (;;) Atomics.add(question, 0, 1);
    if (question === "thread") return `thread ${threadId}`;
    if (question === "reject") throw new Error("rejected");
    if (question === "uncloneable") return () => question;
    return `answered ${question}`;
  },
  (error) => `failed: ${String(error)}`,
);
