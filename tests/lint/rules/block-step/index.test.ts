import { expect, test } from "vite-plus/test";

import { BlockStep, CompanionMismatch, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a step function with a block body, and spares a seal, a held function and a step of no companion", async () => {
  // A held builder is a companion under a second name too, which is not this rule's to report.
  expect(await lint("steps", { skip: [CompanionMismatch] })).toEqual([
    { rule: BlockStep, at: "steps.ts:5:9" },
    { rule: BlockStep, at: "steps.ts:16:21" },
    { rule: BlockStep, at: "steps.ts:20:14" },
    { rule: BlockStep, at: "steps.ts:29:16" },
    { rule: BlockStep, at: "steps.ts:37:23" },
  ]);
});

test("says what to write instead", async () => {
  expect((await messages("steps"))[0]).toBe(
    "the function passed to .impl has a block body; return the object itself: () => ({ … })",
  );
});
