import { expect, test } from "vite-plus/test";

import {
  CompanionMismatch,
  UnimplementedTrait,
  UnusedMember,
  fixtures,
} from "../integration/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports each Trait a Val declares but does not implement", async () => {
  expect(await lint("missing")).toEqual([
    { rule: UnimplementedTrait, at: "missing.ts:5:50" },
    { rule: UnimplementedTrait, at: "missing.ts:8:64" },
    { rule: UnimplementedTrait, at: "missing.ts:11:52" },
  ]);
  expect(await messages("missing")).toEqual([
    "User declares Greetable, but its companion does not implement it",
    "Admin declares Named, but its companion does not implement it",
    "Guest declares Named, but its companion does not implement it",
  ]);
});

test("reports a Trait a Val declares even when no linted file declares the Trait", async () => {
  expect(await messages("unlinted-trait")).toEqual([
    "User declares Greetable, but its companion does not implement it",
  ]);
});

test("accepts implTrait at every step in a chain, `.implCreate.noseal` included", async () => {
  expect(await lint("implemented")).toEqual([]);
});

test("looks through parentheses around the Val the companion is for", async () => {
  expect(await lint("parenthesized-val")).toEqual([]);
});

test("looks through parentheses in a Trait intersection and its alias", async () => {
  expect(await lint("parenthesized")).toEqual([
    { rule: UnimplementedTrait, at: "parenthesized.ts:5:63" },
    { rule: UnimplementedTrait, at: "parenthesized.ts:9:52" },
  ]);
  expect(await messages("parenthesized")).toEqual([
    "User declares Named, but its companion does not implement it",
    "Admin declares Named, but its companion does not implement it",
  ]);
});

test("matches renamed and namespace imports", async () => {
  expect(await lint("imports")).toEqual([]);
});

test("matches a module through a `.js` specifier and a directory import", async () => {
  expect(await lint("specifiers")).toEqual([]);
});

test("keeps same-named Traits from different modules distinct", async () => {
  expect(await lint("identity")).toEqual([
    { rule: UnimplementedTrait, at: "identity/barrels.ts:5:45" },
    { rule: UnimplementedTrait, at: "identity/namespace.ts:5:60" },
    { rule: UnimplementedTrait, at: "identity/renamed.ts:5:47" },
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

test("reports a Trait a variant declares and its companion leaves out", async () => {
  expect(await lint("variant", { skip: [UnusedMember] })).toEqual([
    { rule: UnimplementedTrait, at: "variant.ts:6:91" },
  ]);
  expect(await messages("variant", { skip: [UnusedMember] })).toEqual([
    "Item.Pen declares Named, but its companion does not implement it",
  ]);
});

test("does not let a variant's implementation answer for the enum's Trait", async () => {
  expect(await messages("variant-only", { skip: [UnusedMember] })).toEqual([
    "Item declares Named, but its companion does not implement it",
  ]);
});
