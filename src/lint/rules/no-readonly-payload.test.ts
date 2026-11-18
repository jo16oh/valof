import { expect, test } from "vite-plus/test";

import { fixtures, ReadonlyPayload } from "../integration-tests/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports readonly in a Val's payload, a record's value, a variant, an enum's shared fields, and a tuple's named and rest elements", async () => {
  expect(await lint("written")).toEqual(
    [
      "3:40",
      "3:59",
      "4:49",
      "4:63",
      "7:20",
      "8:19",
      "10:60",
      "11:32",
      "11:50",
      "12:43",
      "12:75",
      "13:45",
    ].map((at) => ({
      rule: ReadonlyPayload,
      at: `written.ts:${at}`,
    })),
  );
});

test("says what to write for each spelling", async () => {
  const said = await messages("written");
  expect([said[0], said[2], said[4]]).toEqual([
    "a Val's payload is already readonly; drop `readonly`, since `Val.unwrap` returns the payload as written",
    "a Val's payload is already readonly; write `T[]` for `ReadonlyArray<T>`, since `Val.unwrap` returns the payload as written",
    "a Val's payload is already readonly; write the type `Readonly<…>` wraps, since `Val.unwrap` returns the payload as written",
  ]);
});

test("spares readonly outside a payload, and in an alias the payload names", async () => {
  expect(await lint("elsewhere")).toEqual([]);
});
