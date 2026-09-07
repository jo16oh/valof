import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Runs the CLI over one fixture directory, the way a user would.
 *
 * Node strips the types, so this exercises `src/` without a build step in between. Findings
 * come back with the fixture's own directory trimmed off the path, which is what keeps the
 * expectations below readable.
 */
function lint(
  fixture: string,
  ...flags: string[]
): { status: number; findings: string[]; summary: string } {
  const directory = `tests/fixtures/${fixture}/`;
  const result = spawnSync(process.execPath, ["src/lint/cli.ts", ...flags, `${directory}**/*.ts`], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    findings: result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(directory, "")),
    summary: result.stderr.trim(),
  };
}

describe("unused companion members", () => {
  test("reports a member nothing reads, and spares the one that is read", () => {
    expect(lint("unused/dead-member").findings).toEqual(["a.ts:3  Id.shout is never read"]);
  });

  test("finds the reader in another file, through a renamed import", () => {
    expect(lint("unused/renamed-import").findings).toEqual(["user.ts:3  User.shout is never read"]);
  });

  test("follows a read made through a namespace import", () => {
    expect(lint("unused/namespace-import").findings).toEqual([
      "user.ts:3  User.shout is never read",
    ]);
  });

  test("follows a read of a companion that was renamed on the way out", () => {
    expect(lint("unused/re-export").findings).toEqual(["user.ts:3  User.shout is never read"]);
  });

  test("counts bracket access, destructuring and a renaming destructure as reads", () => {
    expect(lint("unused/reads").findings).toEqual([]);
  });

  test("collects method shorthand and non-function members", () => {
    expect(lint("unused/shorthand-and-const").findings).toEqual([
      "a.ts:2  User.slug is never read",
      "a.ts:5  User.MAX is never read",
    ]);
  });

  test("ignores the members the library wires, which `.impl` no longer accepts", () => {
    expect(lint("unused/builtins").findings).toEqual([]);
  });

  test("reads through a builder chain, past implSeal, implEquals and fixed", () => {
    expect(lint("unused/builder-chain").findings).toEqual(["a.ts:7  Doc.subtitle is never read"]);
  });

  test("keeps both declarations when two modules name a companion alike", () => {
    expect(lint("unused/same-name").findings).toEqual([
      "a.ts:1  User.greet is never read",
      "b.ts:1  User.greet is never read",
    ]);
  });

  test("does not credit a read to a same-named companion in another file", () => {
    expect(lint("unused/no-cross-file-credit").findings).toEqual([
      "declaration.ts:1  User.greet is never read",
    ]);
  });

  test("sees a builder held in a variable before its impl is called", () => {
    expect(lint("unused/held-in-a-variable").findings).toEqual([
      "a.ts:5  User.shout is never read",
    ]);
  });

  test("leaves an unrelated library's impl alone", () => {
    expect(lint("unused/foreign-impl").findings).toEqual([]);
  });

  test("says nothing about a companion with no members", () => {
    expect(lint("unused/empty-impl").findings).toEqual([]);
  });
});

describe("what name resolution cannot reach", () => {
  test("reports a member that is only ever read through a computed key", () => {
    expect(lint("unused/computed-key").findings).toEqual(["a.ts:1  User.greet is never read"]);
  });

  test("reports nothing about members spread into the impl, dead or not", () => {
    expect(lint("unused/spread").findings).toEqual([]);
  });
});

describe("duplicate brands", () => {
  test("reports every alias that claims a brand another one claims", () => {
    expect(lint("brand/duplicate").findings).toEqual([
      'billing.ts:1  Id claims the brand "Id", and so does another type',
      'orders.ts:1  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("says nothing when each brand is claimed once", () => {
    expect(lint("brand/namespaced").findings).toEqual([]);
  });

  test("finds the collision when Val is renamed, or imported for its type alone", () => {
    expect(lint("brand/renamed-val").findings).toEqual([
      'billing.ts:3  Id claims the brand "Id", and so does another type',
      'orders.ts:3  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("finds the collision when Val is reached through a namespace import", () => {
    expect(lint("brand/namespaced-val").findings).toEqual([
      'billing.ts:3  Id claims the brand "Id", and so does another type',
      'orders.ts:3  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("ignores something else bound to the name Val", () => {
    expect(lint("brand/shadowed-val").findings).toEqual([]);
  });

  test("ignores an alias over something that is not a Val", () => {
    expect(lint("brand/not-a-val").findings).toEqual([]);
  });

  test("ignores an alias that is not at the top level, which nothing can import", () => {
    expect(lint("brand/block-scoped").findings).toEqual([]);
  });

  test("ignores a generic brand, which names nothing to collide over", () => {
    expect(lint("brand/generic").findings).toEqual([]);
  });
});

describe("a child's own equals", () => {
  test("reports a parent that structurally compares a child carrying its own equality", () => {
    expect(lint("equals/plain").findings).toEqual([
      "order.ts:6  Order.total holds Money, which has its own equals",
    ]);
  });

  test("says nothing when the spec names the key", () => {
    expect(lint("equals/covered").findings).toEqual([]);
  });

  test("says nothing when the parent wrote the whole comparison itself", () => {
    expect(lint("equals/override").findings).toEqual([]);
  });

  test("counts dropping a key from equality as having looked at it", () => {
    expect(lint("equals/excluded").findings).toEqual([]);
  });

  test("names the path through a plain nested object", () => {
    expect(lint("equals/nested").findings).toEqual([
      "order.ts:6  Order.shipping.fee holds Money, which has its own equals",
    ]);
  });

  test("names the element position of an array", () => {
    expect(lint("equals/array").findings).toEqual([
      "order.ts:6  Order.charges[] holds Money, which has its own equals",
    ]);
  });

  test("reports every level at once, so fixing one does not uncover another", () => {
    expect(lint("equals/cascade").findings).toEqual([
      "line.ts:6  OrderLine.total holds Money, which has its own equals",
      "order.ts:6  Order.lines[] holds OrderLine, which has its own equals",
    ]);
  });

  test("leaves a `PayloadOf` field alone, which has no brand to dispatch on", () => {
    expect(lint("equals/payload-of").findings).toEqual([]);
  });

  test("says nothing about a type whose equals nothing can call", () => {
    expect(lint("equals/no-companion").findings).toEqual([]);
  });

  test("is silenced by a directive above the companion", () => {
    expect(lint("equals/silenced").findings).toEqual([]);
  });
});

describe("ignore comments", () => {
  test("silences every kind when the directive lists none", () => {
    expect(lint("ignore/whole-line").findings).toEqual(["a.ts:4  User.whisper is never read"]);
  });

  test("silences the kind it lists, and ignores the note after `--`", () => {
    expect(lint("ignore/by-kind").findings).toEqual([]);
  });

  test("leaves a finding of another kind alone", () => {
    expect(lint("ignore/wrong-kind").findings).toEqual(["a.ts:3  User.shout is never read"]);
  });

  test("reads the whole comment block, not only the comment touching the line", () => {
    expect(lint("ignore/comment-block").findings).toEqual([]);
  });

  test("silences a duplicate brand, and only at the alias that asked", () => {
    expect(lint("ignore/duplicate-brand").findings).toEqual([
      'orders.ts:1  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("stops at a blank line, which starts a block of its own", () => {
    expect(lint("ignore/not-a-block").findings).toEqual(["a.ts:4  User.shout is never read"]);
  });

  test("ignores a directive trailing code, which belongs to no block", () => {
    expect(lint("ignore/after-code").findings).toEqual(["a.ts:2  User.shout is never read"]);
  });
});

describe("turning a rule off", () => {
  test("leaves out the kind the flag names, and only that one", () => {
    expect(lint("mixed").findings).toEqual([
      'a.ts:3  Id claims the brand "Id", and so does another type',
      "a.ts:6  User.shout is never read",
      'b.ts:3  UserId claims the brand "Id", and so does another type',
    ]);
    expect(lint("mixed", "--no-duplicate-brand").findings).toEqual([
      "a.ts:6  User.shout is never read",
    ]);
    expect(lint("mixed", "--no-unused-member").findings).toEqual([
      'a.ts:3  Id claims the brand "Id", and so does another type',
      'b.ts:3  UserId claims the brand "Id", and so does another type',
    ]);
  });

  test("takes more than one flag, and exits 0 once nothing is left to report", () => {
    const { status, findings } = lint("mixed", "--no-duplicate-brand", "--no-unused-member");
    expect(findings).toEqual([]);
    expect(status).toBe(0);
  });

  test("skips the structural-equals rule without starting a TypeScript for it", () => {
    expect(lint("equals/plain").findings).toEqual([
      "order.ts:6  Order.total holds Money, which has its own equals",
    ]);
    expect(lint("equals/plain", "--no-structural-equals").findings).toEqual([]);
  });

  test("names the known rules when the flag names none of them", () => {
    const { status, summary } = lint("mixed", "--no-typo");
    expect(status).toBe(2);
    expect(summary).toBe(
      'valof-lint: no rule called "typo"\n' +
        "  known rules: unused-member, duplicate-brand, structural-equals",
    );
  });
});

describe("the command itself", () => {
  test("exits 1 with a summary when it finds something", () => {
    const { status, summary } = lint("unused/dead-member");
    expect(status).toBe(1);
    expect(summary).toBe("valof-lint: 1 finding(s) in 1 file(s)");
  });

  test("exits 0 with a summary when it does not", () => {
    const { status, summary } = lint("unused/reads");
    expect(status).toBe(0);
    expect(summary).toBe("valof-lint: nothing to report in 1 file(s)");
  });

  test("exits 2 when nothing matches the glob", () => {
    const { status, summary } = lint("no-such-directory");
    expect(status).toBe(2);
    expect(summary).toBe("valof-lint: no files matched");
  });

  test("has nothing to report about the package's own sources", () => {
    const result = spawnSync(process.execPath, ["src/lint/cli.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    expect([result.status, result.stdout]).toEqual([0, ""]);
  });
});
