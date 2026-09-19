import { expect, test } from "vite-plus/test";

import { DetachedImpl, UnusedMember, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a step written on a companion another file declares", async () => {
  expect(await lint("downstream", { skip: [UnusedMember] })).toEqual([
    { rule: DetachedImpl, at: "downstream/consumer.ts:3:30" },
  ]);
  expect(await messages("downstream", { skip: [UnusedMember] })).toEqual([
    "User.impl is written outside the chain that declares it; write the step there",
  ]);
});

test("reports a step written on one variant of an enum", async () => {
  expect(await lint("enum")).toEqual([{ rule: DetachedImpl, at: "enum/consumer.ts:3:14" }]);
  expect(await messages("enum")).toEqual([
    "Shape.Circle.implSeal is written outside the chain that declares it; write the step there",
  ]);
});

test("says nothing about a step on a value that is no companion of ours", async () => {
  expect(await lint("unrelated")).toEqual([]);
});

// `helper` is a member of the companion, and `Triangle` names no variant of the enum.
test("says nothing about a key that is neither a variant nor a companion of its own", async () => {
  expect(await lint("no-variant")).toEqual([]);
});
