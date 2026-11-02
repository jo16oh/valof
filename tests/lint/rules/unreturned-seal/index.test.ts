import { expect, test } from "vite-plus/test";

import { UnreturnedSeal, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a seal call held outside the return beside a noseal create, and nothing else", async () => {
  expect(await lint("seals")).toEqual([{ rule: UnreturnedSeal, at: "seals.ts:8:16" }]);
  expect(await messages("seals")).toEqual([
    "Id's seal holds the default seal's result outside its return, and production skips the check after it; return seal(…) itself",
  ]);
});
