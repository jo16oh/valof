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
const Shape = Enum.sealer<Shape>().implVariant("Circle", (variant) =>
  variant.impl({ diameter: (c) => c.r * 2 }),
);
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
    const Box = Enum.sealer<Box>();
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
    type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
    const Event = Enum.sealer<Event>("kind");

    test("is written in the declaration and passed to the companion", () => {
      expect(Event.Click({ x: 1 })).toEqual({ x: 1, kind: "Click" });
    });

    test("reserves no variant name of its own", () => {
      type Git = Enum<"Git", { commit: { sha: string }; tag: { name: string } }, Tag<"type">>;
      const Git = Enum.sealer<Git>("type");
      expect(Git.tag({ name: "v1" })).toEqual({ name: "v1", type: "tag" });
    });

    // Forgotten, misspelled, or passed where the default holds: the type answers for all three,
    // which is why there is no `tag-mismatch` lint rule.
    test("the argument follows the declaration", () => {
      // @ts-expect-error Expected 1 arguments, but got 0
      Enum.sealer<Event>();
      // @ts-expect-error '"type"' is not assignable to '"kind"'
      Enum.sealer<Event>("type");
      // @ts-expect-error '"kind"' is not assignable to '"_tag"'
      Enum.sealer<Shape>("kind");
    });
  });
});

describe("shared fields", () => {
  type Node = Enum<"Node", { Leaf: { value: number }; Branch: { size: number } }, { id: string }>;
  const Node = Enum.sealer<Node>();

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
  const Money = Enum.sealer<Money>()
    .implVariant("Cash", (sealer) => sealer.impl({ doubled: (c) => c.yen * 2 }))
    .impl({
      spendable: (m): number =>
        Money.match(m, { Cash: (c) => Money.Cash.doubled(c), Card: (c) => c.limit }),
    });

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

  test("a member reaching nothing off the companion needs no annotation", () => {
    const Plain = Enum.sealer<Shape>().impl({ sides: (s) => (s._tag === "Circle" ? 0 : 4) });
    expectTypeOf(Plain.sides).toEqualTypeOf<(self: Shape) => 0 | 4>();
    expect(Plain.sides(Plain.Circle({ r: 1 }))).toBe(0);
  });

  test("a union member may not take a variant's name", () => {
    // @ts-expect-error a member cannot cover a constructor
    Enum.sealer<Shape>().impl({ Circle: (s: Shape) => s });
  });

  test("nor `match`, nor a name the library wires", () => {
    // @ts-expect-error `match` is the library's
    Enum.sealer<Shape>().impl(() => ({ match: (s: Shape) => s }));
    // @ts-expect-error `patch` is the library's
    Enum.sealer<Shape>().impl(() => ({ patch: (s: Shape) => s }));
  });

  test("nor `then`, which would make the companion a thenable", () => {
    // @ts-expect-error `await` on a thenable companion never settles
    // oxlint-disable-next-line no-thenable -- the rejection is what this test reads
    Enum.sealer<Shape>().impl(() => ({ then: (s: Shape) => s }));
  });

  test("a step does not mutate the one before it", () => {
    const before = Enum.sealer<Shape>();
    const after = before.implVariant("Circle", (variant) =>
      variant.impl({ diameter: (c) => c.r * 2 }),
    );
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
  const Cmd = Enum.sealer<Cmd>().implTrait(Describable, {
    describe: (c): string => Cmd.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
  });

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
    const Tick = Enum.sealer<Tick>().implTrait(Labelled);
    expect(Tick.label(Tick.Up({ id: "t1", n: 1 }))).toBe("#t1");
  });

  test("a trait the enum does not declare is rejected", () => {
    // @ts-expect-error the type does not declare this trait
    Enum.sealer<Shape>().implTrait(Describable, { describe: () => "" });
  });

  // The third argument asks one question, "what does every variant hold", and a trait answers it
  // with the fields it requires. Declaring them a second time is not needed.
  test("the trait brings the fields it requires", () => {
    type Only = Enum<"Only", { One: { n: number }; Two: { n: number } }, Describable>;
    const Only = Enum.sealer<Only>().implTrait(Describable, { describe: (o) => o.id });
    expect(Only.describe(Only.One({ id: "o1", n: 1 }))).toBe("o1");
  });
});

// One check answers for the companion, since a broken declaration stops satisfying `AnyEnum`.
describe("a broken declaration", () => {
  test("a variant may not be called `then`", () => {
    type Awaited = Enum<"Awaited", { then: { n: number }; Other: { n: number } }>;
    expectTypeOf<Awaited>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant named `then` would make the companion a thenable
    Enum.sealer<Awaited>();
  });

  test("a variant may not take a name the library wires", () => {
    type Sealed = Enum<"Sealed", { seal: { n: number }; Other: { n: number } }>;
    expectTypeOf<Sealed>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant cannot take a name the library wires
    Enum.companion<Sealed>();

    type Matched = Enum<"Matched", { match: { n: number } }>;
    expectTypeOf<Matched>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant cannot take a name the library wires
    Enum.sealer<Matched>();

    type Stepped = Enum<"Stepped", { implode: { n: number } }>;
    // @ts-expect-error same, for the steps' prefix
    Enum.sealer<Stepped>();

    type Sneaky = Enum<"Sneaky", { __valof_traits: { n: number } }>;
    // @ts-expect-error same, for the library's own keys
    Enum.sealer<Sneaky>();
  });

  // An indexed access over a single key hands back the variant itself, and the alias goes with
  // the union: a consumer's `.d.ts` then expands onto the private phantoms and fails with TS4094.
  test("an enum needs at least two variants", () => {
    type Lonely = Enum<"Lonely", { Only: { n: number } }>;
    expectTypeOf<Lonely>().not.toExtend<AnyEnum>();
    // @ts-expect-error an enum needs at least two variants; one is a Val
    Enum.sealer<Lonely>();

    // With no variants at all the indexed access is `never`, and there is no value to build.
    expectTypeOf<Enum<"Empty", Record<never, never>>>().toEqualTypeOf<never>();
  });

  test("a variant's payload must be a record of fields", () => {
    type Primitive = Enum<"Primitive", { One: number }>;
    expectTypeOf<Primitive>().not.toExtend<AnyEnum>();
    // @ts-expect-error a variant's payload must be a record of fields
    Enum.sealer<Primitive>();

    type Listed = Enum<"Listed", { Many: readonly string[] }>;
    // @ts-expect-error same, for an array
    Enum.sealer<Listed>();
  });

  test("the tag may not take a name a payload or a shared field holds", () => {
    type Clash = Enum<"Clash", { One: { _tag: string } }>;
    expectTypeOf<Clash>().not.toExtend<AnyEnum>();
    // @ts-expect-error the tag cannot take the name of a field the payload holds
    Enum.sealer<Clash>();

    type SharedClash = Enum<"SharedClash", { One: { n: number } }, { _tag: string }>;
    // @ts-expect-error the tag cannot take the name of a shared field
    Enum.sealer<SharedClash>();
  });
});

describe("a seal of its own", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  const ran: string[] = [];
  const Money = Enum.companion<Money>()
    .implSeal((p, seal) => {
      ran.push("enum");
      return p.id ? seal(p) : new RangeError("id must not be empty");
    })
    .implVariant("Cash", (variant) =>
      variant
        .implSeal((p, seal) => {
          ran.push("variant");
          return p.yen > 0 ? seal(p) : new RangeError("yen must be positive");
        })
        .impl({ doubled: (c) => c.yen * 2 }),
    )
    .impl();

  test("every variant builds with `create`, and the seal's return propagates", () => {
    const cash = Money.Cash.create({ id: "m1", yen: 100 });
    expectTypeOf(cash).toEqualTypeOf<VariantOf<Money, "Cash"> | RangeError>();
    expect(cash).toEqual({ id: "m1", yen: 100, _tag: "Cash" });
    expect(Money.Cash.create({ id: "m1", yen: 0 })).toBeInstanceOf(RangeError);
  });

  test("the variant runs first, then the enum, then the default seal", () => {
    ran.length = 0;
    Money.Cash.create({ id: "m1", yen: 1 });
    expect(ran).toEqual(["variant", "enum"]);
  });

  test("a variant that wrote none takes the enum's seal as its own", () => {
    const card = Money.Card.create({ id: "m2", limit: 5 });
    expectTypeOf(card).toEqualTypeOf<VariantOf<Money, "Card"> | RangeError>();
    expect(card).toEqual({ id: "m2", limit: 5, _tag: "Card" });
    expect(Money.Card.create({ id: "", limit: 5 })).toBeInstanceOf(RangeError);
  });

  test("`seal` on a variant takes the tagged payload, and runs the enum's check too", () => {
    expect(Money.Cash.seal({ id: "m1", yen: 1, _tag: "Cash" })).toEqual({
      id: "m1",
      yen: 1,
      _tag: "Cash",
    });
    expect(Money.Cash.seal({ id: "", yen: 1, _tag: "Cash" })).toBeInstanceOf(RangeError);
    // @ts-expect-error the tag draws the frame, so the payload carries it
    Money.Cash.seal({ id: "m1", yen: 1 });
  });

  test("`patch` derives through the same seal", () => {
    const cash = Money.Cash.create({ id: "m1", yen: 100 }) as VariantOf<Money, "Cash">;
    expect(Money.Cash.patch(cash, { yen: 5 })).toEqual({ id: "m1", yen: 5, _tag: "Cash" });
    expect(Money.Cash.patch(cash, { yen: -1 })).toBeInstanceOf(RangeError);
  });

  test("the members a variant registered sit on the same frame", () => {
    expect(Money.Cash.doubled(Money.Cash.create({ id: "m1", yen: 2 }) as never)).toBe(4);
  });

  test("a seal written after a variant is rejected", () => {
    Enum.companion<Money>()
      .implVariant("Cash", (variant) => variant.impl())
      // @ts-expect-error that frame would be typed without this seal and still run it
      .implSeal((p, seal) => seal(p));
  });

  test("a variant seals alone where the enum wrote none", () => {
    const Plain = Enum.companion<Shape>()
      .implVariant("Circle", (variant) =>
        variant
          .implSeal((p, seal) => (p.r > 0 ? seal(p) : new RangeError("r must be positive")))
          .impl(),
      )
      .impl();
    expect(Plain.Circle.create({ r: 2 })).toEqual(circle);
    expect(Plain.Circle.create({ r: 0 })).toBeInstanceOf(RangeError);
    expectTypeOf(Plain.Square.create({ side: 3 })).toEqualTypeOf<VariantOf<Shape, "Square">>();
    expect(Plain.Square.create({ side: 3 })).toEqual(square);
  });

  test("a companion with no seal at all still builds and still takes the wire", () => {
    const Plain = Enum.companion<Shape>().impl();
    expect(Plain.Circle.create({ r: 2 })).toEqual(circle);
    expect(Plain.seal({ side: 3, _tag: "Square" })).toEqual(square);
    expectTypeOf(Plain.Circle.create({ r: 2 })).toEqualTypeOf<VariantOf<Shape, "Circle">>();
    expectTypeOf(Plain.Circle).not.toHaveProperty("seal");
  });

  describe("the boundary entry", () => {
    test("draws the frame from the tag and hands over to that variant's seal", () => {
      const sealed = Money.seal({ id: "m1", yen: 1, _tag: "Cash" });
      expectTypeOf(sealed).toEqualTypeOf<
        VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError
      >();
      expect(sealed).toEqual({ id: "m1", yen: 1, _tag: "Cash" });
      expect(Money.seal({ id: "m2", limit: 2, _tag: "Card" })).toEqual({
        id: "m2",
        limit: 2,
        _tag: "Card",
      });
      expect(Money.seal({ id: "m1", yen: 0, _tag: "Cash" })).toBeInstanceOf(RangeError);
    });

    test("a sealer is the entry itself, and hands back the union", () => {
      const shape = Shape({ r: 2, _tag: "Circle" });
      expectTypeOf(shape).toEqualTypeOf<Shape>();
      expect(shape).toEqual(circle);
      expect(Shape({ side: 3, _tag: "Square" })).toEqual(square);
    });
  });

  test("a sealer has no seal to replace: its constructors are the default one", () => {
    expectTypeOf(Enum.sealer<Shape>()).not.toHaveProperty("implSeal");
    // @ts-expect-error `implSeal` is not a step of a variant's either
    Enum.sealer<Shape>().implVariant("Circle", (variant) => variant.implSeal(() => ({})));
  });

  test("a variant's member reaching the enum names the companion and annotates its return", () => {
    const Twinned = Enum.sealer<Shape>().implVariant("Circle", (variant) =>
      variant.impl({ twin: (c): Shape => Twinned.Square({ side: c.r }) }),
    );
    expect(Twinned.Circle.twin(circle)).toEqual({ side: 2, _tag: "Square" });
  });

  test("a variant already built cannot be named again", () => {
    Enum.sealer<Shape>()
      .implVariant("Circle", (variant) => variant.impl({ diameter: (c) => c.r * 2 }))
      // @ts-expect-error the second frame would drop the first
      .implVariant("Circle", (variant) => variant.impl());
  });

  test("the steps are already the frame, so a callback collecting nothing hands them back", () => {
    const Kept = Enum.companion<Money>()
      .implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id must not be empty")))
      .implVariant("Cash", (variant) => variant)
      .impl();
    expect(Kept.Cash.create({ id: "m1", yen: 1 })).toEqual({ id: "m1", yen: 1, _tag: "Cash" });
    expect(Kept.Cash.create({ id: "", yen: 1 })).toBeInstanceOf(RangeError);
  });

  test("a sealer's steps are the constructor itself", () => {
    const Kept = Enum.sealer<Shape>().implVariant("Circle", (variant) => variant);
    expect(Kept.Circle({ r: 2 })).toEqual(circle);
    expect(Kept.Circle.patch(circle, { r: 5 })).toEqual({ r: 5, _tag: "Circle" });
  });

  test("a seal a variant wrote stands on the steps it returns", () => {
    const Plain = Enum.companion<Shape>()
      .implVariant("Circle", (variant) =>
        variant.implSeal((p, seal) => (p.r > 0 ? seal(p) : new RangeError("r must be positive"))),
      )
      .impl();
    expect(Plain.Circle.create({ r: 2 })).toEqual(circle);
    expect(Plain.Circle.create({ r: 0 })).toBeInstanceOf(RangeError);
  });

  test("a frame a step made is closed", () => {
    // A step reached from that frame would stand a second constructor beside the first.
    expect("implSeal" in Money.Cash).toBe(false);
    expectTypeOf(Money.Cash).not.toHaveProperty("implSeal");
  });
});

describe("the chain closes", () => {
  test("`impl` ends every step but itself, so a seal takes no second pass", () => {
    const closed = Enum.companion<Shape>().impl({ tag: (s) => s._tag });
    expectTypeOf(closed).not.toHaveProperty("implSeal");
    expectTypeOf(closed).not.toHaveProperty("implVariant");
    expect((closed as unknown as Record<string, unknown>)["implSeal"]).toBeUndefined();
  });

  test("calling `impl` with nothing closes that one too", () => {
    const closed = Enum.companion<Shape>().impl();
    expectTypeOf(closed).not.toHaveProperty("impl");
    expect((closed as unknown as Record<string, unknown>)["impl"]).toBeUndefined();
  });

  test("a member calling a sibling names the companion and annotates its return", () => {
    const Sized = Enum.sealer<Shape>().impl({
      area: (s): number =>
        Sized.match(s, { Circle: (c) => c.r * c.r * 3, Square: (q) => q.side ** 2 }),
      twice: (s): number => Sized.area(s) * 2,
    });

    expect(Sized.twice(Sized.Square({ side: 3 }))).toBe(18);
  });

  test("one call closes the chain", () => {
    const closed = Enum.sealer<Shape>().impl({ sides: () => 4 });
    expectTypeOf(closed).not.toHaveProperty("impl");
    expect((closed as unknown as Record<string, unknown>)["impl"]).toBeUndefined();
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
