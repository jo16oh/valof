import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { preprocess, type PreprocessorInput } from "./index.ts";

function main(): void {
  if (process.argv[2] === "supports") {
    process.exitCode = process.argv[3] === "html" ? 0 : 1;
    return;
  }

  const input = JSON.parse(readFileSync(0, "utf8")) as PreprocessorInput;
  process.stdout.write(JSON.stringify(preprocess(input, packageVersion())));
}

function packageVersion(): string {
  const path = fileURLToPath(new URL("../../../package.json", import.meta.url));
  return (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;
}

main();
