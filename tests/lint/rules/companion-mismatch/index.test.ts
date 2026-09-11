import { expect, test } from "vite-plus/test";

import { CompanionMismatch, SplitCompanion, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("says nothing when the companion carries the name of its type", async () => {
  expect(await lint("matching")).toEqual([]);
});

test("names the type the companion should have been named after", async () => {
  expect(await lint("mismatched")).toEqual([
    {
      rule: CompanionMismatch,
      at: "mismatched.ts:5:7",
    },
  ]);
  expect(await messages("mismatched")).toEqual([
    "Account is the companion for User, and should be named User",
  ]);
});

test("reports a builder held in a variable, which names the constructor twice", async () => {
  expect(await lint("held-in-a-variable")).toEqual([
    {
      rule: CompanionMismatch,
      at: "held-in-a-variable.ts:5:7",
    },
  ]);
  expect(await messages("held-in-a-variable")).toEqual([
    "seal is the companion for User, and should be named User",
  ]);
});

// The type is elsewhere, which is the split-companion rule's finding, not this one's.
test("steps past a namespace, so the name it compares is the declaring module's", async () => {
  expect(await lint("namespaced", { skip: [SplitCompanion] })).toEqual([]);
});

test("says nothing about a chain bound to no plain name", async () => {
  expect(await lint("no-name")).toEqual([]);
});

test("applies the same naming rule to Trait companions", async () => {
  expect(await lint("trait")).toEqual([{ rule: CompanionMismatch, at: "trait.ts:3:14" }]);
  expect(await messages("trait")).toEqual([
    "Friendly is the companion for Greetable, and should be named Greetable",
  ]);
});
