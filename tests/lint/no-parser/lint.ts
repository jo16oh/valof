import { lint } from "../../../src/lint/index.ts";

export default () => lint(["tests/lint/command/fixtures/clean.ts"]);
