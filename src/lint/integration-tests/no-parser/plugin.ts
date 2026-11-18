import plugin from "../../eslint-plugin/index.ts";

const file = "src/lint/integration-tests/command/fixtures/clean.ts";

export default () =>
  plugin.rules["no-unused-member"]!.create({
    filename: file,
    settings: { valof: { project: file } },
    sourceCode: { text: "" },
    report: () => {},
  }).Program();
