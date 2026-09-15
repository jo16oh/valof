import { describe, expect, test, vi } from "vite-plus/test";

import { headingsFromBook, headingsFromMarkdown, preprocess, sidebarScript } from "./index.ts";

describe("mdBook sidebar", () => {
  test("collects heading text and mdBook-compatible ids", () => {
    expect(
      headingsFromMarkdown(
        ["# Repeated", "## `Val.of`", "### Map / Set", "## Repeated", "## Repeated"].join("\n"),
      ),
    ).toEqual([
      { depth: 2, id: "valof", text: "Val.of" },
      { depth: 3, id: "map--set", text: "Map / Set" },
      { depth: 2, id: "repeated-1", text: "Repeated" },
      { depth: 2, id: "repeated-2", text: "Repeated" },
    ]);
  });

  test("collects nested chapters under their HTML paths", () => {
    const book = {
      items: [
        {
          Chapter: {
            content: "# Guide\n## Start",
            number: [1],
            path: "guide/index.md",
            sub_items: [
              {
                Chapter: {
                  content: "# Next\n## Finish",
                  number: [1, 1],
                  path: "guide/next.md",
                  sub_items: [],
                },
              },
            ],
          },
        },
      ],
    };

    expect(headingsFromBook(book)).toEqual({
      "guide/index.html": [{ depth: 2, id: "start", text: "Start" }],
      "guide/next.html": [{ depth: 2, id: "finish", text: "Finish" }],
    });
  });

  test("excludes chapters outside the bulleted list", () => {
    expect(
      headingsFromBook({
        items: [
          {
            Chapter: {
              content: "# Preface\n## About this book",
              number: null,
              path: "preface.md",
              sub_items: [],
            },
          },
        ],
      }),
    ).toEqual({});
  });

  test("writes open sidebar data by default and returns the book unchanged", () => {
    const write = vi.fn();
    const book = { items: [] };

    expect(preprocess([{}, book], write)).toBe(book);
    expect(write).toHaveBeenCalledWith({ defaultOpen: true, headings: {} });
    expect(sidebarScript({ defaultOpen: true, headings: {} })).toBe(
      'globalThis.mdbookSidebar = {"defaultOpen":true,"headings":{}};\n',
    );
  });

  test("reads default-open from the preprocessor config", () => {
    const write = vi.fn();

    preprocess(
      [{ config: { preprocessor: { sidebar: { "default-open": false } } } }, { items: [] }],
      write,
    );

    expect(write).toHaveBeenCalledWith({ defaultOpen: false, headings: {} });
  });
});
