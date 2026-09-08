import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("says nothing when the brand ends in the name of the type it brands", async () => {
  expect(await lint("matching")).toEqual([]);
});

test("names the brand the type should have claimed", async () => {
  expect(await lint("mismatched")).toEqual([
    'mismatched.ts:3:13  brand-mismatch  EmailAddress claims the brand "Email", which should be "EmailAddress"',
  ]);
});

test("keeps the namespace it was given, and requires nothing of it", async () => {
  expect(await lint("namespaced")).toEqual([
    'namespaced.ts:3:13  brand-mismatch  BillingId claims the brand "billing/Id", which should be "billing/BillingId"',
  ]);
});
