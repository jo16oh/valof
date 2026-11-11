import { expect, test } from "vite-plus/test";

import { UnrelatedAssoc, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a member that names the type nowhere, and spares one that names it", async () => {
  expect(await lint("money")).toEqual([
    { rule: UnrelatedAssoc, at: "money.ts:10:5" },
    { rule: UnrelatedAssoc, at: "money.ts:11:5" },
  ]);
  expect((await messages("money"))[1]).toBe(
    "Money.format names neither Money nor a seal or create; move it out of the companion",
  );
});

test("reads a member passed by name through the function it names", async () => {
  expect(await lint("passed")).toEqual([
    { rule: UnrelatedAssoc, at: "passed.ts:10:5" },
    { rule: UnrelatedAssoc, at: "passed.ts:11:5" },
    { rule: UnrelatedAssoc, at: "passed.ts:15:5" },
    { rule: UnrelatedAssoc, at: "passed.ts:16:5" },
    { rule: UnrelatedAssoc, at: "passed.ts:17:5" },
  ]);
});
