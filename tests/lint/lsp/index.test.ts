import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { eslint, oxlint, source, start, type Editor, type Host } from "./editor.ts";

// The plugin runs in an editor before it runs in CI, and an editor asks over LSP: the file it
// asks about is the buffer being typed in, which disk has not seen. Both hosts are started for
// real, over the same fixture, and every test is written once.

const FINDING = "Order.total holds Money, which has its own equals";

function tests(host: Host): void {
  let editor: Editor;
  beforeEach(async () => {
    editor = await start(host);
  });
  afterEach(() => editor.close());

  test("reports the file as it sits on disk", async () => {
    expect(await editor.open("src/order.ts")).toEqual([FINDING]);
  });

  test("follows the buffer, not disk", async () => {
    await editor.open("src/order.ts");
    const fixed = source("src/order.ts").replace(
      /Val\.sealer<Order>\(\)[\s\S]*;/,
      "Val.sealer<Order>().implEquals((a, b) => a.id === b.id);",
    );
    expect(await editor.type("src/order.ts", fixed)).toEqual([]);
  });

  test("follows a file it never opened", async () => {
    expect(await editor.open("src/order.ts")).toEqual([FINDING]);
    const money = source("src/money.ts");
    try {
      editor.save("src/money.ts", money.replace(/\.implEquals\([^;]*\)/, ""));
      expect(await editor.recheck("src/order.ts")).toEqual([]);
    } finally {
      editor.save("src/money.ts", money);
    }
  });

  test("reports what only the buffer holds", async () => {
    await editor.open("src/order.ts");
    const member = source("src/order.ts").replace(
      '.fixed<"id">();',
      '.fixed<"id">()\n  .impl({ label: (o) => o.id });',
    );
    expect(await editor.type("src/order.ts", member)).toEqual([
      "Order.label is never read",
      FINDING,
    ]);
  });
}

describe("oxlint", () => tests(oxlint));
describe("eslint", () => tests(eslint));
