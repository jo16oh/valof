import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { lint } from "../src/lint.ts";

const dir = mkdtempSync(join(tmpdir(), "valof-unused-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
/** Writes each source to its own file and reports the findings across the set. */
async function scan(...sources: string[]): Promise<string[]> {
  const root = join(dir, `case-${n++}`);
  mkdirSync(root);
  const files = sources.map((source, i) => {
    const file = join(root, `f${i}.ts`);
    writeFileSync(file, source);
    return file;
  });
  return (await lint(files)).map((finding) =>
    finding.kind === "unused-member"
      ? `${finding.companion}.${finding.member}`
      : `brand ${finding.brand} @ ${finding.alias}`,
  );
}

describe("unused companion members", () => {
  test("reports a member nothing reads, and spares the one that is read", async () => {
    expect(
      await scan(`
        const User = Val.sealer<User>().impl({
          greet: (u) => u.name,
          shout: (u) => u.name.toUpperCase(),
        });
        console.log(User.greet(u));
      `),
    ).toEqual(["User.shout"]);
  });

  test("finds the reader in another file, through a renamed import", async () => {
    expect(
      await scan(
        `export const User = Val.sealer<User>().impl({ greet: (u) => u.name, shout: (u) => u });`,
        `import { User as U } from "./f0.ts";\nU.greet(u);`,
      ),
    ).toEqual(["User.shout"]);
  });

  const readers = {
    "bracket access": `User["greet"](u);`,
    destructuring: `const { greet } = User;`,
    "renaming destructure": `const { greet: hello } = User;`,
  };
  for (const [label, read] of Object.entries(readers)) {
    test(`counts ${label} as a read`, async () => {
      const source = `const User = Val.sealer<User>().impl({ greet: (u) => u.name });\n${read}`;
      expect(await scan(source)).toEqual([]);
    });
  }

  test("collects method shorthand and non-function members", async () => {
    expect(
      await scan(`
        const User = Val.sealer<User>().impl({
          slug(u) { return u.name; },
          MAX: 10,
        });
      `),
    ).toEqual(["User.slug", "User.MAX"]);
  });

  test("ignores the members the library attaches or a type overrides", async () => {
    expect(
      await scan(`
        const User = Val.companion<User>().impl({
          equals: (a, b) => a === b,
          with: (v, p, seal) => seal({ ...v, ...p }),
          update: (v, f, seal) => seal(f(v)),
        });
      `),
    ).toEqual([]);
  });

  test("reads through a builder chain", async () => {
    expect(
      await scan(`
        const Doc = Val.companion<Doc>()
          .implSeal((v) => v)
          .unpatchable<"id">()
          .impl({ title: (d) => d.title, subtitle: (d) => d.title });
        Doc.title(d);
      `),
    ).toEqual(["Doc.subtitle"]);
  });

  test("keeps both declarations when two modules name a companion alike", async () => {
    expect(
      await scan(
        `const User = Val.sealer<User>().impl({ greet: (u) => u.name });`,
        `const User = Val.sealer<User>().impl({ greet: (u) => u.id });`,
      ),
    ).toEqual(["User.greet", "User.greet"]);
  });

  test("does not credit a read to a same-named companion in another file", async () => {
    expect(
      await scan(
        `import { Other as User } from "./elsewhere.ts";\nUser.greet(u);`,
        `const User = Val.sealer<User>().impl({ greet: (u) => u.id });`,
      ),
    ).toEqual(["User.greet"]);
  });

  test("says nothing about a companion with no members", async () => {
    expect(await scan(`const User = Val.sealer<User>().impl({});`)).toEqual([]);
  });
});

describe("duplicate brands", () => {
  test("reports every alias that claims a brand another one claims", async () => {
    expect(
      await scan(`export type Id = Val<"Id", string>;`, `export type OtherId = Val<"Id", string>;`),
    ).toEqual(["brand Id @ Id", "brand Id @ OtherId"]);
  });

  test("says nothing when each brand is claimed once", async () => {
    expect(
      await scan(
        `export type Id = Val<"billing/Id", string>;`,
        `export type OtherId = Val<"orders/Id", string>;`,
      ),
    ).toEqual([]);
  });

  test("finds the collision when Val is imported under another name", async () => {
    expect(
      await scan(
        `import { Val as V } from "valof";\nexport type Id = V<"Id", string>;`,
        `import { Val } from "valof";\nexport type OtherId = Val<"Id", string>;`,
      ),
    ).toEqual(["brand Id @ Id", "brand Id @ OtherId"]);
  });

  test("ignores an alias over something that is not a Val", async () => {
    expect(await scan(`type A = Other<"Id", string>;`, `type B = Other<"Id", string>;`)).toEqual(
      [],
    );
  });

  test("ignores an alias that is not at the top level, which nothing can import", async () => {
    expect(
      await scan(
        `describe("a", () => {\n  type Id = Val<"Id", string>;\n});`,
        `describe("b", () => {\n  type Id = Val<"Id", string>;\n});`,
      ),
    ).toEqual([]);
  });

  test("ignores a generic brand, which names nothing to collide over", async () => {
    expect(
      await scan(`type Wrapper<K extends string> = Val<K, string>;`, `type B = Val<K, string>;`),
    ).toEqual([]);
  });
});

describe("the repository's own sources", () => {
  test("have nothing to report", async () => {
    expect(await lint(["src/val.ts", "src/index.ts", "tests/val.test.ts"])).toEqual([]);
  });
});
