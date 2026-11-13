import { expect, test } from "vite-plus/test";

import { Options, lint } from "../../../../src/lint/index.ts";
import { DataTypeOutsideValof, cli, fixtures } from "../../support.ts";

const { files, lint: run } = fixtures(import.meta.url);

async function reported(
  settings: { classes?: boolean; constraints?: boolean; extraction?: boolean },
  file = "domain",
): Promise<string[]> {
  return (
    await lint(files(file), Options.create({ enable: { "data-type-outside-valof": settings } }))
  )
    .filter(({ kind }) => kind === DataTypeOutsideValof.kind)
    .map(({ at: { line, column }, message }) => `${line}:${column} ${message}`);
}

function data(name: string): string {
  return `${name} declares a data type outside Valof; model it as a Val, an Enum or a Trait`;
}
function primitive(name: string): string {
  return `${name} names a primitive type outside Valof; make it a Val, or Payload<…> for a payload`;
}

test("runs only when enabled", async () => {
  expect((await run("domain")).filter(({ rule }) => rule === DataTypeOutsideValof)).toEqual([]);
});

test("reports a named data or primitive type outside Valof, and spares Valof types and functions", async () => {
  expect(await reported({})).toEqual([
    `9:13 ${data("Row")}`,
    `10:18 ${data("Props")}`,
    `13:13 ${primitive("UserId")}`,
    `14:13 ${primitive("Status")}`,
    `15:13 ${data("Ids")}`,
    `16:13 ${data("Partialed")}`,
    `17:27 ${data("OnRow")}`,
    "21:43 Order nests an object that is not a Val; nest a Val instead",
    "23:29 Name is a payload type; use it in a Valof type, or in the function passed to implSeal or implCreate",
    `38:13 ${primitive("Flag")}`,
    `39:13 ${primitive("Code")}`,
  ]);
});

test("reports classes, constraints and types taken out of values, each only when asked", async () => {
  const added = async (settings: Parameters<typeof reported>[0]): Promise<string[]> => {
    const always = new Set(await reported({}));
    return (await reported(settings)).filter((one) => !always.has(one));
  };
  expect(await added({ classes: true })).toEqual([
    "28:8 a class declares data outside Valof; model it as a Val",
  ]);
  expect(await added({ constraints: true })).toEqual([
    "29:32 this constraint declares a data shape; write a Trait or an Enum",
  ]);
  expect(await added({ extraction: true })).toEqual([
    "30:13 Made takes its type out of a value; declare a Val instead",
  ]);
});

test("reads a nested object in a variant, beside an intersected base, in an array and in a mapped type", async () => {
  const nests = (name: string): string =>
    `${name} nests an object that is not a Val; nest a Val instead`;
  expect(await reported({}, "nested")).toEqual([
    `4:49 ${nests("Choice")}`,
    `5:52 ${nests("Joined")}`,
    `6:45 ${nests("Listed")}`,
    `7:41 ${nests("Mapped")}`,
  ]);
});

test("takes a payload type in the function passed to implSeal or implCreate, not in a variant's impl", async () => {
  expect(await reported({}, "impl")).toEqual([
    "7:41 Name is a payload type; use it in a Valof type, or in the function passed to implSeal or implCreate",
  ]);
});

test("takes a type out of a value below the top too, besides its data, and reports a class expression, when asked", async () => {
  const always = new Set(await reported({}, "extracted"));
  expect([...always]).toEqual([`3:13 ${data("Wrapped")}`]);
  const added = (await reported({ classes: true, extraction: true }, "extracted")).filter(
    (one) => !always.has(one),
  );
  expect(added).toEqual([
    "2:13 Labeler takes its type out of a value; declare a Val instead",
    "3:13 Wrapped takes its type out of a value; declare a Val instead",
    "5:21 a class declares data outside Valof; model it as a Val",
  ]);
});

test("leaves a declaration file alone", async () => {
  expect(await reported({}, "declared.d")).toEqual([]);
});

const UNDER = "tests/lint/rules/data-type-outside-valof/fixtures";

test("is enabled on the command line, with its settings after an equals sign", () => {
  expect(cli(UNDER, "--data-type-outside-valof").stdout).toContain(
    "domain.ts:9:13  data-type-outside-valof",
  );
  const classes = cli(UNDER, "--data-type-outside-valof=classes").stdout;
  expect(classes).toContain("domain.ts:28:8  data-type-outside-valof");
  expect(classes).not.toContain("domain.ts:29:32");
});

test("refuses a setting it does not take", () => {
  const { status, stderr } = cli(UNDER, "--data-type-outside-valof=typo");
  expect(status).toBe(2);
  expect(stderr).toBe(
    'valof-lint: no setting called "typo"\n  known settings: classes, constraints, extraction',
  );
});
