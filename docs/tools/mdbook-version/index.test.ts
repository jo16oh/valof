import { describe, expect, test } from "vite-plus/test";

import { preprocess } from "./index.ts";

describe("mdBook version", () => {
  test("replaces the placeholder in every chapter", () => {
    const book = {
      items: [
        {
          Chapter: {
            content: "Valof {{valof-version}}",
            sub_items: [{ Chapter: { content: "nested {{valof-version}}", sub_items: [] } }],
          },
        },
      ],
    };

    expect(preprocess([{}, book], "0.7.0")).toEqual({
      items: [
        {
          Chapter: {
            content: "Valof 0.7.0",
            sub_items: [{ Chapter: { content: "nested 0.7.0", sub_items: [] } }],
          },
        },
      ],
    });
  });

  test("leaves content without the placeholder untouched", () => {
    const book = { items: [{ Chapter: { content: "No version here.", sub_items: [] } }] };

    expect(preprocess([{}, book], "0.7.0")).toBe(book);
  });
});
