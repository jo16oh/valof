import { expect, test } from "vite-plus/test";

import { BypassedCompanion, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("names the seal a companion has without `implSeal`", async () => {
  expect(await lint("constructor")).toEqual([
    {
      rule: BypassedCompanion,
      at: "constructor.ts:9:52",
    },
  ]);
  expect(await messages("constructor")).toEqual([
    "Val.of<User> bypasses User.seal, the constructor for it",
  ]);
});

test("names the seal that the lift skips", async () => {
  expect(await lint("seal")).toEqual([
    {
      rule: BypassedCompanion,
      at: "seal.ts:7:39",
    },
  ]);
  expect(await messages("seal")).toEqual([
    "Val.of<Age> bypasses Age.seal, which checks the payload",
  ]);
});

test("reads the chain through `.implCreate.noseal`", async () => {
  expect(await messages("noseal")).toEqual([
    "Val.of<Age> bypasses Age.seal, which checks the payload",
  ]);
});

test("says nothing where the type has no companion", async () => {
  expect(await lint("no-companion")).toEqual([]);
});

test("follows a renamed import to the companion in the other file", async () => {
  expect(await lint("renamed-import")).toEqual([
    {
      rule: BypassedCompanion,
      at: "renamed-import/boundary.ts:6:26",
    },
  ]);
  expect(await messages("renamed-import")).toEqual([
    "Val.of<Account> bypasses User.seal, the constructor for it",
  ]);
});

test("does not use a same-named companion from another module", async () => {
  expect(await lint("identity")).toEqual([]);
});

test("follows a renamed re-export to the companion", async () => {
  expect(await lint("re-export")).toEqual([
    { rule: BypassedCompanion, at: "re-export/consumer.ts:4:8" },
  ]);
});

test("looks through parentheses in the declaration, companion, and Val.of", async () => {
  expect(await lint("parenthesized")).toEqual([
    { rule: BypassedCompanion, at: "parenthesized.ts:4:30" },
  ]);
});

test("names the variant's frame for a lift, and the entry for one naming the union", async () => {
  expect(await lint("enum-companion")).toEqual([
    { rule: BypassedCompanion, at: "enum-companion.ts:7:40" },
    { rule: BypassedCompanion, at: "enum-companion.ts:8:30" },
  ]);
  expect(await messages("enum-companion")).toEqual([
    'Val.of<VariantOf<Shape, "Circle">> bypasses Shape.Circle.seal, the constructor for it',
    "Val.of<Shape> bypasses Shape.seal, which selects the variant from the tag",
  ]);
});
