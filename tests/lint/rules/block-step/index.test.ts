import { expect, test } from "vite-plus/test";

import { BlockStep, CompanionMismatch, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a step function with a block body, and spares a seal, a held function and a step on a chain that is not a companion", async () => {
  // A held builder is a companion under a second name too, which this rule does not report.
  expect(await lint("steps", { skip: [CompanionMismatch] })).toEqual([
    { rule: BlockStep, at: "steps.ts:5:9" },
    { rule: BlockStep, at: "steps.ts:16:21" },
    { rule: BlockStep, at: "steps.ts:20:14" },
    { rule: BlockStep, at: "steps.ts:29:16" },
    { rule: BlockStep, at: "steps.ts:37:23" },
  ]);
  expect((await messages("steps", { skip: [CompanionMismatch] })).slice(0, 3)).toEqual(
    ["impl", "implTrait", "implAssoc"].map(
      (step) =>
        `the function passed to .${step} has a block body; move what it declares out of the companion, and return the object itself: () => ({ … })`,
    ),
  );
});
