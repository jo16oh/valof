import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { codeBlocks, isTypeScript } from "../markdown-code/index.ts";

/** A block the fence marked ```ts,ignore. Kept, so the test output says it was left out. */
export const IGNORE = "ignore";

export type DocBlock = {
  /** `caveats.md:18`, which is the test's name. */
  name: string;
  code: string;
  ignored: boolean;
};

export function docBlocks(directory: string): DocBlock[] {
  const blocks: DocBlock[] = [];

  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".md")) {
      continue;
    }

    blocks.push(...markdownBlocks(readFileSync(join(directory, file), "utf8"), file));
  }

  return blocks;
}

/** TypeScript fences from one Markdown document, named for a test report. */
export function markdownBlocks(markdown: string, name: string): DocBlock[] {
  return codeBlocks(markdown)
    .filter((block) => isTypeScript(block.language))
    .map((block) => ({
      name: `${name}:${block.line}`,
      code: block.value,
      ignored: block.attributes.includes(IGNORE),
    }));
}
