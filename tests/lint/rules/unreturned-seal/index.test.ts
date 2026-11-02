import { expect, test } from "vite-plus/test";

import { UnreturnedSeal, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a seal call held outside the return in a chain with .implCreate.noseal, and nothing else", async () => {
  expect(await lint("seals")).toEqual([{ rule: UnreturnedSeal, at: "seals.ts:8:16" }]);
  expect(await messages("seals")).toEqual([
    "Id's seal keeps the default seal's result outside its return, so a value it rejects can still be created; return seal(…) itself",
  ]);
});
