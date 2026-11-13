import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import plugin from "../../../src/lint/eslint-plugin/index.ts";

// Every rule over the file named first, with no settings, as a host in its own process runs them:
// for what depends on the directory the host runs in, or on what it can import.
function main(): void {
  const file = resolve(process.argv[2] ?? "");
  const context = {
    filename: file,
    sourceCode: { text: readFileSync(file, "utf8") },
    report: ({ message }: { message: string }) => console.log(message),
  };
  for (const rule of Object.values(plugin.rules)) {
    rule.create(context).Program();
  }
}

main();
