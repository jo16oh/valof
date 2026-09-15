import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Chapter = {
  content: string;
  sub_items: BookItem[];
};

type BookItem = {
  Chapter?: Chapter;
};

type Book = {
  items: BookItem[];
};

type PreprocessorInput = [unknown, Book];

// The book is built fresh per tag, so this always names the version being documented.
const placeholder = "{{valof-version}}";

function transformChapters(section: BookItem[], transform: (content: string) => string): void {
  for (const item of section) {
    const chapter = item.Chapter;
    if (!chapter) {
      continue;
    }
    chapter.content = transform(chapter.content);
    transformChapters(chapter.sub_items, transform);
  }
}

export function preprocess(input: PreprocessorInput, version: string): Book {
  const [, book] = input;
  transformChapters(book.items, (content) => content.replaceAll(placeholder, version));
  return book;
}

function packageVersion(): string {
  const path = fileURLToPath(new URL("../../../package.json", import.meta.url));
  return (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;
}

function main(): void {
  if (process.argv[2] === "supports") {
    process.exitCode = process.argv[3] === "html" ? 0 : 1;
    return;
  }

  const input = JSON.parse(readFileSync(0, "utf8")) as PreprocessorInput;
  process.stdout.write(JSON.stringify(preprocess(input, packageVersion())));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
