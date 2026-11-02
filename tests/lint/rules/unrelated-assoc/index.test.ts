import { expect, test } from "vite-plus/test";

import { UnrelatedAssoc, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a member that names the type nowhere, and spares one that takes, makes or reads it", async () => {
  expect(await lint("money")).toEqual([
    { rule: UnrelatedAssoc, at: "money.ts:10:5" },
    { rule: UnrelatedAssoc, at: "money.ts:11:5" },
  ]);
  expect((await messages("money"))[1]).toBe(
    "Money.format neither takes nor makes a Money; move it out of the companion",
  );
});
