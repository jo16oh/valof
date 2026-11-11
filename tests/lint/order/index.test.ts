import { expect, test } from "vite-plus/test";

import { BypassedCompanion, UnusedMember, fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

test("orders findings on one line by column, not by kind", async () => {
  expect(await lint("same-line")).toEqual([
    { rule: UnusedMember, at: "same-line.ts:3:50" },
    { rule: BypassedCompanion, at: "same-line.ts:3:85" },
  ]);
});
