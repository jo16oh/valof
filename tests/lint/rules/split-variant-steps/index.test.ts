import { expect, test } from "vite-plus/test";

import { SplitVariantSteps, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a variant whose steps resume after another's, and spares one written together", async () => {
  expect(await lint("chains")).toEqual([{ rule: SplitVariantSteps, at: "chains.ts:7:4" }]);
  expect(await messages("chains")).toEqual([
    "Shape.Circle's steps are split by another variant's; write this one beside them",
  ]);
});
