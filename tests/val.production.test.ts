import { afterAll, describe, expect, test, vi } from "vite-plus/test";
import type { Enum as EnumOf, Val as Value } from "../src/index.ts";

const previousNodeEnv = vi.hoisted(() => {
  const previous = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  return previous;
});

import { Enum, Val } from "../src/index.ts";

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
  const Document = Val.companion<Document>().build();

  test("indexes adopted descendants lazily and preserves an unchanged subtree", () => {
    const item = { label: "kept" } as Item;
    const metadata = { version: 1 } as const;
    const seed = { item, metadata, note: "before" } as const;
    const document = Document.seal.nocopy(seed);

    // This is also a guard that the test loaded val.ts through its production branch.
    expect(Object.isFrozen(seed)).toBe(false);

    const changed = Document.patch(document, { note: "after" });
    expect(changed.metadata).toBe(metadata);

    // `patch` indexed `item` as an already-owned nested Val. A normal seal can now reuse it.
    expect(Val.of<Item>(changed.item)).toBe(item);
  });

  test("copies an external object introduced by a patch", () => {
    const document = Document.seal.nocopy({
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
    const Counter = Val.companion<Counter>().build();
    const seed: { count: number; self?: unknown } = { count: 1 };
    seed.self = seed;
    const counter = Counter.seal.nocopy(seed as never);

    const changed = Counter.patch(counter, { count: 2 });
    expect(changed.count).toBe(2);
  });
});

describe("implCreate.noseal in production", () => {
  test("skips the custom seal", () => {
    type SectionId = Value<"ProductionSectionId", string>;
    let sealed = 0;
    const SectionId = Val.companion<SectionId>()
      .implSeal((text, seal): SectionId | undefined => {
        sealed += 1;
        return seal(text);
      })
      .implCreate.noseal(() => "0123abcd")
      .build();

    expect(SectionId.create()).toBe("0123abcd");
    expect(SectionId.create.nocopy()).toBe("0123abcd");
    expect(sealed).toBe(0);
  });
});

describe("a member in production", () => {
  // The check costs nothing there, and a member it would have caught still runs data-first.
  test("hiding its parameters is not checked", () => {
    type Named = Value<"ProductionNamed", { name: string }>;
    const greet = (n: Named, greeting: string) => `${greeting}, ${n.name}`;
    const Named = Val.companion<Named>()
      .impl(() => ({
        greet: (...args: [Named, string]) => greet(...args),
      }))
      .build();
    expect(Named.greet(Named.seal({ name: "bob" }), "Hi")).toBe("Hi, bob");
  });

  test("of `implAssoc` hiding its parameters is not checked either", () => {
    type Money = Value<"ProductionMoney", { cents: number }>;
    const Money = Val.companion<Money>()
      .implAssoc(({ seal }) => ({
        fromCents: (...args: [number]) => seal({ cents: args[0] }),
      }))
      .build();
    expect(Money.fromCents(5)).toEqual({ cents: 5 });
  });
});

describe("an enum variant in production", () => {
  // Without the check, the spread that adds the tag turns a string into a character map.
  test("throws on a payload that is not an object", () => {
    type Signal = EnumOf<"ProductionSignal", { Stop: {}; Go: { speed: number } }>;
    const Signal = Enum.companion<Signal>().build();
    expect(() => Signal.Stop.seal("text" as never)).toThrow(TypeError);
  });
});

describe("a variant's implCreate.noseal in production", () => {
  test("returns the variant without running the seal", () => {
    type Task = EnumOf<"ProductionTask", { Done: { at: number }; Todo: { text: string } }>;
    const Task = Enum.companion<Task>()
      .Done.implSeal((d, seal) => (d.at > 0 ? seal(d) : new RangeError("at must be positive")))
      .Done.implCreate.noseal(() => ({ at: 0 }))
      .build();
    expect(Task.Done.create()).toEqual({ at: 0, _tag: "Done" });
  });
});

describe("an enum's implCreate.noseal in production", () => {
  test("returns the variant without running a seal", () => {
    type Task = EnumOf<"ProductionEnumTask", { Done: { at: number }; Todo: { text: string } }>;
    const Task = Enum.companion<Task>()
      .Done.implSeal((d, seal) => (d.at > 0 ? seal(d) : new RangeError("at must be positive")))
      .implSeal((input, seal) => (input._tag === "Done" ? new TypeError("not done") : seal(input)))
      .implCreate.noseal(() => ({ _tag: "Done" as const, at: 0 }))
      .build();
    expect(Task.create()).toEqual({ at: 0, _tag: "Done" });
  });
});

describe("members in production", () => {
  type Named = Value<"ProductionNamed", { name: string }>;

  test("a member hiding a default parameter builds, unchecked", () => {
    // oxlint-disable-next-line typescript/no-useless-default-assignment -- the annotation hides it on purpose
    const greet: (n: Named, sep: string) => string = (n, sep = "/") => n.name + sep;
    expect(() =>
      Val.companion<Named>()
        .impl(() => ({ greet }))
        .build(),
    ).not.toThrow();
  });
});
