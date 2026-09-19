import { expect, test } from "vite-plus/test";

import { CompanionMismatch, UnimplementedTrait, UnusedMember, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports each Trait a Val declares but does not implement", async () => {
  expect(await lint("missing")).toEqual([
    { rule: UnimplementedTrait, at: "missing.ts:4:50" },
    { rule: UnimplementedTrait, at: "missing.ts:7:64" },
    { rule: UnimplementedTrait, at: "missing.ts:10:52" },
  ]);
  expect(await messages("missing")).toEqual([
    "User declares Greetable, but its companion does not implement it",
    "Admin declares Named, but its companion does not implement it",
    "Guest declares Named, but its companion does not implement it",
  ]);
});

test("accepts both implTrait forms and every step in a chain", async () => {
  expect(await lint("implemented")).toEqual([]);
});

test("looks through parentheses in a Trait intersection and its alias", async () => {
  expect(await lint("parenthesized")).toEqual([
    { rule: UnimplementedTrait, at: "parenthesized.ts:4:63" },
    { rule: UnimplementedTrait, at: "parenthesized.ts:8:52" },
  ]);
  expect(await messages("parenthesized")).toEqual([
    "User declares Named, but its companion does not implement it",
    "Admin declares Named, but its companion does not implement it",
  ]);
});

test("matches renamed and namespace imports", async () => {
  expect(await lint("imports")).toEqual([]);
});

test("keeps same-named Traits from different modules distinct", async () => {
  expect(await lint("identity")).toEqual([
    { rule: UnimplementedTrait, at: "identity/barrels.ts:4:45" },
    { rule: UnimplementedTrait, at: "identity/namespace.ts:4:60" },
    { rule: UnimplementedTrait, at: "identity/renamed.ts:4:47" },
  ]);
});

test("keeps following a Val builder held in a variable", async () => {
  expect(await lint("builder", { skip: [CompanionMismatch] })).toEqual([]);
});

test("reports a Trait an Enum declares and its companion leaves out", async () => {
  expect(await lint("enum", { skip: [UnusedMember] })).toEqual([
    { rule: UnimplementedTrait, at: "enum.ts:11:3" },
  ]);
  expect(await messages("enum", { skip: [UnusedMember] })).toEqual([
    "Shape declares Labelled, but its companion does not implement it",
  ]);
});

// An enum's third argument carries the shared fields and the tag as well, and neither is a
// promise to implement anything.
test("says nothing about a shared field, a tag, or a Trait the enum implements", async () => {
  expect(await lint("enum-implemented", { skip: [UnusedMember] })).toEqual([]);
});
