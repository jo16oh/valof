import plugin from "../../eslint-plugin/index.ts";

const file = "src/lint/tests/command/fixtures/clean.ts";

export default () =>
  plugin.rules["unused-member"]!.create({
    filename: file,
    settings: { valof: { project: file } },
    sourceCode: { text: "" },
    report: () => {},
  }).Program();
