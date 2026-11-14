import { preprocess, type PreprocessorInput } from "./index.ts";

async function main() {
  if (process.argv[2] === "supports") {
    process.exitCode = process.argv[3] === "html" ? 0 : 1;
    return;
  }

  process.stdin.setEncoding("utf8");
  let stdin = "";
  for await (const chunk of process.stdin) {
    stdin += chunk;
  }

  const input = JSON.parse(stdin) as PreprocessorInput;
  process.stdout.write(JSON.stringify(await preprocess(input)));
}

await main();
