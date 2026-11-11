import { expect, test } from "vite-plus/test";

import { CompanionMismatch, HiddenStateInImpl, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a step function that declares something, and spares a block that only returns, a seal, a held function and a chain that is not a companion", async () => {
  // A held builder is a companion under a second name too, which this rule does not report.
  expect(await lint("steps", { skip: [CompanionMismatch] })).toEqual([
    { rule: HiddenStateInImpl, at: "steps.ts:5:9" },
    { rule: HiddenStateInImpl, at: "steps.ts:17:21" },
    { rule: HiddenStateInImpl, at: "steps.ts:24:14" },
    { rule: HiddenStateInImpl, at: "steps.ts:33:16" },
    { rule: HiddenStateInImpl, at: "steps.ts:45:23" },
  ]);
  expect((await messages("steps", { skip: [CompanionMismatch] })).slice(0, 3)).toEqual(
    ["impl", "implTrait", "implAssoc"].map(
      (step) =>
        `the function passed to .${step} declares state its members share; move what it declares out of the companion, and return the object itself: () => ({ … })`,
    ),
  );
});
