import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "./index.ts";

function main(): void {
  // The site root of the published book: one directory per tag, plus `latest`.
  const root = process.argv[2];
  if (root === undefined) throw new Error("usage: node main.ts <site-root>");

  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  writeFileSync(join(root, "index.html"), render(names));
}

main();
