import { expect, test } from "vite-plus/test";

import { CompanionMismatch, DetachedVariant, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a variant bound under its own name, destructured or not, and nothing else taken off", async () => {
  // A variant under another name is companion-mismatch's finding.
  expect(await lint("variants", { skip: [CompanionMismatch] })).toEqual([
    { rule: DetachedVariant, at: "variants.ts:6:9" },
    { rule: DetachedVariant, at: "variants.ts:7:7" },
  ]);
  expect((await messages("variants", { skip: [CompanionMismatch] }))[0]).toBe(
    "Circle is Shape.Circle without the enum it comes from; call Shape.Circle",
  );
});
