import { expect, test } from "vite-plus/test";

import { Options, lint } from "../../../../src/lint/index.ts";
import { ModelOnlyInValof, cli, fixtures } from "../../support.ts";

const { files, lint: run } = fixtures(import.meta.url);

const reported = async (
  settings: { classes?: boolean; constraints?: boolean; extraction?: boolean },
  file = "domain",
): Promise<string[]> =>
  (await lint(files(file), Options.create({ enable: { "model-only-in-valof": settings } })))
    .filter(({ kind }) => kind === ModelOnlyInValof.kind)
    .map(({ at: { line, column }, message }) => `${line}:${column} ${message}`);

const data = (name: string): string =>
  `${name} declares a data type outside Valof; model it as a Val, an Enum or a Trait`;
const primitive = (name: string): string =>
  `${name} names a primitive type outside Valof; make it a Val, or Payload<…> for a payload`;

test("runs only when enabled", async () => {
  expect((await run("domain")).filter(({ rule }) => rule === ModelOnlyInValof)).toEqual([]);
});

test("reports a named data type outside Valof, and spares Valof types, unions and functions", async () => {
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
  expect(await reported({}, "more")).toEqual([
    `4:49 ${nests("Choice")}`,
    `5:52 ${nests("Joined")}`,
    `6:45 ${nests("Listed")}`,
    `7:41 ${nests("Mapped")}`,
    `11:13 ${data("Wrapped")}`,
    "17:41 Name is a payload type; use it in a Valof type, or in the function passed to implSeal or implCreate",
    `23:13 ${primitive("Flag")}`,
    `24:13 ${primitive("Code")}`,
  ]);
});

test("takes a type out of a value below the top too, and reports a class expression, when asked", async () => {
  const always = new Set(await reported({}, "more"));
  const added = (await reported({ classes: true, extraction: true }, "more")).filter(
    (one) => !always.has(one),
  );
  expect(added).toEqual([
    "10:13 Labeler takes its type out of a value; declare a Val instead",
    "11:13 Wrapped takes its type out of a value; declare a Val instead",
    "22:21 a class declares data outside Valof; model it as a Val",
  ]);
});

test("leaves a declaration file alone", async () => {
  expect(await reported({}, "declared.d")).toEqual([]);
});

const under = "tests/lint/rules/model-only-in-valof/fixtures";

test("is enabled on the command line, with its settings after an equals sign", () => {
  expect(cli(under, "--model-only-in-valof").stdout).toContain(
    "domain.ts:9:13  model-only-in-valof",
  );
  const classes = cli(under, "--model-only-in-valof=classes").stdout;
  expect(classes).toContain("domain.ts:28:8  model-only-in-valof");
  expect(classes).not.toContain("domain.ts:29:32");
});

test("refuses a setting it does not take", () => {
  const { status, stderr } = cli(under, "--model-only-in-valof=typo");
  expect(status).toBe(2);
  expect(stderr).toBe(
    'valof-lint: no setting called "typo"\n  known settings: classes, constraints, extraction',
  );
});
