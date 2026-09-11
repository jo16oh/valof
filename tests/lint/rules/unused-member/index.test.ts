import { describe, expect, test } from "vite-plus/test";

import { CompanionMismatch, UnusedMember, fixtures } from "../../support.ts";

// No fixture here states its equality, so no fixture needs a language server.
const { lint } = fixtures(import.meta.url);

describe("what the rule finds", () => {
  test("reports a member nothing reads, and spares the one that is read", async () => {
    expect(await lint("dead-member")).toEqual([{ rule: UnusedMember, at: "dead-member.ts:3:3" }]);
  });

  test("finds the reader in another file, through a renamed import", async () => {
    expect(await lint("renamed-import")).toEqual([
      { rule: UnusedMember, at: "renamed-import/user.ts:3:3" },
    ]);
  });

  test("follows a read made through a namespace import", async () => {
    expect(await lint("namespace-import")).toEqual([
      {
        rule: UnusedMember,
        at: "namespace-import/user.ts:3:3",
      },
    ]);
  });

  test("follows a read of a companion that was renamed on the way out", async () => {
    expect(await lint("re-export")).toEqual([{ rule: UnusedMember, at: "re-export/user.ts:3:3" }]);
  });

  test("follows a read through a chain of renamed exports", async () => {
    expect(await lint("re-export-chain")).toEqual([
      { rule: UnusedMember, at: "re-export-chain/user.ts:3:3" },
    ]);
  });

  test("counts bracket access, destructuring and a renaming destructure as reads", async () => {
    expect(await lint("reads")).toEqual([]);
  });

  test("collects method shorthand and non-function members", async () => {
    expect(await lint("shorthand-and-const")).toEqual([
      { rule: UnusedMember, at: "shorthand-and-const.ts:2:3" },
      { rule: UnusedMember, at: "shorthand-and-const.ts:5:3" },
    ]);
  });

  test("ignores the members the library wires, which `.impl` no longer accepts", async () => {
    expect(await lint("builtins")).toEqual([]);
  });

  test("reads through a builder chain, past implSeal and fixed", async () => {
    expect(await lint("builder-chain")).toEqual([
      { rule: UnusedMember, at: "builder-chain.ts:6:5" },
    ]);
  });

  test("keeps both declarations when two modules name a companion alike", async () => {
    expect(await lint("same-name")).toEqual([
      { rule: UnusedMember, at: "same-name/billing.ts:1:40" },
      { rule: UnusedMember, at: "same-name/orders.ts:1:40" },
    ]);
  });

  test("does not credit a read to a same-named companion in another file", async () => {
    expect(await lint("no-cross-file-credit")).toEqual([
      {
        rule: UnusedMember,
        at: "no-cross-file-credit/declaration.ts:1:40",
      },
    ]);
  });

  test("sees a builder held in a variable before its impl is called", async () => {
    expect(await lint("held-in-a-variable")).toEqual([
      {
        rule: CompanionMismatch,
        at: "held-in-a-variable.ts:1:7",
      },
      { rule: UnusedMember, at: "held-in-a-variable.ts:5:3" },
    ]);
  });

  test("leaves an unrelated library's impl alone", async () => {
    expect(await lint("foreign-impl")).toEqual([]);
  });

  test("says nothing about a companion with no members", async () => {
    expect(await lint("empty-impl")).toEqual([]);
  });
});

describe("what name resolution cannot reach", () => {
  test("reports a member that is only ever read through a computed key", async () => {
    expect(await lint("computed-key")).toEqual([
      { rule: UnusedMember, at: "computed-key.ts:1:47" },
    ]);
  });

  test("resolves members spread into the impl", async () => {
    expect(await lint("spread")).toEqual([{ rule: UnusedMember, at: "spread.ts:1:16" }]);
  });
});

describe("Trait members", () => {
  test("recognizes renamed and namespace value imports in companion and dyn calls", async () => {
    expect(await lint("trait-value-imports")).toEqual([]);
  });

  test("routes direct, bound, and destructured dyn reads to defaults or overrides", async () => {
    expect(await lint("trait-dispatch")).toEqual([
      { rule: UnusedMember, at: "trait-dispatch.ts:12:11" },
    ]);
  });

  test("resolves const objects and recursive spreads", async () => {
    expect(await lint("resolved-overrides")).toEqual([
      { rule: UnusedMember, at: "resolved-overrides.ts:2:55" },
    ]);
  });

  test("reads overrides from parenthesized implTrait type arguments", async () => {
    expect(await lint("parenthesized-impl-trait")).toEqual([
      { rule: UnusedMember, at: "parenthesized-impl-trait.ts:2:55" },
    ]);
  });

  test("treats conditional and cyclic override objects conservatively", async () => {
    expect(await lint("unresolved-overrides")).toEqual([]);
  });

  test("distinguishes overrides belonging to different Vals", async () => {
    expect(await lint("multiple-vals")).toEqual([
      { rule: UnusedMember, at: "multiple-vals.ts:2:55" },
      { rule: UnusedMember, at: "multiple-vals.ts:8:61" },
    ]);
  });
});
