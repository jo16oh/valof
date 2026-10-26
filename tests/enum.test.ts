import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import {
  equals,
  Val,
  type PayloadOf,
  type PrivateCreate,
  type PrivateSeal,
  type Rec,
  type Unpatchable,
} from "../src/index.ts";
import type { CallBuildFirst } from "../src/val.ts";
import {
  Enum,
  Trait,
  type AnyEnum,
  type Dyn,
  type Final,
  type NameOf,
  type VariantOptions,
  type SeedFor,
  type SealedPayload,
  type Self,
  Otherwise,
  Tag,
  type VariantOf,
} from "../src/experimental.ts";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>()
  .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
  .build();
const { Circle, Square } = Shape;

const circle = Circle.create({ r: 2 });
const square = Square.create({ side: 3 });

describe("the declaration", () => {
  test("derives one branded Val per variant", () => {
    expectTypeOf(circle).toEqualTypeOf<VariantOf<Shape, "Circle">>();
    expectTypeOf<VariantOf<Shape, "Circle"> | VariantOf<Shape, "Square">>().toEqualTypeOf<Shape>();
  });

  test("`create` takes the fields, and the value carries the tag it writes", () => {
    expectTypeOf<SeedFor<Shape, "Circle">>().toEqualTypeOf<{ readonly r: number }>();
    expectTypeOf(Circle.create).parameter(0).toEqualTypeOf<SeedFor<Shape, "Circle">>();
    expect(circle).toEqual({ r: 2, _tag: "Circle" });
  });

  test("the brand is derived from the enum's name", () => {
    type Named = Val<"Shape.Circle", { r: number; _tag: "Circle" }>;
    expectTypeOf(circle).toExtend<Named>();
  });

  test("the payload is deep-copied, like any other Val, and `nocopy` adopts it on both gates", () => {
    type Crate = Enum<"Crate", { Full: { items: readonly string[] }; Empty: { at: string } }>;
    const Crate = Enum.companion<Crate>()
      .Full.implCreate((items: readonly string[]) => ({ items }))
      .build();
    const [created, checked, copied] = [["a"], ["a"], ["a"]];
    Crate.Full.create.nocopy(created);
    Crate.Full.seal.nocopy({ items: checked, _tag: "Full" });
    const full = Crate.Full.create(copied);
    copied.push("b");
    expect(full.items).toEqual(["a"]);
    expect([created, checked, copied].map(Object.isFrozen)).toEqual([true, true, false]);
  });

  test("a variant with no fields takes an object, and nothing else", () => {
    type Signal = Enum<"Signal", { Stop: {}; Go: { speed: number } }>;
    const Signal = Enum.companion<Signal>().build();
    expectTypeOf(Signal.Stop.create({})).toExtend<SeedFor<Signal, "Stop">>();
    expectTypeOf<string>().not.toExtend<SeedFor<Signal, "Stop">>();
    // Through a cast, the seal throws rather than spread the string into its characters.
    expect(() => Signal.Stop.seal("text" as never)).toThrow(/variant's payload/);
    expect(() => Signal.Stop.seal([1] as never)).toThrow(/variant's payload/);
  });

  // The type is structural, and the spread that adds the tag would drop the prototype unseen.
  test("a class instance is rejected, like in any other Val", () => {
    class Ring {
      r = 1;
    }
    expect(() => Circle.create(new Ring())).toThrow(/instance of Ring/);
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
    Shape.match(circle, {
      Circle: (c) => c.r,
      _: () => 0,
      // @ts-expect-error this enum has no such variant
      Triangle: () => 0,
    });
  });

  test("`_` takes the variants no other handler names, narrowed to them", () => {
    const read = (s: Shape) =>
      Shape.match(s, {
        Circle: (c) => c.r,
        _: (rest) => {
          expectTypeOf(rest).toEqualTypeOf<VariantOf<Shape, "Square">>();
          return `${rest.side}`;
        },
      });
    expectTypeOf(read).returns.toEqualTypeOf<number | string>();
    expect([read(circle), read(square)]).toEqual([2, "3"]);
  });

  test("`_` beside a handler for every variant is a type error", () => {
    Shape.match(circle, {
      Circle: (c) => c.r,
      Square: (s) => s.side,
      // @ts-expect-error every variant has a handler, so `_` never runs
      _: () => 0,
    });
  });

  test("`[Otherwise]` does what `_` does, and may not appear beside it or beside every handler", () => {
    const read = (s: Shape) =>
      Shape.match(s, {
        Circle: (c) => c.r,
        [Otherwise]: (rest) => {
          expectTypeOf(rest).toEqualTypeOf<VariantOf<Shape, "Square">>();
          return `${rest.side}`;
        },
      });
    expect([read(circle), read(square)]).toEqual([2, "3"]);
    Shape.match(circle, {
      Circle: (c) => c.r,
      Square: (s) => s.side,
      // @ts-expect-error every variant has a handler, so `[Otherwise]` never runs
      [Otherwise]: () => 0,
    });
    Shape.match(circle, {
      Circle: (c) => c.r,
      [Otherwise]: () => 0,
      // @ts-expect-error `[Otherwise]` handles the rest already
      _: () => 0,
    });
  });

  // `Symbol.for(…)` in a literal widens to `symbol`, which the type cannot distinguish from
  // `Otherwise`.
  test("a symbol other than `Otherwise` is rejected", () => {
    // @ts-expect-error this enum has no such variant
    Shape.match(circle, { Circle: (c) => c.r, [Symbol.for("valof.otherwise")]: () => 0 });
  });
});

describe("match on a tag alone", () => {
  const pick = (name: string): "Circle" | "Square" => (name === "round" ? "Circle" : "Square");

  test("runs the handler the tag selects, and returns the handlers' union", () => {
    const build = (name: string) =>
      Shape[Tag].match(pick(name), {
        Circle: () => Shape.Circle.create({ r: 2 }),
        Square: () => `square`,
      });
    expectTypeOf(build).returns.toEqualTypeOf<VariantOf<Shape, "Circle"> | string>();
    expect([build("round"), build("box")]).toEqual([circle, "square"]);
  });

  test("needs a handler for every tag the argument can hold, and no other", () => {
    // @ts-expect-error Property 'Square' is missing
    Shape[Tag].match(pick("round"), { Circle: () => 0 });
    Shape[Tag].match("Circle", {
      Circle: () => 0,
      // @ts-expect-error the tag never takes this value
      Square: () => 0,
    });
  });

  test("a tag the enum does not declare is rejected", () => {
    // @ts-expect-error not assignable to '"Circle" | "Square"'
    Shape[Tag].match("Triangle", { Triangle: () => 0 });
  });

  test("`_` runs for the tags no other handler names", () => {
    const build = (name: string) =>
      Shape[Tag].match(pick(name), { Circle: () => 0, _: () => "other" });
    expectTypeOf(build).returns.toEqualTypeOf<number | string>();
    expect([build("round"), build("box")]).toEqual([0, "other"]);
  });

  test("so does `[Otherwise]`", () => {
    const build = (name: string) =>
      Shape[Tag].match(pick(name), { Circle: () => 0, [Otherwise]: () => "other" });
    expect([build("round"), build("box")]).toEqual([0, "other"]);
  });

  test("`_` is a type error once every tag the argument can hold has a handler", () => {
    Shape[Tag].match("Circle", {
      Circle: () => 0,
      // @ts-expect-error every variant has a handler, so `_` never runs
      _: () => 0,
    });
  });
});

describe("`seal` seals a payload by its tag", () => {
  type Command = Enum<"Command", { New: { count: number }; Fail: { message: string } }>;
  const Command = Enum.companion<Command>().build();
  type Wire = SealedPayload<Command>;

  test("builds the variant the tag names, and returns the variants' union", () => {
    const parse = (wire: Wire) => Command.seal(wire);
    expectTypeOf(parse).returns.toEqualTypeOf<Command>();
    expect(parse({ _tag: "New", count: 2 })).toEqual(Command.New.create({ count: 2 }));
    expect(parse({ _tag: "Fail", message: "m" })).toEqual(Command.Fail.create({ message: "m" }));
  });

  // TypeScript accepts a union tag wherever each of its values fits, so the payload below would
  // otherwise build a `New` that holds `message`.
  test("a payload holding another variant's field is rejected, as a literal or through a variable", () => {
    const tag: "New" | "Fail" = Math.random() > 0.5 ? "New" : "Fail";
    // @ts-expect-error Types of property '_tag' are incompatible
    Command.seal({ _tag: tag, count: 2, message: "m" });
    // No excess property check reaches an object that is not fresh, even with one tag.
    const held = { _tag: "New" as const, count: 2, message: "m" };
    // @ts-expect-error Types of property 'message' are incompatible
    Command.seal(held);
  });

  test("a field two variants share is not another variant's", () => {
    type Mark = Enum<"Mark", { Pin: { at: number }; Flag: { at: number }; Note: { text: string } }>;
    const Mark = Enum.companion<Mark>().build();
    expect(Mark.seal({ _tag: "Pin", at: 1 })).toEqual(Mark.Pin.create({ at: 1 }));
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

  test("a variant's seal takes the payload a value holds, tag included", () => {
    type Held = { readonly r: number; readonly _tag: "Circle" };
    expectTypeOf<Held>().toExtend<Parameters<typeof Circle.seal>[0]>();
    expectTypeOf<Parameters<typeof Circle.seal>[0]>().toExtend<Held>();
    expect(Circle.seal(Val.unwrap(circle))).toEqual(circle);
    expect(Circle.seal(JSON.parse(JSON.stringify(circle)))).toEqual(circle);
    // @ts-expect-error the tag is part of the payload
    Circle.seal({ r: 1 });
    // @ts-expect-error and it names this variant
    Circle.seal({ r: 1, _tag: "Square" });
  });

  // A seal checks the payload it receives, and rewriting the tag would hide the one that came in.
  test("a seal sees the tag the payload carries, and nothing rewrites it", () => {
    const seen: unknown[] = [];
    const Checked = Enum.companion<Shape>()
      .Circle.implSeal((c: object, seal) => {
        seen.push((c as { _tag?: unknown })._tag);
        return "_tag" in c && c._tag === "Circle"
          ? seal(c as never)
          : new TypeError("not a Circle");
      })
      .build();
    expect(Checked.Circle.seal(JSON.parse('{ "_tag": "Square", "r": 1 }'))).toBeInstanceOf(
      TypeError,
    );
    expect(seen).toEqual(["Square"]);
  });

  // Like a Val's default seal given `any`: the payload is used as it came.
  test("the default seal keeps a tag that a cast or `any` let in", () => {
    const misTagged = Circle.seal(JSON.parse('{ "_tag": "Square", "r": 1 }'));
    expect(misTagged).toEqual({ _tag: "Square", r: 1 });
  });

  test("and `patch` cannot reach it", () => {
    // @ts-expect-error a patch cannot switch variants
    Circle.patch(circle, { _tag: "Square" });
  });

  describe("a name of your own", () => {
    type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
    const Event = Enum.companion<Event>().tag("kind").build();

    test("`.tag()` writes it, and `[Tag].key` returns it, typed as the literal", () => {
      expect(Event.Click.create({ x: 1 })).toEqual({ x: 1, kind: "Click" });
      expectTypeOf(Event[Tag].key).toEqualTypeOf<"kind">();
      expect(Event[Tag].key).toBe("kind");
      expect(Shape[Tag].key).toBe("_tag");
    });

    test("a variant's steps follow `.tag()`", () => {
      const Clicked = Enum.companion<Event>()
        .tag("kind")
        .Click.implSeal((c, seal) => (c.x >= 0 ? seal(c) : new RangeError("x")))
        .build();
      expect(Clicked.Click.create({ x: 1 })).toEqual({ x: 1, kind: "Click" });
      expect(Clicked.seal({ kind: "Click", x: -1 })).toBeInstanceOf(RangeError);
    });

    // Forgotten, misspelled, or called where the default holds: the type answers for all three,
    // which is why there is no `tag-mismatch` lint rule.
    test("the step follows the declaration", () => {
      // @ts-expect-error Property 'build' does not exist: the name comes first
      Enum.companion<Event>().build();
      // @ts-expect-error '"type"' is not assignable to '"kind"'
      Enum.companion<Event>().tag("type").build();
      // @ts-expect-error Property 'tag' does not exist: the default needs no step
      Enum.companion<Shape>().tag("_tag").build();
    });
  });
});

describe("shared fields", () => {
  type Node = Enum<"Node", { Leaf: { value: number }; Branch: { size: number } }, { id: string }>;
  const Node = Enum.companion<Node>().build();

  test("every variant's seal requires them, and the union reads them", () => {
    const leaf = Node.Leaf.create({ id: "l1", value: 1 });
    expect(leaf).toEqual({ id: "l1", value: 1, _tag: "Leaf" });
    const node: Node = leaf;
    expectTypeOf(node.id).toEqualTypeOf<string>();
  });

  test("a shared field may hold a Val, and takes nothing else", () => {
    type Owner = Val<"Owner", { id: string }>;
    const Owner = Val.companion<Owner>().build();
    type Doc = Enum<"Doc", { Draft: { n: number }; Final: { s: string } }, { owner: Owner }>;
    const Doc = Enum.companion<Doc>().build();
    Doc.Draft.create({ n: 1, owner: Owner.seal({ id: "o" }) });
    // @ts-expect-error a record is not an Owner
    Doc.Draft.create({ n: 1, owner: { id: "o" } });
  });
});

describe("members", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  const Money = Enum.companion<Money>()
    .Cash.impl(() => ({ doubled: (c) => c.yen * 2 }))
    .impl(() => ({
      spendable: (m): number =>
        Money.match(m, { Cash: (c) => Money.Cash.doubled(c), Card: (c) => c.limit }),
    }))
    .build();

  test("a member has no `this`, on the union or on a variant", () => {
    Enum.companion<Shape>()
      .Circle.impl(() => ({
        d(c) {
          expectTypeOf(this).toEqualTypeOf<undefined>();
          return c.r * 2;
        },
      }))
      .impl(() => ({
        tag(s) {
          expectTypeOf(this).toEqualTypeOf<undefined>();
          return s._tag;
        },
      }))
      .build();
  });

  test("an implementation has no `this`, on the union or on a variant", () => {
    type Named = Trait<"Named", { id: string }, { label: (self: Self) => string }>;
    const Named = Trait.companion<Named>().build();
    type Coded = Trait<"Coded", { n: number }, { code: (self: Self) => number }>;
    const Coded = Trait.companion<Coded>().build();
    type Card = Enum<
      "Card",
      { A: { n: number } & Coded; B: { s: string } },
      { id: string } & Named
    >;
    Enum.companion<Card>()
      .A.implTrait(Coded, () => ({
        code(a) {
          expectTypeOf(this).toEqualTypeOf<undefined>();
          return a.n;
        },
      }))
      .implTrait(Named, () => ({
        label(c) {
          expectTypeOf(this).toEqualTypeOf<undefined>();
          return c.id;
        },
      }))
      .build();
  });

  test("a step's function receives the union's `seal`, and a variant's `seal` and `patch`", () => {
    type Named = Trait<"Named", { id: string }, { label: (self: Self) => string }>;
    const Named = Trait.companion<Named>().build();
    type Coded = Trait<"Coded", { n: number }, { code: (self: Self) => number }>;
    const Coded = Trait.companion<Coded>().build();
    type Card = Enum<
      "Card",
      { A: { n: number } & Coded; B: { s: string } },
      { id: string } & Named
    >;
    const Card = Enum.companion<Card>()
      .A.impl(({ patch }) => ({ next: (a) => patch(a, { n: a.n + 1 }) }))
      .A.implTrait(Coded, ({ seal }) => ({
        code: (a) => seal({ _tag: "A", id: a.id, n: a.n * 2 }).n,
      }))
      .impl((supplied) => {
        expectTypeOf(supplied).not.toHaveProperty("patch");
        return { again: (c) => supplied.seal(c) };
      })
      .implTrait(Named, ({ seal }) => ({ label: (c) => seal(c).id }))
      .build();
    const a = Card.A.create({ id: "a", n: 1 });
    expect([Card.A.next(a).n, Card.A.code(a), Card.again(a), Card.label(a)]).toEqual([
      2,
      2,
      a,
      "a",
    ]);
  });

  test("a step's function receives `create`, and the gates `PrivateSeal` and `PrivateCreate` hide", () => {
    type Card = Enum<"Card", { A: { n: number }; B: { s: string } }, { id: string }>;
    const Card = Enum.companion<Card, [PrivateSeal, PrivateCreate]>()
      .A.impl(({ seal, create }) => ({
        copy: (a) => create({ id: a.id, n: a.n }),
        next: (a) => seal({ _tag: "A", id: a.id, n: a.n + 1 }),
      }))
      .implCreate((id: string) => ({ _tag: "A", id, n: 0 }))
      .impl(({ seal, create }) => ({ fresh: (c) => create(c.id), again: (c) => seal(c) }))
      .build();
    const a = Enum.companion<Card>().build().A.create({ id: "a", n: 1 });
    expect([Card.A.copy(a), Card.A.next(a), Card.fresh(a), Card.again(a)]).toEqual([
      a,
      { _tag: "A", id: "a", n: 2 },
      { _tag: "A", id: "a", n: 0 },
      a,
    ]);
  });

  test("a variant's member takes that variant, with no annotation", () => {
    expectTypeOf<Parameters<typeof Money.Cash.doubled>>().toEqualTypeOf<
      [self: VariantOf<Money, "Cash">]
    >();
    expect(Money.spendable(Money.Cash.create({ id: "c", yen: 100 }))).toBe(200);
    expect(Money.spendable(Money.Card.create({ id: "d", limit: 5 }))).toBe(5);
  });

  test("a frame is built once, not on every read", () => {
    expect(Money.Cash).toBe(Money.Cash);
  });

  test("a member reaching nothing off the companion needs no annotation", () => {
    const Plain = Enum.companion<Shape>()
      .impl(() => ({ sides: (s) => (s._tag === "Circle" ? 0 : 4) }))
      .build();
    expectTypeOf<Parameters<typeof Plain.sides>>().toEqualTypeOf<[self: Shape]>();
    expectTypeOf<ReturnType<typeof Plain.sides>>().toEqualTypeOf<0 | 4>();
    expect(Plain.sides(Plain.Circle.create({ r: 1 }))).toBe(0);
  });

  test("a union member may not take a variant's name", () => {
    Enum.companion<Shape>()
      // @ts-expect-error a member cannot cover a variant
      .impl(() => ({ Circle: (s: Shape) => s }))
      .build();
  });

  test("nor `match`, nor a name the library reserves", () => {
    Enum.companion<Shape>()
      // @ts-expect-error `match` is the library's
      .impl(() => ({ match: (s: Shape) => s }))
      .build();
    Enum.companion<Shape>()
      // @ts-expect-error `patch` is the library's
      .impl(() => ({ patch: (s: Shape) => s }))
      .build();
  });

  test("a variant's member may not take a name the library reserves", () => {
    Enum.companion<Shape>()
      // @ts-expect-error `seal` is the library's
      .Circle.impl(() => ({ seal: (c: VariantOf<Shape, "Circle">) => c }))
      .build();
  });

  test("a step does not mutate the one before it", () => {
    const before = Enum.companion<Shape>();
    const after = before.Circle.impl(() => ({ diameter: (c) => c.r * 2 })).build();
    expect(Object.hasOwn(after.Circle, "diameter")).toBe(true);
    expect(Object.hasOwn(before.build().Circle, "diameter")).toBe(false);
  });
});

describe("implAssoc", () => {
  describe("on the union", () => {
    test("the function receives the enum's `seal` and `create`", () => {
      const Parsed = Enum.companion<Shape>()
        .implSeal((s, seal) => (s._tag === "Circle" && s.r < 0 ? undefined : seal(s)))
        .implCreate((side: number) => ({ _tag: "Square" as const, side }))
        .implAssoc(({ seal, create }) => ({
          fromRadius: (r: number) => seal({ _tag: "Circle", r }),
          fromSide: (side: number) => create(side),
        }))
        .build();
      expectTypeOf(Parsed.fromRadius(1)).toEqualTypeOf<Shape | undefined>();
      expect([Parsed.fromRadius(-1), Parsed.fromSide(2)]).toEqual([
        undefined,
        { _tag: "Square", side: 2 },
      ]);
    });

    test("a member reaching a variant names the companion and annotates its return", () => {
      const Parsed = Enum.companion<Shape>()
        .implAssoc(() => ({
          parse: (raw: string): Shape =>
            raw.startsWith("c")
              ? Parsed.Circle.create({ r: Number(raw.slice(1)) })
              : Parsed.Square.create({ side: Number(raw.slice(1)) }),
        }))
        .build();
      expect([Parsed.parse("c1"), Parsed.parse("s2")]).toEqual([
        { _tag: "Circle", r: 1 },
        { _tag: "Square", side: 2 },
      ]);
    });

    test("a member takes its first argument first, or last, and one taking none as it is", () => {
      const Scaled = Enum.companion<Shape>()
        .implAssoc(({ seal }) => ({
          circle: (r: number, by: number) => seal({ _tag: "Circle", r: r * by }),
          unit: () => seal({ _tag: "Square", side: 1 }),
        }))
        .build();
      expect([Scaled.circle(1, 2), Scaled.circle(2)(1), Scaled.unit()]).toEqual([
        { _tag: "Circle", r: 2 },
        { _tag: "Circle", r: 2 },
        { _tag: "Square", side: 1 },
      ]);
    });

    test("is written any number of times, before and after `impl` and `implTrait`", () => {
      type Named = Trait<"AssocNamed", { id: string }, { named: (self: Self) => string }>;
      const Named = Trait.companion<Named>().build();
      type Coin = Enum<"AssocCoin", { Heads: { n: number }; Tails: { n: number } }, Named>;
      const Coin = Enum.companion<Coin>()
        .implAssoc(({ seal }) => ({ heads: (id: string) => seal({ _tag: "Heads", id, n: 1 }) }))
        .implTrait(Named, () => ({ named: (c) => c.id }))
        .impl(() => ({ value: (c) => c.n }))
        .implAssoc(() => ({ label: (id: string): string => Coin.named(Coin.heads(id)) }))
        .build();
      expectTypeOf(Coin.heads("a")).toEqualTypeOf<Coin>();
      expect([Coin.label("a"), Coin.value(Coin.heads("a"))]).toEqual(["a", 1]);
    });

    test("closes the variants' steps and the gates", () => {
      const assoc = Enum.companion<Shape>().implAssoc(() => ({ SIDES: 4 }));
      for (const step of ["Circle", "implSeal", "implCreate"] as const)
        expectTypeOf(assoc).not.toHaveProperty(step);
    });

    test("a name is taken once, and a variant's, `match` and the library's are reserved", () => {
      type Named = Trait<"AssocTakenNamed", { id: string }, { named: (self: Self) => string }>;
      const Named = Trait.companion<Named>().build();
      type Coin = Enum<"AssocTakenCoin", { Heads: { n: number }; Tails: { n: number } }, Named>;
      const named = Enum.companion<Coin>().implTrait(Named, () => ({ named: (c) => c.id }));
      // @ts-expect-error this name is already taken
      named.implAssoc(() => ({ named: (id: string) => id }));
      const assoc = Enum.companion<Coin>().implAssoc(() => ({ value: (n: number) => n }));
      // @ts-expect-error this name is already taken
      assoc.implAssoc(() => ({ value: (n: number) => n }));
      // @ts-expect-error this name is already taken
      assoc.impl(() => ({ value: (c: Coin) => c.n }));
      Enum.companion<Coin>()
        .impl(() => ({ value: (c) => c.n }))
        // @ts-expect-error this name is already taken
        .implAssoc(() => ({ value: 1 }));
      // @ts-expect-error a trait the enum declares answers to this name
      Enum.companion<Coin>().implAssoc(() => ({ named: 1 }));
      // @ts-expect-error a member cannot cover a variant
      Enum.companion<Coin>().implAssoc(() => ({ Heads: 1 }));
      // @ts-expect-error `match` is the library's
      Enum.companion<Coin>().implAssoc(() => ({ match: 1 }));
      // @ts-expect-error `seal` is the library's
      Enum.companion<Coin>().implAssoc(() => ({ seal: 1 }));
    });

    test("a member whose arguments can be left out is rejected", () => {
      Enum.companion<Shape>().implAssoc(({ seal }) => ({
        // @ts-expect-error a parameter that can be left out
        circle: (r: number, by?: number) => seal({ _tag: "Circle", r: r * (by ?? 1) }),
      }));
    });
  });

  describe("on a variant", () => {
    test("the function receives the variant's `seal`, `create` and `patch`", () => {
      const Sized = Enum.companion<Shape>()
        .Circle.implSeal((c, seal) => (c.r < 0 ? undefined : seal(c)))
        .Circle.implAssoc(({ seal, create, patch }) => ({
          unit: () => create({ r: 1 }),
          fromRadius: (r: number) => seal({ _tag: "Circle", r }),
          grown: (r: number, c: VariantOf<Shape, "Circle">) => patch(c, { r: c.r + r }),
        }))
        .build();
      const unit = Sized.Circle.unit();
      expectTypeOf(unit).toEqualTypeOf<VariantOf<Shape, "Circle"> | undefined>();
      expect([unit, Sized.Circle.fromRadius(-1), Sized.Circle.grown(circle)(1)]).toEqual([
        { _tag: "Circle", r: 1 },
        undefined,
        { _tag: "Circle", r: 3 },
      ]);
    });

    test("is written any number of times, and closes the variant's gates", () => {
      const twice = Enum.companion<Shape>()
        .Circle.implAssoc(() => ({ PI: 3.14 }))
        .Circle.implAssoc(() => ({ TAU: 6.28 }));
      expectTypeOf(twice.Circle).not.toHaveProperty("implSeal");
      expectTypeOf(twice.Circle).not.toHaveProperty("implCreate");
      const Round = twice.build();
      expect([Round.Circle.PI, Round.Circle.TAU]).toEqual([3.14, 6.28]);
    });

    test("a name is taken once, and the library's are reserved", () => {
      const assoc = Enum.companion<Shape>().Circle.implAssoc(() => ({ unit: 1 }));
      // @ts-expect-error this name is already taken
      assoc.Circle.implAssoc(() => ({ unit: 2 }));
      // @ts-expect-error this name is already taken
      assoc.Circle.impl(() => ({ unit: (c: VariantOf<Shape, "Circle">) => c.r }));
      Enum.companion<Shape>()
        .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
        // @ts-expect-error this name is already taken
        .Circle.implAssoc(() => ({ diameter: 1 }));
      // @ts-expect-error `seal` is the library's
      Enum.companion<Shape>().Circle.implAssoc(() => ({ seal: 1 }));
    });

    test("a trait's member names are held against it, the enum's and the variant's own", () => {
      type Named = Trait<"AssocVariantNamed", { id: string }, { named: (self: Self) => string }>;
      const Named = Trait.companion<Named>().build();
      type Coin = Enum<"AssocVariantCoin", { Heads: { n: number }; Tails: { n: number } }, Named>;
      // @ts-expect-error a trait the enum declares answers to this name
      Enum.companion<Coin>().Heads.implAssoc(() => ({ named: 1 }));
      type Labelled = Trait<
        "AssocLabelled",
        { label: string },
        { labelled: (self: Self) => string }
      >;
      const Labelled = Trait.companion<Labelled>().build();
      type Item = Enum<
        "AssocVariantItem",
        { Book: { pages: number } & Labelled; Pen: { ink: string } }
      >;
      Enum.companion<Item>()
        .Book.implAssoc(() => ({ labelled: 1 }))
        .Book.implTrait(
          // @ts-expect-error another member already answers to one of these names
          Labelled,
          () => ({ labelled: (b: VariantOf<Item, "Book">) => b.label }),
        );
    });

    test("a member whose arguments can be left out is rejected", () => {
      Enum.companion<Shape>().Circle.implAssoc(({ create }) => ({
        // @ts-expect-error a parameter that can be left out
        sized: (r: number, by?: number) => create({ r: r * (by ?? 1) }),
      }));
    });

    test("is the variant's alone", () => {
      const Round = Enum.companion<Shape>()
        .Circle.implAssoc(() => ({ PI: 3.14 }))
        .build();
      expectTypeOf(Round).not.toHaveProperty("PI");
      expectTypeOf(Round.Square).not.toHaveProperty("PI");
      expect([Object.hasOwn(Round, "PI"), Object.hasOwn(Round.Square, "PI")]).toEqual([
        false,
        false,
      ]);
    });
  });
});

describe("patch", () => {
  describe("a nested variant", () => {
    type Holder = Val<"Holder", { id: string; shape: Shape }>;
    const Holder = Val.companion<Holder>().build();
    const holder = Holder.seal({ id: "h", shape: circle });

    test("is replaced whole, never merged", () => {
      expectTypeOf<
        NonNullable<Parameters<typeof Holder.patch>[1]["shape"]>
      >().toEqualTypeOf<Shape>();
      // @ts-expect-error a patch cannot reach into a nested variant
      Holder.patch(holder, { shape: { r: 3 } });
      expect(Holder.patch(holder, { shape: square }).shape).toEqual({ side: 3, _tag: "Square" });
    });

    test("unwraps to the payload of each variant", () => {
      expectTypeOf(Val.unwrap(holder).shape).toEqualTypeOf<
        { r: number; _tag: "Circle" } | { side: number; _tag: "Square" }
      >();
    });
  });
});

describe("recursion", () => {
  type Tree = Enum<"Tree", { Leaf: { value: number }; Branch: { kids: Rec<Tree>[] } }>;
  const Tree = Enum.companion<Tree>()
    .impl(() => ({
      total: (t: Tree): number =>
        Tree.match(t, {
          Leaf: (l) => l.value,
          Branch: (b) => b.kids.reduce((n, kid) => n + Tree.total(kid), 0),
        }),
    }))
    .build();

  test("a variant holds the union it belongs to", () => {
    const leaf = Tree.Leaf.create({ value: 1 });
    const branch = Tree.Branch.create({ kids: [leaf, Tree.Leaf.create({ value: 2 })] });

    expectTypeOf(branch.kids[0]).toEqualTypeOf<Tree | undefined>();
    expect(branch.kids[0]).toBe(leaf);
    expect(Tree.total(Tree.Branch.create({ kids: [branch, leaf] }))).toBe(4);
  });
});

describe("equals", () => {
  test("compares payloads, tag included", () => {
    type Step = Enum<"Step", { Up: { n: number }; Down: { n: number } }>;
    const Step = Enum.companion<Step>().build();
    expect(equals(circle, Circle.create({ r: 2 }))).toBe(true);
    expect(equals<Step>(Step.Up.create({ n: 1 }), Step.Down.create({ n: 1 }))).toBe(false);
  });
});

describe("traits", () => {
  type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;
  const Describable = Trait.companion<Describable>().build();

  type Cmd = Enum<"Cmd", { Add: { n: number }; Del: { at: number } }, { id: string } & Describable>;
  const Cmd = Enum.companion<Cmd>()
    .implTrait(Describable, () => ({
      describe: (c): string =>
        Cmd.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
    }))
    .build();

  const add = Cmd.Add.create({ id: "c1", n: 2 });

  test("the union implements the trait once, and matches inside it", () => {
    expect([Cmd.describe(add), Cmd.describe(Cmd.Del.create({ id: "c2", at: 1 }))]).toEqual([
      "add 2",
      "del 1",
    ]);
  });

  test("its member taking only the value has no form taking it last", () => {
    expectTypeOf(Cmd.describe).toEqualTypeOf<(self: Cmd) => string>();
  });

  test("a variant goes into a box like any other Val", () => {
    type User = Val<"User", { id: string }, Describable>;
    const User = Val.companion<User>()
      .implTrait(Describable, () => ({ describe: (u) => `user ${u.id}` }))
      .build();
    const party: Dyn<Describable>[] = [
      Describable.dyn(Cmd, add),
      Describable.dyn(User, User.seal({ id: "u1" })),
    ];
    expect(party.map((p) => p.describe())).toEqual(["add 2", "user u1"]);
  });

  test("a trait that implements everything itself takes no second argument", () => {
    type Labelled = Trait<"Labelled", { id: string }, { label: (self: Self) => string }>;
    const Labelled = Trait.companion<Labelled>()
      .impl(() => ({ label: (l) => `#${l.id}` }))
      .build();
    type Tick = Enum<"Tick", { Up: { n: number }; Down: { n: number } }, Labelled>;
    const Tick = Enum.companion<Tick>().implTrait(Labelled).build();
    expect(Tick.label(Tick.Up.create({ id: "t1", n: 1 }))).toBe("#t1");
  });

  test("a trait's fields come in without readonly", () => {
    type Tagged = Trait<"Tagged", { tags: string[] }>;
    type Note = Enum<"Note", { A: { n: number }; B: { s: string } }, Tagged>;
    expectTypeOf<PayloadOf<VariantOf<Note, "A">>>().toEqualTypeOf<{
      n: number;
      tags: string[];
      _tag: "A";
    }>();
  });

  test("a shared field that contradicts the trait is rejected", () => {
    type Bad = Enum<"Bad", { A: { n: number }; B: { s: string } }, { id: number } & Describable>;
    // @ts-expect-error no value fits every declaration of `id`
    Enum.companion<Bad>().build();
  });

  test("a trait the enum does not declare is rejected", () => {
    Enum.companion<Shape>()
      // @ts-expect-error the type does not declare this trait
      .implTrait(Describable, () => ({ describe: (_s) => "" }))
      .build();
  });

  describe("a trait that implements nothing of its own", () => {
    type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
    const Wired = Trait.companion<Wired>().build();
    type Row = Enum<"Row", { Head: { n: number }; Body: { s: string } }, { id: string } & Wired>;

    test("is implemented through its companion", () => {
      const Row = Enum.companion<Row>()
        .implTrait(Wired, () => ({
          toWire: (r, sep): string =>
            Row.match(r, {
              Head: (h) => `${h.id}${sep}${h.n}`,
              Body: (b) => `${b.id}${sep}${b.s}`,
            }),
        }))
        .build();
      expect(Row.toWire(Row.Head.create({ id: "r1", n: 2 }), "-")).toBe("r1-2");
    });

    test("cannot be named as a type argument instead", () => {
      const toWire = (r: Row, sep: string) => r.id + sep;
      // @ts-expect-error implTrait takes the trait's companion, not a type argument
      Enum.companion<Row>().implTrait<Wired>({ toWire }).build();
    });

    test("nor be left out, with its members passed alone", () => {
      // `@ts-expect-error` alone would stay green: the call failed before this message existed too.
      // The message is the parameter's type, so passing it fixes the wording.
      const unnamed = "pass the trait's companion, then the members it leaves open";
      Enum.companion<Row>().implTrait(unnamed).build();
      Enum.companion<Row>()
        // @ts-expect-error the members alone do not say which trait they implement
        .implTrait({ toWire: (r: { id: string }) => r.id })
        .build();
    });
  });

  describe("names a member may not take", () => {
    test("one a field of any variant holds", () => {
      type Rad = Trait<"Rad", { id: string }, { r: (self: Self) => number }>;
      type Round = Enum<
        "Round",
        { Circle: { r: number }; Square: { side: number } },
        { id: string } & Rad
      >;
      const Rad = Trait.companion<Rad>().build();
      Enum.companion<Round>()
        // @ts-expect-error a member cannot take the name of a field the payload holds
        .implTrait(Rad, () => ({ r: (c: { id: string }) => c.id.length }))
        .build();
    });

    test("one another trait already answers to", () => {
      type Sized = Trait<"Sized", { id: string }, { size: (self: Self) => number }>;
      const Sized = Trait.companion<Sized>()
        .impl(() => ({ size: (s) => s.id.length }))
        .build();
      type Wide = Trait<"Wide", { id: string }, { size: (self: Self) => number }>;
      const Wide = Trait.companion<Wide>()
        .impl(() => ({ size: (w) => w.id.length * 2 }))
        .build();
      type Both = Enum<
        "Both",
        { A: { n: number }; B: { s: string } },
        { id: string } & Sized & Wide
      >;
      // @ts-expect-error another member already answers to one of these names
      Enum.companion<Both>().implTrait(Sized).implTrait(Wide).build();
    });

    describe("one a trait the enum declares answers to", () => {
      test("on the union", () => {
        Enum.companion<Cmd>()
          .implTrait(Describable, () => ({ describe: (c) => c.id }))
          // @ts-expect-error a trait the enum declares answers to this name
          .impl(() => ({ describe: (c) => c._tag }))
          .build();
        // The message is the parameter type, so passing the literal is what pins the wording.
        Enum.companion<Cmd>()
          .implTrait(Describable, () => ({ describe: (c) => c.id }))
          .impl(() => ({ describe: "a trait the enum declares answers to this name" }))
          .build();
      });

      test("on a variant", () => {
        Enum.companion<Cmd>()
          // @ts-expect-error same, on a variant
          .Add.impl(() => ({ describe: (a) => `${a.n}` }))
          .build();
      });

      test("a name no trait answers to stays open", () => {
        Enum.companion<Cmd>()
          .Add.impl(() => ({ twice: (a) => a.n * 2 }))
          .implTrait(Describable, () => ({ describe: (c) => c.id }))
          .impl(() => ({ kind: (c) => c._tag }))
          .build();
      });
    });

    test("a companion that skipped a Final cannot be implemented", () => {
      type Fixed = Trait<
        "Fixed",
        { id: string },
        { stamp: Final<(self: Self) => string>; note: (self: Self) => string }
      >;
      type Card = Enum<"Card", { A: { n: number }; B: { s: string } }, { id: string } & Fixed>;
      Enum.companion<Card>()
        .implTrait(
          // @ts-expect-error this trait's companion has not implemented every member declared Final
          Trait.companion<Fixed>().build(),
          // Annotated because the first argument is the error: the implementation loses its
          // contextual type along with it. A healthy call needs neither annotation.
          () => ({ note: (c: VariantOf<Card, "A"> | VariantOf<Card, "B">) => c.id }),
        )
        .build();
    });
  });

  describe("a variant's own", () => {
    type Named = Trait<"Named", { label: string }, { named: (self: Self) => string }>;
    const Named = Trait.companion<Named>().build();
    type Item = Enum<"Item", { Book: { pages: number } & Named; Pen: { ink: string } }>;
    const Item = Enum.companion<Item>()
      .Book.implTrait(Named, () => ({ named: (b) => `${b.label}, ${b.pages} pages` }))
      .build();
    const book = Item.Book.create({ label: "Dune", pages: 412 });

    test("is declared in the variant's payload, and brings its fields there alone", () => {
      expectTypeOf<SeedFor<Item, "Book">>().toEqualTypeOf<{
        readonly pages: number;
        readonly label: string;
      }>();
      expectTypeOf<SeedFor<Item, "Pen">>().toEqualTypeOf<{ readonly ink: string }>();
    });

    test("is implemented on the variant, and boxes through its frame", () => {
      expect(Item.Book.named(book)).toBe("Dune, 412 pages");
      expect(Named.dyn(Item.Book, book).named()).toBe("Dune, 412 pages");
    });

    test("is not the union's", () => {
      expectTypeOf(Item).not.toHaveProperty("named");
      // @ts-expect-error the union does not implement it
      Named.dyn(Item, book);
      Enum.companion<Item>()
        // @ts-expect-error a variant declares this trait, so it implements the trait itself
        .implTrait(Named, () => ({ named: (i) => i._tag }))
        .build();
    });

    test("its member may not take the name of a field the variant holds", () => {
      type Paged = Trait<"Paged", Record<never, never>, { pages: (self: Self) => number }>;
      const Paged = Trait.companion<Paged>().build();
      type Shelf = Enum<"Shelf", { Book: { pages: number } & Paged; Pen: { ink: string } }>;
      Enum.companion<Shelf>()
        // @ts-expect-error a member cannot take the name of a field the payload holds
        .Book.implTrait(Paged, () => ({ pages: (b) => b.pages }))
        .build();
    });

    test("it ends the variant's gates, and holds its names against `impl`", () => {
      const traited = Enum.companion<Item>().Book.implTrait(Named, () => ({
        named: (b) => b.label,
      }));
      expectTypeOf(traited.Book).not.toHaveProperty("implSeal");
      expectTypeOf(traited.Book).not.toHaveProperty("implCreate");
      // @ts-expect-error this name is already taken
      traited.Book.impl(() => ({ named: (b) => b.label }));
    });

    test("another variant does not declare it", () => {
      Enum.companion<Item>()
        // @ts-expect-error the type does not declare this trait
        .Pen.implTrait(Named, () => ({ named: (p) => p.ink }))
        .build();
    });

    // Both would hold their own implementation, and `dyn` picks one by the companion it is passed,
    // so `Named.dyn(Shape, c)` and `Named.dyn(Shape.Circle, c)` would disagree.
    test("a trait the enum declares cannot be declared again on a variant", () => {
      type Twice = Enum<"Twice", { A: { n: number } & Named; B: { s: string } }, Named>;
      // @ts-expect-error a variant cannot declare a trait the enum declares
      Enum.companion<Twice>().build();
    });
  });
});

// On the builder and the companion, a variant named after a step or a function is a property of
// that step or function. `.impl(…)` is the step, and `.impl.implSeal(…)` the variant's.
describe("a variant may be named after the library's steps and functions", () => {
  type Cmd = Enum<
    "Cmd",
    {
      tag: { n: number };
      impl: { n: number };
      implAssoc: { n: number };
      build: { n: number };
      seal: { n: number };
      create: { n: number };
      match: { n: number };
      then: { n: number };
    }
  >;
  const Cmd = Enum.companion<Cmd>()
    .impl.implSeal((v, seal) => seal({ ...v, n: v.n + 1 }))
    .tag.impl(() => ({ twice: (c) => c.n * 2 }))
    .build.impl(() => ({ twice: (c) => c.n * 2 }))
    .implAssoc.implAssoc(() => ({ ZERO: 0 }))
    .seal.impl(() => ({ twice: (c) => c.n * 2 }))
    .implCreate(() => ({ _tag: "create" as const, n: 0 }))
    .impl(() => ({ named: (c) => c._tag }))
    .build();

  test("a step's name", () => {
    expect(Cmd.impl.create({ n: 1 })).toEqual({ _tag: "impl", n: 2 });
    expect(Cmd.tag.twice(Cmd.tag.create({ n: 2 }))).toBe(4);
    expect(Cmd.build.twice(Cmd.build.create({ n: 3 }))).toBe(6);
    expect(Cmd.named(Cmd.build.create({ n: 3 }))).toBe("build");
    expect(Cmd.implAssoc.ZERO).toBe(0);
  });

  test("`seal`, `create` and `match`, which stay the enum's when called", () => {
    const sealed = Cmd.seal.create({ n: 1 });
    expect(Cmd.seal({ _tag: "seal", n: 1 })).toEqual(sealed);
    expect(Cmd.seal.twice(sealed)).toBe(2);
    expect(Cmd.create()).toEqual({ _tag: "create", n: 0 });
    expect(Cmd.create.create({ n: 1 })).toEqual({ _tag: "create", n: 1 });
    expect(Cmd.match(Cmd.match.create({ n: 1 }), { match: (m) => m.n, _: () => 0 })).toBe(1);
  });

  // The frame's own property hides the function's own one, which `Object.assign` cannot replace.
  test("a member named after a function's own property is the member", () => {
    type Named = Enum<"Named", { seal: { n: number }; Other: { n: number } }>;
    const Named = Enum.companion<Named>()
      .seal.impl(() => ({ name: (c) => `n${c.n}`, length: (c) => c.n }))
      .build();
    const sealed = Named.seal.create({ n: 3 });
    expect([Named.seal.name(sealed), Named.seal.length(sealed)]).toEqual(["n3", 3]);
  });

  test("`PrivateSeal` removes the enum's `seal` and keeps the variant's frame", () => {
    type Hidden = Enum<"Hidden", { seal: { n: number }; Other: { n: number } }>;
    const Hidden = Enum.companion<Hidden, [PrivateSeal]>().build();
    // @ts-expect-error This expression is not callable
    Hidden.seal({ _tag: "seal", n: 1 });
    expect(Hidden.seal.create({ n: 1 })).toEqual({ _tag: "seal", n: 1 });
  });

  // A frame is not a function, so the companion is not a thenable.
  test("`then`", () => {
    expect(Cmd.then.create({ n: 1 })).toEqual({ _tag: "then", n: 1 });
  });

  test("`_`, which is that variant's handler, with `[Otherwise]` handling the rest", () => {
    type Wild = Enum<"Wild", { _: { n: number }; A: { n: number }; B: { n: number } }>;
    const Wild = Enum.companion<Wild>().build();
    const read = (w: Wild) =>
      Wild.match(w, {
        _: (u) => {
          expectTypeOf(u).toEqualTypeOf<VariantOf<Wild, "_">>();
          return "_";
        },
        [Otherwise]: (rest) => rest._tag,
      });
    expect([read(Wild._.create({ n: 1 })), read(Wild.A.create({ n: 1 }))]).toEqual(["_", "A"]);
    const byTag = (tag: "_" | "A") =>
      Wild[Tag].match(tag, { _: () => "_", [Otherwise]: () => "rest" });
    expect([byTag("_"), byTag("A")]).toEqual(["_", "rest"]);
    // @ts-expect-error Property 'A' is missing
    Wild.match(Wild.A.create({ n: 1 }), { _: () => 0 });
  });

  test("any string the library once kept", () => {
    type Kept = Enum<"Kept", { __valof_traits: { n: number }; Other: { n: number } }>;
    const Kept = Enum.companion<Kept>().build();
    expect(Kept.__valof_traits.create({ n: 1 })).toEqual({ _tag: "__valof_traits", n: 1 });
  });
});

// Each check goes on the companion. A broken declaration stops satisfying the constraint, and the
// companion is the line the user writes.
describe("a broken declaration", () => {
  // The member would replace the variant or `match` at run time, under the library's type.
  test("a trait member may not take a variant's name, nor `match`", () => {
    type Sq = Trait<"Sq", Record<never, never>, { Square: (self: Self) => string }>;
    type Sized = Trait<"Sized", Record<never, never>, { size: (self: Self) => number }>;
    type Boxy = Enum<"Boxy", { Circle: { r: number }; Square: { side: number } }, Sq & Sized>;
    // @ts-expect-error a trait member cannot take a variant's name
    Enum.companion<Boxy>().build();

    type Matcher = Trait<"Matcher", Record<never, never>, { match: (self: Self) => string }>;
    type Coin = Enum<"Coin", { Heads: { n: number }; Tails: { n: number } }, Matcher>;
    // @ts-expect-error a trait member cannot take the name `match`
    Enum.companion<Coin>().build();
  });

  // An indexed access over a single key hands back the variant itself, and the alias goes with
  // the union: a consumer's `.d.ts` then expands onto the private phantoms and fails with TS4094.
  test("an enum needs at least two variants", () => {
    type Lonely = Enum<"Lonely", { Only: { n: number } }>;
    // @ts-expect-error an enum needs at least two variants; one is a Val
    Enum.companion<Lonely>().build();

    // With no variants at all the indexed access is `never`, and there is no value to build.
    expectTypeOf<Enum<"Empty", Record<never, never>>>().toEqualTypeOf<never>();
  });

  test("a variant's payload must be a record of fields", () => {
    // `@ts-expect-error` alone would stay green, since `AnyEnum` rejects any fault. Intersecting
    // with it reads the fault back out of the name.
    const fault = { __valError: "a variant's payload must be a record of fields" } as const;
    type Primitive = Enum<"Primitive", { One: number; Two: { n: number } }>;
    // @ts-expect-error a variant's payload must be a record of fields
    Enum.companion<Primitive>().build();
    expectTypeOf<NameOf<Primitive & AnyEnum>>().toEqualTypeOf<typeof fault & string>();

    type Listed = Enum<"Listed", { Many: readonly string[]; Other: { n: number } }>;
    // @ts-expect-error same, for an array
    Enum.companion<Listed>().build();
    expectTypeOf<NameOf<Listed & AnyEnum>>().toEqualTypeOf<typeof fault & string>();
  });

  test("the tag may not take a name a payload or a shared field holds", () => {
    type Clash = Enum<"Clash", { One: { _tag: string }; Two: { n: number } }>;
    // @ts-expect-error the tag cannot take the name of a field the payload holds
    Enum.companion<Clash>().build();

    type SharedClash = Enum<
      "SharedClash",
      { One: { n: number }; Two: { n: number } },
      { _tag: string }
    >;
    // @ts-expect-error the tag cannot take the name of a shared field
    Enum.companion<SharedClash>().build();
  });

  test("a variant takes no companion of its own, and neither does the union", () => {
    // @ts-expect-error a variant is built by its enum's companion
    Val.companion<VariantOf<Shape, "Circle">>().build();
    // @ts-expect-error same, for the union
    Val.companion<Shape>().build();
  });
});

describe("a variant's seal", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  const Money = Enum.companion<Money>()
    .Cash.implSeal((p, seal) => {
      expectTypeOf(p._tag).toEqualTypeOf<"Cash">();
      expectTypeOf(seal).returns.toEqualTypeOf<VariantOf<Money, "Cash">>();
      return p.yen > 0 ? seal(p) : new RangeError("yen must be positive");
    })
    .Cash.impl(() => ({ doubled: (c) => c.yen * 2 }))
    .build();

  test("takes the payload with its tag, and its return propagates", () => {
    const cash = Money.Cash.seal({ id: "m1", yen: 100, _tag: "Cash" });
    expectTypeOf(cash).toEqualTypeOf<VariantOf<Money, "Cash"> | RangeError>();
    expect(cash).toEqual({ id: "m1", yen: 100, _tag: "Cash" });
    expect(Money.Cash.seal({ id: "m1", yen: 0, _tag: "Cash" })).toBeInstanceOf(RangeError);
  });

  test("`seal` on the enum runs the seal of the variant the tag names", () => {
    const sealed = Money.seal({ id: "m1", yen: 1, _tag: "Cash" });
    expectTypeOf(sealed).toEqualTypeOf<
      VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError
    >();
    expect(sealed).toEqual({ id: "m1", yen: 1, _tag: "Cash" });
    expect(Money.seal({ id: "m1", yen: 0, _tag: "Cash" })).toBeInstanceOf(RangeError);
  });

  test("what it passes on is what the value holds", () => {
    const Rounded = Enum.companion<Shape>()
      .Circle.implSeal((c, seal) => seal({ ...c, r: Math.abs(c.r) }))
      .build();
    expect(Rounded.Circle.create({ r: -2 })).toEqual({ r: 2, _tag: "Circle" });
  });

  test("a variant that wrote none keeps the default seal", () => {
    const card = Money.Card.seal({ id: "m2", limit: 5, _tag: "Card" });
    expectTypeOf(card).toEqualTypeOf<VariantOf<Money, "Card">>();
    expect(card).toEqual({ id: "m2", limit: 5, _tag: "Card" });
  });

  test("`patch` derives through the same seal, and an empty one keeps the value", () => {
    const cash = Money.Cash.create({ id: "m1", yen: 100 }) as VariantOf<Money, "Cash">;
    expect(Money.Cash.patch(cash, { yen: 5 })).toEqual({ id: "m1", yen: 5, _tag: "Cash" });
    expect(Money.Cash.patch(cash, { yen: -1 })).toBeInstanceOf(RangeError);
    expect(Money.Cash.patch(cash, { yen: 100 })).toBe(cash);
  });

  test("a seal whose return can be awaited is rejected", () => {
    Enum.companion<Money>()
      // @ts-expect-error a seal is synchronous
      .Cash.implSeal(async (p, seal) => seal(p))
      .build();
  });

  test("a seal whose parameter also accepts a string is rejected", () => {
    Enum.companion<Money>()
      // @ts-expect-error a seal takes the payload, not a wire format
      .Cash.implSeal((p: unknown, seal) => seal(p as never))
      .build();
  });

  test("a variant's member reaching the enum names the companion and annotates its return", () => {
    const Twinned = Enum.companion<Shape>()
      .Circle.impl(() => ({ twin: (c): Shape => Twinned.Square.create({ side: c.r }) }))
      .build();
    expect(Twinned.Circle.twin(circle)).toEqual({ side: 2, _tag: "Square" });
  });
});

describe("the enum's seal", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  type Wire = SealedPayload<Money>;
  const ran: string[] = [];
  // Stands in for a schema library's discriminated union.
  const known = (input: object): input is Wire =>
    "_tag" in input && (input._tag === "Cash" || input._tag === "Card");
  const Money = Enum.companion<Money>()
    .Cash.implSeal((c, seal) => {
      ran.push("Cash");
      return c.yen > 0 ? seal(c) : new RangeError("yen must be positive");
    })
    .implSeal((input: object, seal) => {
      ran.push("enum");
      expectTypeOf(seal).returns.toEqualTypeOf<
        VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError
      >();
      return known(input) ? seal(input) : new TypeError("no such variant");
    })
    .implCreate((yen: number) => ({ _tag: "Cash" as const, id: "m", yen }))
    .build();

  test("runs in `seal` before the tag selects a variant, so it can reject the tag", () => {
    ran.length = 0;
    expect(Money.seal({ _tag: "Bogus", id: "m" })).toBeInstanceOf(TypeError);
    expect(Money.seal({ _tag: "Cash", id: "m", yen: 1 })).toEqual({
      id: "m",
      yen: 1,
      _tag: "Cash",
    });
    expect(ran).toEqual(["enum", "enum", "Cash"]);
  });

  test("takes what its parameter takes, and returns what it returns", () => {
    expectTypeOf(Money.seal).parameters.toEqualTypeOf<[input: object]>();
    expectTypeOf(Money.seal).returns.toEqualTypeOf<
      VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError | TypeError
    >();
  });

  test("a variant's own gates do not pass through it", () => {
    ran.length = 0;
    const cash = Money.Cash.create({ id: "m", yen: 1 }) as VariantOf<Money, "Cash">;
    Money.Cash.patch(cash, { yen: 2 });
    expect(ran).toEqual(["Cash", "Cash"]);
  });

  test("`implCreate` registers `create`, whose payload passes the enum's seal", () => {
    ran.length = 0;
    const created = Money.create(5);
    expectTypeOf(created).toEqualTypeOf<
      VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError | TypeError
    >();
    expect(created).toEqual({ id: "m", yen: 5, _tag: "Cash" });
    expect(Money.create(0)).toBeInstanceOf(RangeError);
    expect(ran).toEqual(["enum", "Cash", "enum", "Cash"]);
  });

  test("without the enum's `implSeal`, `create` returns what the variants' seals return", () => {
    const Unchecked = Enum.companion<Money>()
      .Cash.implSeal((c, seal) => (c.yen > 0 ? seal(c) : new RangeError("yen must be positive")))
      .implCreate((yen: number) => ({ _tag: "Cash" as const, id: "m", yen }))
      .build();
    expectTypeOf(Unchecked.create(0)).toEqualTypeOf<
      VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError
    >();
    expect(Unchecked.create(0)).toBeInstanceOf(RangeError);
  });

  test("without `implCreate`, `create` is absent", () => {
    expectTypeOf(Shape).not.toHaveProperty("create");
    expect("create" in Shape).toBe(false);
  });

  test("its parameter may not accept a string, and it is synchronous", () => {
    Enum.companion<Money>()
      // @ts-expect-error a seal takes the payload, not a wire format
      .implSeal((input: unknown, seal) => seal(input as Wire))
      .build();
    Enum.companion<Money>()
      // @ts-expect-error a seal is synchronous
      .implSeal(async (input, seal) => seal(input))
      .build();
  });

  describe("`implCreate.noseal`", () => {
    const message = /payload from `\.implCreate\.noseal`/;
    const card = () => ({ _tag: "Card" as const, id: "c", limit: 1 });

    test("returns the variant its payload's tag names, sealed rather than as created", () => {
      const created = card();
      const Carded = Enum.companion<Money>()
        .implCreate.noseal(() => created)
        .build();
      expectTypeOf(Carded.create()).toEqualTypeOf<VariantOf<Money, "Card">>();
      expect(Carded.create()).toEqual({ id: "c", limit: 1, _tag: "Card" });
      expect(Carded.create()).not.toBe(created);
    });

    test("is the step `implCreate` is, once and after the seal", () => {
      const created = Enum.companion<Money>().implCreate.noseal(card);
      expectTypeOf(created).not.toHaveProperty("implCreate");
      expectTypeOf(created.implSeal)
        .parameter(0)
        .toEqualTypeOf<"write `implSeal` before `implCreate`">();
    });

    test("runs every seal in development, and throws where one rejects or changes the payload", () => {
      const byEnum = Enum.companion<Money>()
        .implSeal((input, seal) =>
          input._tag === "Card" ? new TypeError("no cards") : seal(input),
        )
        .implCreate.noseal(card)
        .build();
      const byVariant = Enum.companion<Money>()
        .Card.implSeal((c, seal) => seal({ ...c, limit: c.limit * 2 }))
        .implCreate.noseal(card)
        .build();
      const changedByEnum = Enum.companion<Money>()
        .implSeal((input, seal) => seal(input._tag === "Card" ? { ...input, limit: 2 } : input))
        .implCreate.noseal(card)
        .build();
      expect(() => byEnum.create()).toThrow(message);
      expect(() => byVariant.create()).toThrow(message);
      expect(() => changedByEnum.create()).toThrow(message);
    });

    test("a seal building another value on the way does not count as the payload's", () => {
      const Nested = Enum.companion<Money>()
        .Card.implSeal((c, seal) => {
          Money.Cash.create({ id: "other", yen: 1 });
          return seal(c);
        })
        .implCreate.noseal(card)
        .build();
      expect(Nested.create()).toEqual({ id: "c", limit: 1, _tag: "Card" });
    });

    test("a seal that throws leaves the next value unwatched", () => {
      // Throws before a variant's seal takes the watcher.
      const Throwing = Enum.companion<Money>()
        .implSeal((_input, seal) => seal(null as never))
        .implCreate.noseal(card)
        .build();
      expect(() => Throwing.create()).toThrow(/null/);
      expect(Money.Cash.create({ id: "x", yen: 1 })).toEqual({ id: "x", yen: 1, _tag: "Cash" });
    });

    test("takes no arguments, and returns a tagged payload", () => {
      Enum.companion<Money>()
        // @ts-expect-error `.implCreate.noseal` takes a function with no arguments
        .implCreate.noseal((limit: number) => ({ _tag: "Card" as const, id: "c", limit }))
        .build();
      Enum.companion<Money>()
        // @ts-expect-error the tag says which variant
        .implCreate.noseal(() => ({ id: "c", limit: 1 }))
        .build();
    });
  });

  test("`create` returns a tagged payload of one variant", () => {
    Enum.companion<Money>()
      // @ts-expect-error the tag says which variant
      .implCreate((yen: number) => ({ id: "m", yen }))
      .build();
  });

  test("`implSeal` comes before `implCreate`, each once", () => {
    Enum.companion<Money>()
      .implCreate((yen: number) => ({ _tag: "Cash" as const, id: "m", yen }))
      // @ts-expect-error write `implSeal` before `implCreate`
      .implSeal((input, seal) => seal(input))
      .build();
    const sealed = Enum.companion<Money>().implSeal((input, seal) => seal(input));
    const created = sealed.implCreate((yen: number) => ({ _tag: "Cash" as const, id: "m", yen }));
    expectTypeOf(sealed).not.toHaveProperty("implSeal");
    expectTypeOf(created).not.toHaveProperty("implCreate");
  });
});

describe("a variant's create", () => {
  type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
  const Task = Enum.companion<Task>()
    .Todo.implSeal((t, seal) => (t.text ? seal(t) : new RangeError("text must not be empty")))
    .Todo.implCreate((text: string) => ({ id: `t-${text}`, text }))
    .Done.implCreate.noseal(() => ({ id: "d", at: 0 }))
    .build();

  test("exists once `implCreate` registers one, and returns through the seal", () => {
    const todo = Task.Todo.create("write");
    expectTypeOf(todo).toEqualTypeOf<VariantOf<Task, "Todo"> | RangeError>();
    expect(todo).toEqual({ id: "t-write", text: "write", _tag: "Todo" });
    expect(Task.Todo.create("")).toBeInstanceOf(RangeError);
  });

  test("`noseal` returns the variant", () => {
    expectTypeOf(Task.Done.create()).toEqualTypeOf<VariantOf<Task, "Done">>();
    expect(Task.Done.create()).toEqual({ id: "d", at: 0, _tag: "Done" });
  });

  test("`noseal` runs the seal in development, and throws where it rejects the payload", () => {
    const Checked = Enum.companion<Task>()
      .Done.implSeal((d, seal) => (d.at > 0 ? seal(d) : new RangeError("at must be positive")))
      .Done.implCreate.noseal(() => ({ id: "d", at: 0 }))
      .build();
    expect(() => Checked.Done.create()).toThrow(/payload from `\.implCreate\.noseal`/);
  });

  test("its function returns the variant's payload, and `noseal`'s takes no arguments", () => {
    Enum.companion<Task>()
      // @ts-expect-error `id` is missing
      .Todo.implCreate((text: string) => ({ text }))
      .build();
    Enum.companion<Task>()
      // @ts-expect-error `.implCreate.noseal` takes a function with no arguments
      .Done.implCreate.noseal((at: number) => ({ id: "d", at }))
      .build();
  });

  test("without `implCreate`, writes the tag and passes the payload to the seal", () => {
    const Plain = Enum.companion<Task>()
      .Todo.implSeal((t, seal) => (t.text ? seal(t) : new RangeError("text must not be empty")))
      .build();
    expectTypeOf(Plain.Todo.create).returns.toEqualTypeOf<VariantOf<Task, "Todo"> | RangeError>();
    expect(Plain.Todo.create({ id: "t", text: "" })).toBeInstanceOf(RangeError);
    expect(Plain.Todo.create({ id: "t", text: "x" })).toEqual({ id: "t", text: "x", _tag: "Todo" });
  });

  test("comes after the seal, once", () => {
    const created = Enum.companion<Task>().Todo.implCreate((text: string) => ({ id: "t", text }));
    // @ts-expect-error write `implSeal` before `implCreate`
    created.Todo.implSeal((t, seal) => seal(t));
    expectTypeOf(created.Todo).not.toHaveProperty("implCreate");
  });
});

describe("the companion's options", () => {
  type Order = Enum<
    "Order",
    { Pending: { note: string }; Shipped: { note: string; shippedAt: number } },
    { id: string }
  >;

  test("`PrivateSeal` takes `seal` off the enum and every variant", () => {
    const Order = Enum.companion<Order, [PrivateSeal]>()
      .Pending.implCreate((note: string) => ({ id: "o", note }))
      .implCreate(() => ({ _tag: "Pending" as const, id: "p", note: "" }))
      .build();
    expect(Order.create()).toEqual({ id: "p", note: "", _tag: "Pending" });
    expectTypeOf(Order).not.toHaveProperty("seal");
    expectTypeOf(Order.Pending).not.toHaveProperty("seal");
    expectTypeOf(Order.Shipped).not.toHaveProperty("seal");
    expect(Order.Pending.create("n")).toEqual({ id: "o", note: "n", _tag: "Pending" });
    // `PrivateSeal` hides the seal alone: the default `create` mints the tag, and generates nothing
    // else a caller could forge.
    expect(Order.Shipped.create({ id: "s", note: "n", shippedAt: 1 })).toMatchObject({
      _tag: "Shipped",
    });
  });

  test("`PrivateCreate` takes `create` off the enum and every variant, the default or registered", () => {
    const Order = Enum.companion<Order, [PrivateCreate]>()
      .Pending.implCreate((note: string) => ({ id: "o", note }))
      .implCreate(() => ({ _tag: "Pending" as const, id: "p", note: "" }))
      .build();
    expectTypeOf(Order).not.toHaveProperty("create");
    expectTypeOf(Order.Pending).not.toHaveProperty("create");
    expectTypeOf(Order.Shipped).not.toHaveProperty("create");
    expect(Order.Shipped.seal({ _tag: "Shipped", id: "s", note: "n", shippedAt: 1 })).toMatchObject(
      { _tag: "Shipped" },
    );
  });

  test("`VariantOptions` takes `create` off one variant", () => {
    const Order = Enum.companion<Order, [VariantOptions<"Shipped", [PrivateCreate]>]>().build();
    expectTypeOf(Order.Shipped).not.toHaveProperty("create");
    expect(Order.Pending.create({ id: "o", note: "n" })).toMatchObject({ _tag: "Pending" });
  });

  test("`Unpatchable` takes a key off every variant that holds it", () => {
    const Order = Enum.companion<Order, [Unpatchable<"id" | "shippedAt">]>().build();
    const shipped = Order.Shipped.create({ id: "o", note: "n", shippedAt: 1 });
    // @ts-expect-error `id` is unpatchable
    Order.Pending.patch(Order.Pending.create({ id: "o", note: "n" }), { id: "x" });
    // @ts-expect-error same, for a key one variant holds
    Order.Shipped.patch(shipped, { shippedAt: 2 });
    expect(Order.Shipped.patch(shipped, { note: "m" })).toEqual({
      id: "o",
      note: "m",
      shippedAt: 1,
      _tag: "Shipped",
    });
  });

  test("`VariantOptions` takes a key off one variant, on top of the enum's", () => {
    const Order = Enum.companion<
      Order,
      [Unpatchable<"id">, VariantOptions<"Shipped", [Unpatchable<"note">]>]
    >().build();
    const pending = Order.Pending.create({ id: "o", note: "n" });
    const shipped = Order.Shipped.create({ id: "o", note: "n", shippedAt: 1 });
    expect(Order.Pending.patch(pending, { note: "m" })).toEqual({
      id: "o",
      note: "m",
      _tag: "Pending",
    });
    // @ts-expect-error `note` is unpatchable on `Shipped`
    Order.Shipped.patch(shipped, { note: "m" });
    // @ts-expect-error and `id` on every variant
    Order.Shipped.patch(shipped, { id: "x" });
  });

  test("a key no variant holds, a variant the enum lacks, and `PrivateSeal` per variant are rejected", () => {
    // @ts-expect-error no variant holds `idd`
    Enum.companion<Order, [Unpatchable<"idd">]>();
    // @ts-expect-error the enum has no `Shiped`
    Enum.companion<Order, [VariantOptions<"Shiped", [Unpatchable<"note">]>]>();
    // @ts-expect-error `Pending` holds no `shippedAt`
    Enum.companion<Order, [VariantOptions<"Pending", [Unpatchable<"shippedAt">]>]>();
    // @ts-expect-error `Order.seal` reaches every variant, so only the enum hides it
    Enum.companion<Order, [VariantOptions<"Pending", [PrivateSeal]>]>();
  });
});

describe("build", () => {
  test("closes the chain: the companion has no step left", () => {
    // Type alone: the proxy reads any other key as a variant.
    for (const step of ["impl", "implTrait", "implAssoc", "build"] as const)
      expectTypeOf(Shape).not.toHaveProperty(step);
    expectTypeOf(Shape.Square).not.toHaveProperty("implSeal");
    expectTypeOf(Shape.Circle).not.toHaveProperty("impl");
    expectTypeOf(Shape.Circle).not.toHaveProperty("implAssoc");
  });

  test("a builder holds the steps alone", () => {
    const varied = Enum.companion<Shape>().Circle.impl(() => ({ diameter: (c) => c.r * 2 }));
    const builder = varied.impl(() => ({ sides: (s) => (s._tag === "Circle" ? 0 : 4) }));
    expectTypeOf(varied.Circle).not.toHaveProperty("diameter");
    expectTypeOf(builder).not.toHaveProperty("sides");
    for (const name of ["sides", "seal", "match", Tag]) expect(name in builder).toBe(false);
  });

  test("a builder used as the companion says to call `.build()`", () => {
    const builder = Enum.companion<Shape>();
    expectTypeOf(builder.seal).toEqualTypeOf<CallBuildFirst>();
    expectTypeOf(builder.match).toEqualTypeOf<CallBuildFirst>();
    expectTypeOf(builder.Circle.seal).toEqualTypeOf<CallBuildFirst>();
    expectTypeOf(builder.Circle.patch).toEqualTypeOf<CallBuildFirst>();
  });

  describe("a step keeps what the steps before it registered", () => {
    type Named = Trait<"Named", { id: string }, { named: (self: Self) => string }>;
    const Named = Trait.companion<Named>().build();
    type Coin = Enum<"Coin", { Heads: { n: number }; Tails: { n: number } }, Named>;

    test("`impl` and `implTrait` take the enum's gates off", () => {
      const implemented = Enum.companion<Coin>().impl(() => ({ double: (c) => c.n * 2 }));
      const traited = Enum.companion<Coin>().implTrait(Named, () => ({ named: (c) => c.id }));
      for (const gate of ["implSeal", "implCreate"] as const) {
        expectTypeOf(implemented).not.toHaveProperty(gate);
        expectTypeOf(traited).not.toHaveProperty(gate);
      }
    });

    test("the enum's seal and `create`, through `impl` and `implTrait`", () => {
      const gated = Enum.companion<Coin>()
        .implSeal((input: object, seal) =>
          "_tag" in input && input._tag === "Heads" ? seal(input as never) : new TypeError("tag"),
        )
        .implCreate(() => ({ _tag: "Tails" as const, id: "t", n: 0 }));
      const members = gated.impl(() => ({ double: (c) => c.n * 2 })).build();
      const traits = gated.implTrait(Named, () => ({ named: (c) => c.id })).build();
      for (const Coin of [members, traits]) {
        expect(Coin.seal({ _tag: "Bogus" })).toBeInstanceOf(TypeError);
        expect(Coin.create()).toBeInstanceOf(TypeError);
      }
    });

    test("a variant's seal, through another variant's step", () => {
      const Coin = Enum.companion<Coin>()
        .Heads.implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id must not be empty")))
        .Tails.impl(() => ({ flipped: (t) => t.n }))
        .build();
      expect(Coin.Heads.create({ id: "", n: 1 })).toBeInstanceOf(RangeError);
    });

    test("a trait, through a second `implTrait`, on the union and on a variant", () => {
      type Counted = Trait<"Counted", { n: number }, { counted: (self: Self) => number }>;
      const Counted = Trait.companion<Counted>().build();
      type Both = Enum<"Both", { One: { n: number }; Two: { n: number } }, Named & Counted>;
      const Both = Enum.companion<Both>()
        .implTrait(Named, () => ({ named: (b) => b.id }))
        .implTrait(Counted, () => ({ counted: (b) => b.n }))
        .build();
      const one = Both.One.create({ id: "o", n: 1 });
      expect([Named.dyn(Both, one).named(), Counted.dyn(Both, one).counted()]).toEqual(["o", 1]);

      type Each = Enum<"Each", { One: { n: number } & Named & Counted; Two: { s: string } }>;
      const Each = Enum.companion<Each>()
        .One.implTrait(Named, () => ({ named: (o) => o.id }))
        .One.implTrait(Counted, () => ({ counted: (o) => o.n }))
        .build();
      const each = Each.One.create({ id: "e", n: 2 });
      expect([Named.dyn(Each.One, each).named(), Counted.dyn(Each.One, each).counted()]).toEqual([
        "e",
        2,
      ]);
    });

    test("the members, through the union's and a variant's", () => {
      const Coin = Enum.companion<Coin>()
        .Heads.impl(() => ({ heads: (h) => h.n }))
        .implTrait(Named, () => ({ named: (c) => c.id }))
        .impl(() => ({ double: (c) => c.n * 2 }))
        .build();
      const heads = Coin.Heads.create({ id: "h", n: 2 });
      expect([Coin.named(heads), Coin.double(heads), Coin.Heads.heads(heads)]).toEqual(["h", 4, 2]);
      expect(Named.dyn(Coin, heads).named()).toBe("h");
    });
  });

  test("a union member may take a step's name", () => {
    const Stepped = Enum.companion<Shape>()
      .impl(() => ({ impl: (s) => s._tag, build: (s) => s._tag }))
      .build();
    expect([Stepped.impl(circle), Stepped.build(square)]).toEqual(["Circle", "Square"]);
  });
});

describe("the order of the steps", () => {
  // The enum's seal hands the payload to the variants' seals, so its type follows theirs.
  test("the variants' steps come first, and an enum's step takes them off", () => {
    const unioned = Enum.companion<Shape>().impl(() => ({
      sides: (s) => (s._tag === "Circle" ? 0 : 4),
    }));
    const sealed = Enum.companion<Shape>().implSeal((s, seal) => seal(s));
    expectTypeOf(unioned).not.toHaveProperty("Circle");
    expectTypeOf(sealed).not.toHaveProperty("Square");
  });

  test("`impl` is written once, and `implTrait` may follow it", () => {
    type Labelled = Trait<"Labelled", { at: number }, { label: (self: Self) => string }>;
    const Labelled = Trait.companion<Labelled>().build();
    type Tile = Enum<"Tile", { Floor: { at: number }; Wall: { at: number } }, Labelled>;
    const implemented = Enum.companion<Tile>()
      .Wall.impl(() => ({ solid: (_w) => true }))
      .impl(() => ({ at: (t) => t.at }));
    const Tile = implemented
      .implTrait(Labelled, () => ({ label: (t) => `${t._tag} ${t.at}` }))
      .build();
    const wall = Tile.Wall.create({ at: 2 });

    expectTypeOf(implemented).not.toHaveProperty("impl");
    expect([Tile.at(wall), Tile.Wall.solid(wall), Tile.label(wall)]).toEqual([2, true, "Wall 2"]);
  });

  test("a variant's steps follow `Val`'s order, each once", () => {
    const sealed = Enum.companion<Shape>().Circle.implSeal((c, seal) => seal(c));
    expectTypeOf(sealed.Circle).not.toHaveProperty("implSeal");
    const implemented = sealed.Circle.impl(() => ({ diameter: (c) => c.r * 2 }));
    expectTypeOf(implemented.Circle).not.toHaveProperty("impl");
    expectTypeOf(implemented.Circle).not.toHaveProperty("implCreate");
    // Another variant's steps stay open.
    expectTypeOf(implemented.Square).toHaveProperty("implSeal");
  });

  test("`impl` takes the members: `.build()` closes the chain, not `.impl()`", () => {
    // Never called: the empty call would throw before the type is the point.
    const bare = () => {
      // @ts-expect-error Expected 1 arguments, but got 0
      Enum.companion<Shape>().impl().build();
      // @ts-expect-error the same for a variant
      Enum.companion<Shape>().Circle.impl().build();
    };
    expectTypeOf(bare).toBeFunction();
  });

  test("a member calling a sibling names the companion and annotates its return", () => {
    const Sized = Enum.companion<Shape>()
      .impl(() => ({
        area: (s): number =>
          Sized.match(s, { Circle: (c) => c.r * c.r * 3, Square: (q) => q.side ** 2 }),
        twice: (s): number => Sized.area(s) * 2,
      }))
      .build();

    expect(Sized.twice(Sized.Square.create({ side: 3 }))).toBe(18);
  });
});

describe("data-first and data-last", () => {
  const pipe = <A, B>(a: A, f: (a: A) => B): B => f(a);
  const Sized = Enum.companion<Shape>()
    .Circle.impl(() => ({ grown: (c, by: number) => c.r + by }))
    .impl(() => ({ sides: (s, round: number) => (s._tag === "Circle" ? round : 4) }))
    .build();

  test("a union member takes the value first, or last", () => {
    expectTypeOf(Sized.sides(0)).toEqualTypeOf<(self: Shape) => number>();
    expect([Sized.sides(circle, 7), Sized.sides(7)(circle)]).toEqual([7, 7]);
  });

  test("so do a variant's member and `patch`", () => {
    type Circle = VariantOf<Shape, "Circle">;
    expectTypeOf(Sized.Circle.grown(1)).toEqualTypeOf<(self: Circle) => number>();
    expectTypeOf(Sized.Circle.patch({ r: 5 })).toEqualTypeOf<(self: Circle) => Circle>();
    expect([Sized.Circle.grown(1)(circle), Sized.Circle.patch({ r: 5 })(circle)]).toEqual([
      3,
      { r: 5, _tag: "Circle" },
    ]);
  });

  test("`match` takes the handlers alone, narrowing each one and exhaustive", () => {
    const side = pipe(
      square as Shape,
      Shape.match({
        Circle: (c) => {
          expectTypeOf(c).toEqualTypeOf<VariantOf<Shape, "Circle">>();
          return c.r;
        },
        Square: (s) => s.side,
      }),
    );
    expectTypeOf(side).toEqualTypeOf<number>();
    expect(side).toBe(3);
    // @ts-expect-error Property 'Square' is missing
    Shape.match({ Circle: (c) => c.r });
    Shape.match({
      Circle: (c) => c.r,
      Square: (s) => s.side,
      // @ts-expect-error this enum has no such variant
      Triangle: () => 0,
    });
    const size = Shape.match({ Circle: (c) => c.r, _: (rest) => `${rest.side}` });
    expectTypeOf(size).toEqualTypeOf<(value: Shape) => number | string>();
    expect([size(circle), size(square)]).toEqual([2, "3"]);
  });

  test("so does `[Tag].match`", () => {
    const sides = Shape[Tag].match({ Circle: () => 0, Square: () => 4 });
    expectTypeOf(sides).toEqualTypeOf<(tag: "Circle" | "Square") => number>();
    expect(sides("Square")).toBe(4);
    Shape[Tag].match({
      Circle: () => 0,
      Square: () => 4,
      // @ts-expect-error the enum has no such variant
      Triangle: () => 3,
    });
    const round = Shape[Tag].match({ Circle: () => 0, _: () => "no" });
    expectTypeOf(round).toEqualTypeOf<(tag: "Circle" | "Square") => number | string>();
    expect(round("Square")).toBe("no");
  });

  test("a member whose arguments can be left out is rejected", () => {
    Enum.companion<Shape>()
      .impl(() => ({
        // @ts-expect-error a parameter that can be left out
        sides: (s: Shape, round?: number) => (s._tag === "Circle" ? (round ?? 0) : 4),
      }))
      .build();
    Enum.companion<Shape>()
      .Circle.impl(() => ({
        // @ts-expect-error a parameter that can be left out
        grown: (c: VariantOf<Shape, "Circle">, by?: number) => c.r + (by ?? 0),
      }))
      .build();
    expect(() =>
      Enum.companion<Shape>()
        .impl(() => ({
          // @ts-expect-error the first parameter must be the Val
          sides: () => 4,
        }))
        .build(),
    ).toThrow(/first parameter/);
    expect(() =>
      Enum.companion<Shape>()
        .Circle.impl(() => ({
          // @ts-expect-error the first parameter must be the Val
          unit: () => 1,
        }))
        .build(),
    ).toThrow(/first parameter/);
  });

  test("a member hiding its parameters throws in development", () => {
    const sides = (s: Shape) => (s._tag === "Circle" ? 0 : 4);
    expect(() =>
      Enum.companion<Shape>()
        .impl(() => ({ sides: (...args: [Shape]) => sides(...args) }))
        .build(),
    ).toThrow(/first parameter/);
  });
});

// Both read any other key as a variant.
describe("the builder and the companion are proxies", () => {
  test.each([
    ["the builder", Enum.companion<Shape>()],
    ["the companion", Shape],
  ])("on %s, a symbol is undefined, and `then` is not a function", async (_, proxy) => {
    const read = proxy as unknown as Record<PropertyKey, unknown>;
    expect(read[Symbol.iterator]).toBeUndefined();
    expect(await Promise.resolve(proxy)).toBe(proxy);
  });
});
