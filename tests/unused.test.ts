import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { findUnused } from "../src/unused.ts";

const dir = mkdtempSync(join(tmpdir(), "valof-unused-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
/** Writes each source to its own file and reports what nothing reads across the set. */
async function scan(...sources: string[]): Promise<string[]> {
  const root = join(dir, `case-${n++}`);
  mkdirSync(root);
  const files = sources.map((source, i) => {
    const file = join(root, `f${i}.ts`);
    writeFileSync(file, source);
    return file;
  });
  const found = await findUnused(files);
  return found.map(({ companion, member }) => `${companion}.${member}`);
}

describe("findUnused", () => {
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

  test("says nothing about a companion with no members", async () => {
    expect(await scan(`const User = Val.sealer<User>().impl({});`)).toEqual([]);
  });
});

describe("the repository's own sources", () => {
  test("has no unused companion members", async () => {
    const files = ["src/val.ts", "src/index.ts", "tests/val.test.ts"];
    expect(await findUnused(files)).toEqual([]);
  });
});
