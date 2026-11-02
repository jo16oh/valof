import { expect, test } from "vite-plus/test";

import { CompanionMismatch, UnqualifiedVariant, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a variant bound under its own name, destructured or not, and nothing else taken off", async () => {
  expect(await lint("variants")).toEqual([
    { rule: UnqualifiedVariant, at: "variants.ts:6:9" },
    { rule: CompanionMismatch, at: "variants.ts:6:25" },
    { rule: UnqualifiedVariant, at: "variants.ts:7:7" },
  ]);
});

test("says what to call instead", async () => {
  expect((await messages("variants"))[0]).toBe(
    "Circle is Shape.Circle without the enum it comes from; call Shape.Circle",
  );
});
