import { afterAll, describe, expect, test, vi } from "vite-plus/test";
import type { Val as Value } from "../src/index.ts";

const previousNodeEnv = vi.hoisted(() => {
  const previous = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  return previous;
});

import { Val } from "../src/index.ts";

afterAll(() => {
  if (previousNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = previousNodeEnv;
});

describe("Val nocopy in production", () => {
  type Item = Value<"ProductionItem", { label: string }>;
  type Document = Value<
    "ProductionDocument",
    { item: Item; metadata: { version: number }; note: string }
  >;
  const Document = Val.sealer<Document>();

  test("indexes adopted descendants lazily and preserves an unchanged subtree", () => {
    const item = { label: "kept" } as Item;
    const metadata = { version: 1 } as const;
    const seed = { item, metadata, note: "before" } as const;
    const document = Document.nocopy(seed);

    // This is also a guard that the test loaded val.ts through its production branch.
    expect(Object.isFrozen(seed)).toBe(false);

    const changed = Document.patch(document, { note: "after" });
    expect(changed.metadata).toBe(metadata);

    // `patch` indexed `item` as an already-owned nested Val. A normal seal can now reuse it.
    expect(Val.of<Item>(changed.item)).toBe(item);
  });

  test("copies an external object introduced by a patch", () => {
    const document = Document.nocopy({
      item: { label: "kept" } as Item,
      metadata: { version: 1 },
      note: "before",
    });
    const external = { version: 2 } as const;

    const changed = Document.patch(document, { metadata: external });
    expect(changed.metadata).toEqual(external);
    expect(changed.metadata).not.toBe(external);
  });

  test("finishes indexing an adopted graph containing a cycle", () => {
    type Counter = Value<"ProductionCounter", { count: number }>;
    const Counter = Val.sealer<Counter>();
    const seed: { count: number; self?: unknown } = { count: 1 };
    seed.self = seed;
    const counter = Counter.nocopy(seed as never);

    const changed = Counter.patch(counter, { count: 2 });
    expect(changed.count).toBe(2);
  });
});
