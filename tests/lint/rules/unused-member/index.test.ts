import { describe, expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

// No fixture here states its equality, so no fixture needs a language server.
const { lint } = fixtures(import.meta.url);

describe("what the rule finds", () => {
  test("reports a member nothing reads, and spares the one that is read", async () => {
    expect(await lint("dead-member")).toEqual([
      "dead-member.ts:3:3  unused-member  Id.shout is never read",
    ]);
  });

  test("finds the reader in another file, through a renamed import", async () => {
    expect(await lint("renamed-import")).toEqual([
      "renamed-import/user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("follows a read made through a namespace import", async () => {
    expect(await lint("namespace-import")).toEqual([
      "namespace-import/user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("follows a read of a companion that was renamed on the way out", async () => {
    expect(await lint("re-export")).toEqual([
      "re-export/user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("counts bracket access, destructuring and a renaming destructure as reads", async () => {
    expect(await lint("reads")).toEqual([]);
  });

  test("collects method shorthand and non-function members", async () => {
    expect(await lint("shorthand-and-const")).toEqual([
      "shorthand-and-const.ts:2:3  unused-member  User.slug is never read",
      "shorthand-and-const.ts:5:3  unused-member  User.MAX is never read",
    ]);
  });

  test("ignores the members the library wires, which `.impl` no longer accepts", async () => {
    expect(await lint("builtins")).toEqual([]);
  });

  test("reads through a builder chain, past implSeal and fixed", async () => {
    expect(await lint("builder-chain")).toEqual([
      "builder-chain.ts:6:5  unused-member  Doc.subtitle is never read",
    ]);
  });

  test("keeps both declarations when two modules name a companion alike", async () => {
    expect(await lint("same-name")).toEqual([
      "same-name/billing.ts:1:40  unused-member  User.greet is never read",
      "same-name/orders.ts:1:40  unused-member  User.greet is never read",
    ]);
  });

  test("does not credit a read to a same-named companion in another file", async () => {
    expect(await lint("no-cross-file-credit")).toEqual([
      "no-cross-file-credit/declaration.ts:1:40  unused-member  User.greet is never read",
    ]);
  });

  test("sees a builder held in a variable before its impl is called", async () => {
    expect(await lint("held-in-a-variable")).toEqual([
      "held-in-a-variable.ts:5:3  unused-member  User.shout is never read",
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
      "computed-key.ts:1:47  unused-member  User.greet is never read",
    ]);
  });

  test("reports nothing about members spread into the impl, dead or not", async () => {
    expect(await lint("spread")).toEqual([]);
  });
});
