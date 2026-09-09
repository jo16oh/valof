import { expect, test } from "vite-plus/test";

import { DuplicateBrand, UnusedMember, fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

// How `Val` is recognised, whatever name it was bound under. Three call sites depend on it: the
// duplicate-brand rule, the alias collection the structural-equals rule reads, and the chain
// analysis behind unused-member. The findings below belong to whichever rule observes the binding
// most cheaply, not to what is under test.

test("a renamed type import still spells Val", async () => {
  expect(await lint("renamed-type")).toEqual([
    {
      rule: DuplicateBrand,
      at: "renamed-type/billing.ts:3:13",
    },
    {
      rule: DuplicateBrand,
      at: "renamed-type/orders.ts:3:13",
    },
  ]);
});

test("a namespace import in a type position steps past the namespace", async () => {
  expect(await lint("namespaced-type")).toEqual([
    {
      rule: DuplicateBrand,
      at: "namespaced-type/billing.ts:3:13",
    },
    {
      rule: DuplicateBrand,
      at: "namespaced-type/orders.ts:3:13",
    },
  ]);
});

test("something else bound to the name Val is left alone", async () => {
  expect(await lint("shadowed-type")).toEqual([]);
});

test("a qualifier that is not a namespace import is not Val", async () => {
  expect(await lint("not-a-namespace")).toEqual([]);
});

test("a helper around Val is not Val", async () => {
  expect(await lint("not-a-val")).toEqual([]);
});

test("a renamed value import still roots a builder chain", async () => {
  expect(await lint("renamed-value")).toEqual([{ rule: UnusedMember, at: "renamed-value.ts:5:3" }]);
});

test("a namespace import in a value position steps past the namespace", async () => {
  expect(await lint("namespaced-value")).toEqual([
    { rule: UnusedMember, at: "namespaced-value.ts:5:3" },
  ]);
});
