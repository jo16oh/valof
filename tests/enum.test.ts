import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { equals, Val } from "../src/index.ts";
import {
  Enum,
  Trait,
  type AnyEnum,
  type Dyn,
  type SeedFor,
  type Self,
  type Tag,
  type VariantOf,
} from "../src/experimental.ts";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().implVariant(() => ({
  Circle: { diameter: (c) => c.r * 2 },
}));
const { Circle, Square } = Shape;

const circle = Circle({ r: 2 });
const square = Square({ side: 3 });

describe("the declaration", () => {
  test("derives one branded Val per variant", () => {
    expectTypeOf(circle).toEqualTypeOf<VariantOf<Shape, "Circle">>();
    expectTypeOf<VariantOf<Shape, "Circle"> | VariantOf<Shape, "Square">>().toEqualTypeOf<Shape>();
  });

  test("the constructor takes the payload, and the value carries the tag", () => {
    expectTypeOf<SeedFor<Shape, "Circle">>().toEqualTypeOf<{ readonly r: number }>();
    expect(circle).toEqual({ r: 2, _tag: "Circle" });
  });

  test("the brand is derived from the enum's name", () => {
    type Named = Val<"Shape.Circle", { r: number; _tag: "Circle" }>;
    expectTypeOf(circle).toExtend<Named>();
  });

  test("the payload is deep-copied, like any other Val", () => {
    type Box = Enum<"Box", { Full: { items: string[] }; Empty: { at: string } }>;
    const Box = Enum.companion<Box>();
    const items = ["a"];
    const full = Box.Full({ items });
    items.push("b");
    expect(full.items).toEqual(["a"]);
  });
});

describe("match", () => {
  test("narrows the handler's argument and is exhaustive", () => {
    const area = Shape.match(circle, {
      Circle: (c) => {
        expectTypeOf(c).toEqualTypeOf<VariantOf<Shape, "Circle">>();
        return Math.PI * c.r * c.r;
      },
      Square: (s) => s.side * s.side,
    });
    expectTypeOf(area).toEqualTypeOf<number>();
    expect(Shape.match(square, { Circle: (c) => c.r, Square: (s) => s.side })).toBe(3);
  });

  test("the return type is the handlers' union, not the first one", () => {
    const read = Shape.match(circle, { Circle: (c) => c.r, Square: (s) => `${s.side}` });
    expectTypeOf(read).toEqualTypeOf<string | number>();
  });

  test("a missing variant is a type error", () => {
    // @ts-expect-error Property 'Square' is missing
    Shape.match(circle, { Circle: (c) => c.r });
  });

  test("so is a key that names no variant", () => {
    Shape.match(circle, {
      Circle: (c) => c.r,
      Square: (s) => s.side,
      // @ts-expect-error this enum has no such variant
      Triangle: () => 0,
    });
  });
});

describe("the tag", () => {
  test("narrows the union", () => {
    const read = (shape: Shape): number => {
      if (shape._tag === "Circle") {
        expectTypeOf(shape).toEqualTypeOf<VariantOf<Shape, "Circle">>();
        return shape.r;
      }
      expectTypeOf(shape).toEqualTypeOf<VariantOf<Shape, "Square">>();
      return shape.side;
    };
    expect([read(circle), read(square)]).toEqual([2, 3]);
  });

  test("the constructor does not take it", () => {
    // @ts-expect-error the constructor writes the tag itself
    Circle({ r: 1, _tag: "Circle" });
  });

  test("and `patch` cannot reach it", () => {
    // @ts-expect-error a patch cannot switch variants
    Circle.patch(circle, { _tag: "Square" });
  });

  describe("a name of your own", () => {
    type Event = Enum<"Event", Tag<"kind"> & { Click: { x: number }; Key: { code: string } }>;
    const Event = Enum.companion<Event>("kind");

    test("is written in the declaration and passed to the companion", () => {
      expect(Event.Click({ x: 1 })).toEqual({ x: 1, kind: "Click" });
    });

    test("reserves no variant name of its own", () => {
      type Git = Enum<"Git", Tag<"type"> & { commit: { sha: string }; tag: { name: string } }>;
      const Git = Enum.companion<Git>("type");
      expect(Git.tag({ name: "v1" })).toEqual({ name: "v1", type: "tag" });
    });

    // Forgotten, misspelled, or passed where the default holds: the type answers for all three,
    // which is why there is no `tag-mismatch` lint rule.
    test("the argument follows the declaration", () => {
      // @ts-expect-error Expected 1 arguments, but got 0
      Enum.companion<Event>();
      // @ts-expect-error '"type"' is not assignable to '"kind"'
      Enum.companion<Event>("type");
      // @ts-expect-error '"kind"' is not assignable to '"_tag"'
      Enum.companion<Shape>("kind");
    });
  });
});

describe("shared fields", () => {
  type Node = Enum<"Node", { Leaf: { value: number }; Branch: { size: number } }, { id: string }>;
  const Node = Enum.companion<Node>();

  test("every constructor requires them, and the union reads them", () => {
    const leaf = Node.Leaf({ id: "l1", value: 1 });
    expect(leaf).toEqual({ id: "l1", value: 1, _tag: "Leaf" });
    const node: Node = leaf;
    expectTypeOf(node.id).toEqualTypeOf<string>();
  });

  test("and a constructor still refuses the tag", () => {
    // @ts-expect-error the constructor writes the tag itself
    Node.Leaf({ id: "l1", value: 1, _tag: "Leaf" });
  });
});

describe("members", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  const Money = Enum.companion<Money>()
    .implVariant(() => ({ Cash: { doubled: (c) => c.yen * 2 } }))
    .impl((self) => ({
      // The callback is what makes this the plain spelling: naming `Money` here is TS7022.
      spendable: (m) => self.match(m, { Cash: (c) => self.Cash.doubled(c), Card: (c) => c.limit }),
    }));

  test("a variant's member takes that variant, with no annotation", () => {
    expectTypeOf(Money.Cash.doubled).toEqualTypeOf<(self: VariantOf<Money, "Cash">) => number>();
    expect(Money.spendable(Money.Cash({ id: "c", yen: 100 }))).toBe(200);
    expect(Money.spendable(Money.Card({ id: "d", limit: 5 }))).toBe(5);
  });

  test("the frame is the same one a destructured variant gets", () => {
    const { Cash } = Money;
    const cash = Cash({ id: "c", yen: 1 });
    expect([Cash.doubled(cash), Money.Cash.doubled(cash)]).toEqual([2, 2]);
  });

  test("a union member may not take a variant's name", () => {
    // @ts-expect-error a member cannot cover a constructor
    Enum.companion<Shape>().impl(() => ({ Circle: (s: Shape) => s }));
  });

  test("nor `match`, nor a name the library wires", () => {
    // @ts-expect-error `match` is the library's
    Enum.companion<Shape>().impl(() => ({ match: (s: Shape) => s }));
    // @ts-expect-error `patch` is the library's
    Enum.companion<Shape>().impl(() => ({ patch: (s: Shape) => s }));
  });

  test("a step does not mutate the one before it", () => {
    const before = Enum.companion<Shape>();
    const after = before.implVariant(() => ({ Circle: { diameter: (c) => c.r * 2 } }));
    expect(Object.hasOwn(after.Circle, "diameter")).toBe(true);
    expect(Object.hasOwn(before.Circle, "diameter")).toBe(false);
  });
});

describe("patch", () => {
  test("derives through the same seal, and keeps the tag", () => {
    expect(Circle.patch(circle, { r: 5 })).toEqual({ r: 5, _tag: "Circle" });
  });

  test("returns the value it started from when nothing changed", () => {
    expect(Circle.patch(circle, { r: 2 })).toBe(circle);
  });

  describe("a nested variant", () => {
    type Holder = Val<"Holder", { id: string; shape: Shape }>;
    const Holder = Val.sealer<Holder>();
    const holder = Holder({ id: "h", shape: circle });

    test("is replaced whole, never merged", () => {
      expectTypeOf<
        NonNullable<Parameters<typeof Holder.patch>[1]["shape"]>
      >().toEqualTypeOf<Shape>();
      // @ts-expect-error a patch cannot reach into a nested variant
      Holder.patch(holder, { shape: { r: 3 } });
      expect(Holder.patch(holder, { shape: square }).shape).toEqual({ side: 3, _tag: "Square" });
    });
  });
});

describe("equals", () => {
  test("compares payloads, tag included", () => {
    expect(equals(circle, Circle({ r: 2 }))).toBe(true);
    expect(equals<Shape>(circle, square)).toBe(false);
  });
});

describe("traits", () => {
  type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;
  const Describable = Trait.companion<Describable>();

  type Cmd = Enum<"Cmd", { Add: { n: number }; Del: { at: number } }, { id: string } & Describable>;
  const Cmd = Enum.companion<Cmd>().implTrait(Describable, (self) => ({
    describe: (c) => self.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
  }));

  const add = Cmd.Add({ id: "c1", n: 2 });

  test("the union implements the trait once, and matches inside it", () => {
    expect([Cmd.describe(add), Cmd.describe(Cmd.Del({ id: "c2", at: 1 }))]).toEqual([
      "add 2",
      "del 1",
    ]);
  });

  test("a variant goes into a box like any other Val", () => {
    type User = Val<"User", { id: string }, Describable>;
    const User = Val.sealer<User>().implTrait(Describable, { describe: (u) => `user ${u.id}` });
    const party: Dyn<Describable>[] = [
      Describable.dyn(Cmd, add),
      Describable.dyn(User, User({ id: "u1" })),
    ];
    expect(party.map((p) => p.describe())).toEqual(["add 2", "user u1"]);
  });

  test("a trait that implements everything itself takes no second argument", () => {
    type Labelled = Trait<"Labelled", { id: string }, { label: (self: Self) => string }>;
    const Labelled = Trait.companion<Labelled>().impl({ label: (l) => `#${l.id}` });
    type Tick = Enum<"Tick", { Up: { n: number }; Down: { n: number } }, Labelled>;
    const Tick = Enum.companion<Tick>().implTrait(Labelled);
    expect(Tick.label(Tick.Up({ id: "t1", n: 1 }))).toBe("#t1");
  });

  test("a trait the enum does not declare is rejected", () => {
    // @ts-expect-error the type does not declare this trait
    Enum.companion<Shape>().implTrait(Describable, () => ({ describe: () => "" }));
  });

  // The third argument asks one question, "what does every variant hold", and a trait answers it
  // with the fields it requires. Declaring them a second time is not needed.
  test("the trait brings the fields it requires", () => {
    type Only = Enum<"Only", { One: { n: number }; Two: { n: number } }, Describable>;
    const Only = Enum.companion<Only>().implTrait(Describable, () => ({
      describe: (o) => o.id,
    }));
    expect(Only.describe(Only.One({ id: "o1", n: 1 }))).toBe("o1");
  });
});

// One check answers for the companion, since a broken declaration stops satisfying `AnyEnum`.
describe("a broken declaration", () => {
  test("a variant may not take a name the library wires", () => {
    type Matched = Enum<"Matched", { match: { n: number } }>;
    expectTypeOf<Matched>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant cannot take a name the library wires
    Enum.companion<Matched>();

    type Stepped = Enum<"Stepped", { implode: { n: number } }>;
    // @ts-expect-error same, for the steps' prefix
    Enum.companion<Stepped>();

    type Sneaky = Enum<"Sneaky", { __valof_traits: { n: number } }>;
    // @ts-expect-error same, for the library's own keys
    Enum.companion<Sneaky>();
  });

  // An indexed access over a single key hands back the variant itself, and the alias goes with
  // the union: a consumer's `.d.ts` then expands onto the private phantoms and fails with TS4094.
  test("an enum needs at least two variants", () => {
    type Lonely = Enum<"Lonely", { Only: { n: number } }>;
    expectTypeOf<Lonely>().not.toExtend<AnyEnum>();
    // @ts-expect-error an enum needs at least two variants; one is a Val
    Enum.companion<Lonely>();

    // With no variants at all the indexed access is `never`, and there is no value to build.
    expectTypeOf<Enum<"Empty", Record<never, never>>>().toEqualTypeOf<never>();
  });

  test("a variant's payload must be a record of fields", () => {
    type Primitive = Enum<"Primitive", { One: number }>;
    expectTypeOf<Primitive>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant's payload must be a record of fields
    Enum.companion<Primitive>();

    type Listed = Enum<"Listed", { Many: readonly string[] }>;
    // @ts-expect-error same, for an array
    Enum.companion<Listed>();
  });

  test("the tag may not take a name a payload or a shared field holds", () => {
    type Clash = Enum<"Clash", { One: { _tag: string } }>;
    expectTypeOf<Clash>().not.toExtend<AnyEnum>();
    // @ts-expect-error the tag cannot take the name of a field the payload holds
    Enum.companion<Clash>();

    type SharedClash = Enum<"SharedClash", { One: { n: number } }, { _tag: string }>;
    // @ts-expect-error the tag cannot take the name of a shared field
    Enum.companion<SharedClash>();
  });
});

describe("the companion is a proxy", () => {
  test("it answers any name it does not wire with a variant frame", () => {
    // It has no list of variant names to check against, which is the cost of the derived union.
    expect(typeof (Shape as unknown as Record<string, unknown>)["Triangle"]).toBe("function");
  });

  test("so a symbol and `then` come back undefined", async () => {
    expect((Shape as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
    expect(await Promise.resolve(Shape)).toBe(Shape);
  });
});
