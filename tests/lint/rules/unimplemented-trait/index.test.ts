import { expect, test } from "vite-plus/test";

import { CompanionMismatch, UnimplementedTrait, fixtures } from "../../support.ts";

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

test("keeps following a Val builder held in a variable", async () => {
  expect(await lint("builder", { skip: [CompanionMismatch] })).toEqual([]);
});
