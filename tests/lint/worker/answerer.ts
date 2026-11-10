import { serve } from "../../../src/lint/worker.ts";

// Answers a question with itself, and for the ones named here rejects or answers with what cannot be
// sent. A counter wedges it, counting up for as long as the thread runs.
serve(
  async (question: string | Int32Array) => {
    if (typeof question !== "string") for (;;) Atomics.add(question, 0, 1);
    if (question === "reject") throw new Error("rejected");
    if (question === "uncloneable") return () => question;
    return `answered ${question}`;
  },
  (error) => `failed: ${String(error)}`,
);
