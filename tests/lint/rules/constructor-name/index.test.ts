import { expect, test } from "vite-plus/test";

import { ConstructorName, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a constructor named otherwise, and a member of .impl named as one", async () => {
  expect(await lint("money")).toEqual([
    { rule: ConstructorName, at: "money.ts:8:5" },
    { rule: ConstructorName, at: "money.ts:9:5" },
    { rule: ConstructorName, at: "money.ts:11:5" },
    { rule: ConstructorName, at: "money.ts:17:5" },
    { rule: ConstructorName, at: "money.ts:27:5" },
    { rule: ConstructorName, at: "money.ts:37:25" },
  ]);
  expect(await messages("money")).toEqual([
    "Money.read makes a Money; name it from*, parse* or create*",
    "Money.random makes a Money; name it from*, parse* or create*",
    "Money.sum makes a Money; name it from*, parse* or create*",
    "Money.fromYears is named like a constructor, and takes a Money; move it to .implAssoc, or rename it",
    // A function expression makes one too, and a variant's step is read past the one after it.
    "Rate.load makes a Rate; name it from*, parse* or create*",
    "Shape.fromSide is named like a constructor, and takes a Shape; move it to .implAssoc, or rename it",
  ]);
});
