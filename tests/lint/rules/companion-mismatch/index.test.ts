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

test("looks through parentheses around companion type arguments", async () => {
  expect(await lint("parenthesized")).toEqual([
    { rule: CompanionMismatch, at: "parenthesized.ts:4:14" },
    { rule: CompanionMismatch, at: "parenthesized.ts:5:14" },
  ]);
});

test("names the Enum an aliased companion is for", async () => {
  expect(await lint("enum")).toEqual([{ rule: CompanionMismatch, at: "enum.ts:4:14" }]);
  expect(await messages("enum")).toEqual([
    "Shapes is the companion for Shape, and should be named Shape",
  ]);
});

test("reports a variant bound to a name other than its own, and nothing else taken off one", async () => {
  expect(await lint("enum-variant")).toEqual([
    { rule: CompanionMismatch, at: "enum-variant.ts:6:25" },
    { rule: CompanionMismatch, at: "enum-variant.ts:7:7" },
  ]);
  expect(await messages("enum-variant")).toEqual([
    "Round is Shape.Square under another name; call Shape.Square, or bind it to Square",
    "Disc is Shape.Circle under another name; call Shape.Circle, or bind it to Circle",
  ]);
});

// The type rejects this one, and `VariantOf` names no companion either way: reporting it would
// name a type argument the user never declared.
test("says nothing about a type argument that takes type arguments of its own", async () => {
  expect(await lint("generic-argument")).toEqual([]);
});

test("expands a local alias for the variants, and says nothing where none is settled", async () => {
  expect(await lint("enum-alias")).toEqual([{ rule: CompanionMismatch, at: "enum-alias.ts:8:7" }]);
  expect(await lint("enum-unsettled")).toEqual([]);
});
