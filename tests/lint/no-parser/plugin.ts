import plugin from "../../../src/lint/eslint-plugin/index.ts";

const file = "tests/lint/command/fixtures/clean.ts";

export default () =>
  plugin.rules["unused-member"]!.create({
    filename: file,
    settings: { valof: { project: file } },
    sourceCode: { text: "" },
    report: () => {},
  }).Program();
