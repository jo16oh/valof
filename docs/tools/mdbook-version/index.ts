// The book is built fresh per tag, so this always names the version being documented.
const PLACEHOLDER = "{{valof-version}}";

export type PreprocessorInput = [unknown, Book];

export function preprocess(input: PreprocessorInput, version: string): Book {
  const [, book] = input;
  transformChapters(book.items, (content) => content.replaceAll(PLACEHOLDER, version));
  return book;
}

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
