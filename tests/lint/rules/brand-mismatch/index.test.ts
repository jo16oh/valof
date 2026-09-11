import { expect, test } from "vite-plus/test";

import { BrandMismatch, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("says nothing when the brand ends in the name of the type it brands", async () => {
  expect(await lint("matching")).toEqual([]);
});

test("names the brand the type should have claimed", async () => {
  expect(await lint("mismatched")).toEqual([
    {
      rule: BrandMismatch,
      at: "mismatched.ts:3:13",
    },
  ]);
  expect(await messages("mismatched")).toEqual([
    'EmailAddress claims the brand "Email", which should be "EmailAddress"',
  ]);
});

test("keeps the namespace it was given, and requires nothing of it", async () => {
  expect(await lint("namespaced")).toEqual([
    {
      rule: BrandMismatch,
      at: "namespaced.ts:3:13",
    },
  ]);
  expect(await messages("namespaced")).toEqual([
    'BillingId claims the brand "billing/Id", which should be "billing/BillingId"',
  ]);
});

test("applies the same check to Trait through renamed and namespace imports", async () => {
  expect(await lint("trait")).toEqual([
    {
      rule: BrandMismatch,
      at: "trait.ts:4:13",
    },
  ]);
  expect(await messages("trait")).toEqual([
    'Named claims the brand "Name", which should be "Named"',
  ]);
});
