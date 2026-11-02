import { expect, test } from "vite-plus/test";

import { BlockStep, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a step function with a block body, and spares a seal and a held function", async () => {
  expect(await lint("steps")).toEqual([
    { rule: BlockStep, at: "steps.ts:5:9" },
    { rule: BlockStep, at: "steps.ts:16:20" },
    { rule: BlockStep, at: "steps.ts:20:14" },
    { rule: BlockStep, at: "steps.ts:29:16" },
  ]);
});

test("says what to write instead", async () => {
  expect((await messages("steps"))[0]).toBe(
    "the function passed to .impl has a block body; return the object itself: () => ({ … })",
  );
});
