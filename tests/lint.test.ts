import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { lint as run, resolver, type Kind, type Resolver } from "../src/lint/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

let types: Resolver | undefined;
beforeAll(() => {
  types = resolver(root, globSync("tests/fixtures/**/*.ts", { cwd: root }));
});
afterAll(() => types?.close());

/**
 * Findings over one fixture directory, as the command would print them.
 *
 * In process, so the run costs no `node` start. The command itself is covered separately, below:
 * what it adds over `lint` is argument parsing and the shape of a line.
 */
async function lint(fixture: string, ...skip: Kind[]): Promise<string[]> {
  const directory = `tests/fixtures/${fixture}/`;
  const files = globSync(`${directory}**/*.ts`, { cwd: root }).map((f) => `${root}${f}`);
  const findings = await run(files, { ...(types ? { types } : {}), skip: new Set(skip) });
  return findings.map(
    ({ file, line, column, kind, message }) =>
      `${file.replace(`${root}${directory}`, "")}:${line}:${column}  ${kind}  ${message}`,
  );
}

/** The command, for what only the command does. */
function cli(...args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["src/lint/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr.trim() };
}

describe("unused companion members", () => {
  test("reports a member nothing reads, and spares the one that is read", async () => {
    expect(await lint("unused/dead-member")).toEqual([
      "a.ts:3:3  unused-member  Id.shout is never read",
    ]);
  });

  test("finds the reader in another file, through a renamed import", async () => {
    expect(await lint("unused/renamed-import")).toEqual([
      "user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("follows a read made through a namespace import", async () => {
    expect(await lint("unused/namespace-import")).toEqual([
      "user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("follows a read of a companion that was renamed on the way out", async () => {
    expect(await lint("unused/re-export")).toEqual([
      "user.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("counts bracket access, destructuring and a renaming destructure as reads", async () => {
    expect(await lint("unused/reads")).toEqual([]);
  });

  test("collects method shorthand and non-function members", async () => {
    expect(await lint("unused/shorthand-and-const")).toEqual([
      "a.ts:2:3  unused-member  User.slug is never read",
      "a.ts:5:3  unused-member  User.MAX is never read",
    ]);
  });

  test("ignores the members the library wires, which `.impl` no longer accepts", async () => {
    expect(await lint("unused/builtins")).toEqual([]);
  });

  test("reads through a builder chain, past implSeal, implEquals and fixed", async () => {
    expect(await lint("unused/builder-chain")).toEqual([
      "a.ts:7:5  unused-member  Doc.subtitle is never read",
    ]);
  });

  test("keeps both declarations when two modules name a companion alike", async () => {
    expect(await lint("unused/same-name")).toEqual([
      "a.ts:1:40  unused-member  User.greet is never read",
      "b.ts:1:40  unused-member  User.greet is never read",
    ]);
  });

  test("does not credit a read to a same-named companion in another file", async () => {
    expect(await lint("unused/no-cross-file-credit")).toEqual([
      "declaration.ts:1:40  unused-member  User.greet is never read",
    ]);
  });

  test("sees a builder held in a variable before its impl is called", async () => {
    expect(await lint("unused/held-in-a-variable")).toEqual([
      "a.ts:5:3  unused-member  User.shout is never read",
    ]);
  });

  test("leaves an unrelated library's impl alone", async () => {
    expect(await lint("unused/foreign-impl")).toEqual([]);
  });

  test("says nothing about a companion with no members", async () => {
    expect(await lint("unused/empty-impl")).toEqual([]);
  });
});

describe("what name resolution cannot reach", () => {
  test("reports a member that is only ever read through a computed key", async () => {
    expect(await lint("unused/computed-key")).toEqual([
      "a.ts:1:47  unused-member  User.greet is never read",
    ]);
  });

  test("reports nothing about members spread into the impl, dead or not", async () => {
    expect(await lint("unused/spread")).toEqual([]);
  });
});

describe("duplicate brands", () => {
  test("reports every alias that claims a brand another one claims", async () => {
    expect(await lint("brand/duplicate")).toEqual([
      'billing.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type',
      'orders.ts:1:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("says nothing when each brand is claimed once", async () => {
    expect(await lint("brand/namespaced")).toEqual([]);
  });

  test("finds the collision when Val is renamed, or imported for its type alone", async () => {
    expect(await lint("brand/renamed-val")).toEqual([
      'billing.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
      'orders.ts:3:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("finds the collision when Val is reached through a namespace import", async () => {
    expect(await lint("brand/namespaced-val")).toEqual([
      'billing.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
      'orders.ts:3:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("ignores something else bound to the name Val", async () => {
    expect(await lint("brand/shadowed-val")).toEqual([]);
  });

  test("ignores an alias over something that is not a Val", async () => {
    expect(await lint("brand/not-a-val")).toEqual([]);
  });

  test("ignores an alias that is not at the top level, which nothing can import", async () => {
    expect(await lint("brand/block-scoped")).toEqual([]);
  });

  test("ignores a generic brand, which names nothing to collide over", async () => {
    expect(await lint("brand/generic")).toEqual([]);
  });
});

describe("a child's own equals", () => {
  test("reports a parent that structurally compares a child carrying its own equality", async () => {
    expect(await lint("equals/plain")).toEqual([
      "order.ts:6:22  structural-equals  Order.total holds Money, which has its own equals",
    ]);
  });

  test("says nothing when the spec names the key", async () => {
    expect(await lint("equals/covered")).toEqual([]);
  });

  test("says nothing when an entry above the path speaks for it", async () => {
    expect(await lint("equals/covered-above")).toEqual([]);
  });

  test("takes a one-element array spec as speaking for every element", async () => {
    expect(await lint("equals/array-spec")).toEqual([]);
  });

  test("says nothing when the parent wrote the whole comparison itself", async () => {
    expect(await lint("equals/override")).toEqual([]);
  });

  test("counts dropping a key from equality as having looked at it", async () => {
    expect(await lint("equals/excluded")).toEqual([]);
  });

  test("names the path through a plain nested object", async () => {
    expect(await lint("equals/nested")).toEqual([
      "order.ts:6:22  structural-equals  Order.shipping.fee holds Money, which has its own equals",
    ]);
  });

  test("names the element position of an array", async () => {
    expect(await lint("equals/array")).toEqual([
      "order.ts:6:22  structural-equals  Order.charges[] holds Money, which has its own equals",
    ]);
  });

  test("reports every level at once, so fixing one does not uncover another", async () => {
    expect(await lint("equals/cascade")).toEqual([
      "line.ts:6:26  structural-equals  OrderLine.total holds Money, which has its own equals",
      "order.ts:6:22  structural-equals  Order.lines[] holds OrderLine, which has its own equals",
    ]);
  });

  test("leaves a `PayloadOf` field alone, which has no brand to dispatch on", async () => {
    expect(await lint("equals/payload-of")).toEqual([]);
  });

  test("says nothing about a type whose equals nothing can call", async () => {
    expect(await lint("equals/no-companion")).toEqual([]);
  });

  test("is silenced by a directive above the companion", async () => {
    expect(await lint("equals/silenced")).toEqual([]);
  });
});

describe("ignore comments", () => {
  test("silences every kind when the directive lists none", async () => {
    expect(await lint("ignore/whole-line")).toEqual([
      "a.ts:4:3  unused-member  User.whisper is never read",
    ]);
  });

  test("silences the kind it lists, and ignores the note after `--`", async () => {
    expect(await lint("ignore/by-kind")).toEqual([]);
  });

  test("leaves a finding of another kind alone", async () => {
    expect(await lint("ignore/wrong-kind")).toEqual([
      "a.ts:3:3  unused-member  User.shout is never read",
    ]);
  });

  test("reads the whole comment block, not only the comment touching the line", async () => {
    expect(await lint("ignore/comment-block")).toEqual([]);
  });

  test("silences a duplicate brand, and only at the alias that asked", async () => {
    expect(await lint("ignore/duplicate-brand")).toEqual([
      'orders.ts:1:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
    ]);
  });

  test("stops at a blank line, which starts a block of its own", async () => {
    expect(await lint("ignore/not-a-block")).toEqual([
      "a.ts:5:3  unused-member  User.shout is never read",
    ]);
  });

  test("ignores a directive trailing code, which belongs to no block", async () => {
    expect(await lint("ignore/after-code")).toEqual([
      "a.ts:2:3  unused-member  User.shout is never read",
    ]);
  });
});

describe("turning a rule off", () => {
  test("leaves out the kind the flag names, and only that one", async () => {
    expect(await lint("mixed")).toEqual([
      'a.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
      "a.ts:6:3  unused-member  User.shout is never read",
      'b.ts:3:13  duplicate-brand  UserId claims the brand "Id", and so does another type',
    ]);
    expect(await lint("mixed", "duplicate-brand")).toEqual([
      "a.ts:6:3  unused-member  User.shout is never read",
    ]);
    expect(await lint("mixed", "unused-member")).toEqual([
      'a.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
      'b.ts:3:13  duplicate-brand  UserId claims the brand "Id", and so does another type',
    ]);
  });

  test("takes more than one, and leaves nothing once every kind is out", async () => {
    expect(await lint("mixed", "duplicate-brand", "unused-member")).toEqual([]);
  });

  test("skips the structural-equals rule without starting a TypeScript for it", async () => {
    expect(await lint("equals/plain")).toEqual([
      "order.ts:6:22  structural-equals  Order.total holds Money, which has its own equals",
    ]);
    expect(await lint("equals/plain", "structural-equals")).toEqual([]);
  });

  test("names the known rules when the flag names none of them", () => {
    const { status, stderr } = cli("--no-typo", "tests/fixtures/mixed/**/*.ts");
    expect(status).toBe(2);
    expect(stderr).toBe(
      'valof-lint: no rule called "typo"\n' +
        "  known rules: unused-member, duplicate-brand, structural-equals",
    );
  });

  test("passes the flag through to the run", () => {
    const { stdout } = cli("--no-duplicate-brand", "tests/fixtures/mixed/**/*.ts");
    expect(stdout).toBe("tests/fixtures/mixed/a.ts:6:3  unused-member  User.shout is never read\n");
  });
});

describe("the command itself", () => {
  test("prints a finding as location, kind, then message", () => {
    const { stdout } = cli("tests/fixtures/unused/dead-member/**/*.ts");
    expect(stdout).toBe(
      "tests/fixtures/unused/dead-member/a.ts:3:3  unused-member  Id.shout is never read\n",
    );
  });

  test("exits 1 with a summary when it finds something", () => {
    const { status, stderr } = cli("tests/fixtures/unused/dead-member/**/*.ts");
    expect(status).toBe(1);
    expect(stderr).toBe("valof-lint: 1 finding(s) in 1 file(s)");
  });

  test("exits 0 with a summary when it does not", () => {
    const { status, stderr } = cli("tests/fixtures/unused/reads/**/*.ts");
    expect(status).toBe(0);
    expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
  });

  test("starts a TypeScript of its own when the caller hands it none", () => {
    const { stdout } = cli("tests/fixtures/equals/plain/**/*.ts");
    expect(stdout).toBe(
      "tests/fixtures/equals/plain/order.ts:6:22  structural-equals  " +
        "Order.total holds Money, which has its own equals\n",
    );
  });

  test("exits 2 when nothing matches the glob", () => {
    const { status, stderr } = cli("tests/fixtures/no-such-directory/**/*.ts");
    expect(status).toBe(2);
    expect(stderr).toBe("valof-lint: no files matched");
  });

  test("has nothing to report about the package's own sources", () => {
    expect([cli().status, cli().stdout]).toEqual([0, ""]);
  });
});
