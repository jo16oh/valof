import { expect, test } from "vite-plus/test";

import { lint } from "../../../../src/lint/index.ts";
import { ModelOnlyInValof, cli, fixtures } from "../../support.ts";

const { files, lint: run, messages } = fixtures(import.meta.url);

const reported = async (enable: Parameters<typeof lint>[1]): Promise<string[]> =>
  (await lint(files("domain"), enable))
    .filter(({ kind }) => kind === ModelOnlyInValof.kind)
    .map(({ line, column }) => `${line}:${column}`);

test("runs only when enabled", async () => {
  expect((await run("domain")).filter(({ rule }) => rule === ModelOnlyInValof)).toEqual([]);
});

test("reports a named data type outside Valof, and spares Valof types, unions and functions", async () => {
  expect(await reported({ enable: { "model-only-in-valof": {} } })).toEqual([
    "9:13",
    "10:18",
    "13:13",
    "14:13",
    "15:13",
    "16:13",
    "17:27",
    "21:13",
    "22:43",
    "24:29",
  ]);
});

test("reports classes, constraints and types taken out of values, each when asked", async () => {
  const all = await reported({
    enable: { "model-only-in-valof": { classes: true, constraints: true, extraction: true } },
  });
  expect(all.filter((at) => ["29:8", "30:32", "31:13"].includes(at))).toEqual([
    "29:8",
    "30:32",
    "31:13",
  ]);
});

test("says what to write instead", async () => {
  const said = await messages("domain", { enable: { "model-only-in-valof": {} } });
  expect(said).toContain(
    "Row declares a data type outside Valof; model it as a Val, an Enum or a Trait",
  );
  expect(said).toContain("Wrong wraps the Val User in Payload; write PayloadOf<User>");
  expect(said).toContain(
    "Name is a payload type; use it in a Valof type, or in the function passed to implSeal or implCreate",
  );
});

test("is enabled on the command line, with its settings after an equals sign", () => {
  const under = "tests/lint/rules/model-only-in-valof/fixtures";
  expect(cli(under).stdout).not.toContain("model-only-in-valof");
  expect(cli(under, "--model-only-in-valof").stdout).toContain(
    "domain.ts:9:13  model-only-in-valof",
  );
  expect(cli(under, "--model-only-in-valof=classes").stdout).toContain(
    "domain.ts:29:8  model-only-in-valof",
  );
});
