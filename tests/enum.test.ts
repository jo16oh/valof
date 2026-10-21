import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { equals, Val, type PayloadOf, type Rec } from "../src/index.ts";
import {
  Enum,
  Trait,
  type Dyn,
  type Final,
  type SeedFor,
  type SealedPayload,
  type Self,
  Tag,
  type VariantOf,
} from "../src/experimental.ts";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().implVariant("Circle", (variant) =>
  variant.impl({ diameter: (c) => c.r * 2 }),
);
const { Circle, Square } = Shape;

const circle = Circle.create({ r: 2 });
const square = Square.create({ side: 3 });

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

  test("`nocopy` adopts the payload instead, on both of the companion's gates", () => {
    type Crate = Enum<"Crate", { Full: { items: readonly string[] }; Empty: { at: string } }>;
    const Crate = Enum.companion<Crate>().implSeal((c, seal) => seal(c));
    const [created, checked, copied] = [["a"], ["a"], ["a"]];
    Crate.Full.create.nocopy({ items: created });
    Crate.Full.seal.nocopy({ items: checked, _tag: "Full" });
    Crate.Full.create({ items: copied });
    expect([created, checked, copied].map(Object.isFrozen)).toEqual([true, true, false]);
  });

  test("a variant with no fields takes an object, and nothing else", () => {
    type Signal = Enum<"Signal", { Stop: {}; Go: { speed: number } }>;
    const Signal = Enum.companion<Signal>();
    expectTypeOf(Signal.Stop.create({})).toExtend<SeedFor<Signal, "Stop">>();
    expectTypeOf<string>().not.toExtend<SeedFor<Signal, "Stop">>();
    // Through a cast, the constructor throws rather than spread the string into its characters.
    expect(() => Signal.Stop.create("text" as never)).toThrow(/variant's payload/);
    expect(() => Signal.Stop.create([1] as never)).toThrow(/variant's payload/);
  });

  // The type is structural, and the spread that adds the tag would drop the prototype unseen.
  test("a class instance is rejected, like in any other Val", () => {
    class Ring {
      r = 1;
    }
    expect(() => Circle.create(new Ring())).toThrow(/instance of Ring/);
  });

  test("the payload is deep-copied, like any other Val", () => {
    type Box = Enum<"Box", { Full: { items: string[] }; Empty: { at: string } }>;
    const Box = Enum.companion<Box>();
    const items = ["a"];
    const full = Box.Full.create({ items });
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
});

describe("`seal` seals a payload by its tag", () => {
  type Command = Enum<"Command", { New: { count: number }; Fail: { message: string } }>;
  const Command = Enum.companion<Command>();
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
    const Mark = Enum.companion<Mark>();
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

  test("the constructor does not take it", () => {
    // @ts-expect-error the constructor writes the tag itself
    Circle.create({ r: 1, _tag: "Circle" });
  });

  test("and `patch` cannot reach it", () => {
    // @ts-expect-error a patch cannot switch variants
    Circle.patch(circle, { _tag: "Square" });
  });

  describe("a name of your own", () => {
    type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
    const Event = Enum.companion<Event>("kind");

    test("`[Tag].key` returns it, typed as the literal", () => {
      expectTypeOf(Event[Tag].key).toEqualTypeOf<"kind">();
      expect(Event[Tag].key).toBe("kind");
      expect(Shape[Tag].key).toBe("_tag");
    });

    test("reserves no variant name of its own", () => {
      type Git = Enum<"Git", { commit: { sha: string }; tag: { name: string } }, Tag<"type">>;
      const Git = Enum.companion<Git>("type");
      expect(Git.tag.create({ name: "v1" })).toEqual({ name: "v1", type: "tag" });
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
    const leaf = Node.Leaf.create({ id: "l1", value: 1 });
    expect(leaf).toEqual({ id: "l1", value: 1, _tag: "Leaf" });
    const node: Node = leaf;
    expectTypeOf(node.id).toEqualTypeOf<string>();
  });

  test("a shared field may hold a Val, and takes nothing else", () => {
    type Owner = Val<"Owner", { id: string }>;
    const Owner = Val.companion<Owner>();
    type Doc = Enum<"Doc", { Draft: { n: number }; Final: { s: string } }, { owner: Owner }>;
    const Doc = Enum.companion<Doc>();
    Doc.Draft.create({ n: 1, owner: Owner.seal({ id: "o" }) });
    // @ts-expect-error a record is not an Owner
    Doc.Draft.create({ n: 1, owner: { id: "o" } });
  });
});

describe("members", () => {
  type Money = Enum<"Money", { Cash: { yen: number }; Card: { limit: number } }, { id: string }>;
  const Money = Enum.companion<Money>()
    .implVariant("Cash", (variant) => variant.impl({ doubled: (c) => c.yen * 2 }))
    .impl({
      spendable: (m): number =>
        Money.match(m, { Cash: (c) => Money.Cash.doubled(c), Card: (c) => c.limit }),
    });

  test("a variant's member takes that variant, with no annotation", () => {
    expectTypeOf<Parameters<typeof Money.Cash.doubled>>().toEqualTypeOf<
      [self: VariantOf<Money, "Cash">]
    >();
    expect(Money.spendable(Money.Cash.create({ id: "c", yen: 100 }))).toBe(200);
    expect(Money.spendable(Money.Card.create({ id: "d", limit: 5 }))).toBe(5);
  });

  test("the frame is the same one a destructured variant gets", () => {
    const { Cash } = Money;
    expect(Cash).toBe(Money.Cash);
  });

  test("a member reaching nothing off the companion needs no annotation", () => {
    const Plain = Enum.companion<Shape>().impl({ sides: (s) => (s._tag === "Circle" ? 0 : 4) });
    expectTypeOf<Parameters<typeof Plain.sides>>().toEqualTypeOf<[self: Shape]>();
    expectTypeOf<ReturnType<typeof Plain.sides>>().toEqualTypeOf<0 | 4>();
    expect(Plain.sides(Plain.Circle.create({ r: 1 }))).toBe(0);
  });

  test("a union member may not take a variant's name", () => {
    // @ts-expect-error a member cannot cover a constructor
    Enum.companion<Shape>().impl({ Circle: (s: Shape) => s });
  });

  test("nor `match`, nor a name the library reserves", () => {
    // @ts-expect-error `match` is the library's
    Enum.companion<Shape>().impl({ match: (s: Shape) => s });
    // @ts-expect-error `patch` is the library's
    Enum.companion<Shape>().impl({ patch: (s: Shape) => s });
  });

  test("a step does not mutate the one before it", () => {
    const before = Enum.companion<Shape>();
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

  describe("a nested variant", () => {
    type Holder = Val<"Holder", { id: string; shape: Shape }>;
    const Holder = Val.companion<Holder>();
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
  const Tree = Enum.companion<Tree>().impl({
    total: (t: Tree): number =>
      Tree.match(t, {
        Leaf: (l) => l.value,
        Branch: (b) => b.kids.reduce((n, kid) => n + Tree.total(kid), 0),
      }),
  });

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
    const Step = Enum.companion<Step>();
    expect(equals(circle, Circle.create({ r: 2 }))).toBe(true);
    expect(equals<Step>(Step.Up.create({ n: 1 }), Step.Down.create({ n: 1 }))).toBe(false);
  });
});

describe("traits", () => {
  type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;
  const Describable = Trait.companion<Describable>();

  type Cmd = Enum<"Cmd", { Add: { n: number }; Del: { at: number } }, { id: string } & Describable>;
  const Cmd = Enum.companion<Cmd>().implTrait(Describable, {
    describe: (c): string => Cmd.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
  });

  const add = Cmd.Add.create({ id: "c1", n: 2 });

  test("the union implements the trait once, and matches inside it", () => {
    expect([Cmd.describe(add), Cmd.describe(Cmd.Del.create({ id: "c2", at: 1 }))]).toEqual([
      "add 2",
      "del 1",
    ]);
  });

  test("its member takes the value first, or last", () => {
    expectTypeOf(Cmd.describe()).toEqualTypeOf<(self: Cmd) => string>();
    expect(Cmd.describe()(add)).toBe("add 2");
  });

  test("a variant goes into a box like any other Val", () => {
    type User = Val<"User", { id: string }, Describable>;
    const User = Val.companion<User>().implTrait(Describable, { describe: (u) => `user ${u.id}` });
    const party: Dyn<Describable>[] = [
      Describable.dyn(Cmd, add),
      Describable.dyn(User, User.seal({ id: "u1" })),
    ];
    expect(party.map((p) => p.describe())).toEqual(["add 2", "user u1"]);
  });

  test("a trait that implements everything itself takes no second argument", () => {
    type Labelled = Trait<"Labelled", { id: string }, { label: (self: Self) => string }>;
    const Labelled = Trait.companion<Labelled>().impl({ label: (l) => `#${l.id}` });
    type Tick = Enum<"Tick", { Up: { n: number }; Down: { n: number } }, Labelled>;
    const Tick = Enum.companion<Tick>().implTrait(Labelled);
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
    Enum.companion<Bad>();
  });

  test("a trait the enum does not declare is rejected", () => {
    // @ts-expect-error the type does not declare this trait
    Enum.companion<Shape>().implTrait(Describable, { describe: (_s) => "" });
  });

  describe("a trait that implements nothing of its own", () => {
    type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
    const Wired = Trait.companion<Wired>();
    type Row = Enum<"Row", { Head: { n: number }; Body: { s: string } }, { id: string } & Wired>;

    test("is implemented through its companion", () => {
      const Row = Enum.companion<Row>().implTrait(Wired, {
        toWire: (r, sep): string =>
          Row.match(r, {
            Head: (h) => `${h.id}${sep}${h.n}`,
            Body: (b) => `${b.id}${sep}${b.s}`,
          }),
      });
      expect(Row.toWire(Row.Head.create({ id: "r1", n: 2 }), "-")).toBe("r1-2");
    });

    test("cannot be named as a type argument instead", () => {
      const toWire = (r: Row, sep: string) => r.id + sep;
      // @ts-expect-error implTrait takes the trait's companion, not a type argument
      Enum.companion<Row>().implTrait<Wired>({ toWire });
    });

    test("nor be left out, with its members passed alone", () => {
      // `@ts-expect-error` alone would stay green: the call failed before this message existed too.
      // The message is the parameter's type, so passing it fixes the wording.
      const unnamed = "pass the trait's companion, then the members it leaves open";
      Enum.companion<Row>().implTrait(unnamed);
      // @ts-expect-error the members alone do not say which trait they implement
      Enum.companion<Row>().implTrait({ toWire: (r: { id: string }) => r.id });
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
      const Rad = Trait.companion<Rad>();
      // @ts-expect-error a member cannot take the name of a field the payload holds
      Enum.companion<Round>().implTrait(Rad, { r: (c: { id: string }) => c.id.length });
    });

    test("one another trait already answers to", () => {
      type Sized = Trait<"Sized", { id: string }, { size: (self: Self) => number }>;
      const Sized = Trait.companion<Sized>().impl({ size: (s) => s.id.length });
      type Wide = Trait<"Wide", { id: string }, { size: (self: Self) => number }>;
      const Wide = Trait.companion<Wide>().impl({ size: (w) => w.id.length * 2 });
      type Both = Enum<
        "Both",
        { A: { n: number }; B: { s: string } },
        { id: string } & Sized & Wide
      >;
      // @ts-expect-error another member already answers to one of these names
      Enum.companion<Both>().implTrait(Sized).implTrait(Wide);
    });

    describe("one a trait the enum declares answers to", () => {
      test("on the union", () => {
        Enum.companion<Cmd>()
          .implTrait(Describable, { describe: (c) => c.id })
          // @ts-expect-error a trait the enum declares answers to this name
          .impl({ describe: (c) => c._tag });
        // The message is the parameter type, so passing the literal is what pins the wording.
        Enum.companion<Cmd>()
          .implTrait(Describable, { describe: (c) => c.id })
          .impl({ describe: "a trait the enum declares answers to this name" });
      });

      test("on a variant", () => {
        Enum.companion<Cmd>()
          // @ts-expect-error same, on a variant
          .implVariant("Add", (variant) => variant.impl({ describe: (a) => `${a.n}` }));
      });

      test("a name no trait answers to stays open", () => {
        const Named = Enum.companion<Cmd>()
          .implVariant("Add", (variant) => variant.impl({ twice: (a) => a.n * 2 }))
          .implTrait(Describable, { describe: (c) => c.id })
          .impl({ kind: (c) => c._tag });
        expect([Named.kind(add), Named.Add.twice(add)]).toEqual(["Add", 4]);
      });
    });

    test("a companion that skipped a Final cannot be implemented", () => {
      type Fixed = Trait<
        "Fixed",
        { id: string },
        { stamp: Final<(self: Self) => string>; note: (self: Self) => string }
      >;
      type Card = Enum<"Card", { A: { n: number }; B: { s: string } }, { id: string } & Fixed>;
      Enum.companion<Card>().implTrait(
        // @ts-expect-error this trait's companion has not implemented every member declared Final
        Trait.companion<Fixed>(),
        // Annotated because the first argument is the error: the implementation loses its
        // contextual type along with it. A healthy call needs neither annotation.
        { note: (c: VariantOf<Card, "A"> | VariantOf<Card, "B">) => c.id },
      );
    });
  });
});

// Each check goes on the constructor. A broken declaration stops satisfying the constraint, and
// the constructor is the line the user writes.
describe("a broken declaration", () => {
  test("a variant may not be called `then`", () => {
    type Awaited = Enum<"Awaited", { then: { n: number }; Other: { n: number } }>;
    // @ts-expect-error a variant named `then` would make the companion a thenable
    Enum.companion<Awaited>();
  });

  test("a variant may not take a name the library reserves", () => {
    type Sealed = Enum<"Sealed", { seal: { n: number }; Other: { n: number } }>;
    // @ts-expect-error a variant cannot take a name the library reserves
    Enum.companion<Sealed>();

    type Stepped = Enum<"Stepped", { implCreate: { n: number }; Other: { n: number } }>;
    // @ts-expect-error same, for a step only a Val's builder has
    Enum.companion<Stepped>();

    type Sneaky = Enum<"Sneaky", { __valof_traits: { n: number }; Other: { n: number } }>;
    // @ts-expect-error same, for the library's own keys
    Enum.companion<Sneaky>();
  });

  test("but may take another word starting with `impl`", () => {
    type Grant = Enum<"Grant", { implicit: { scope: string }; password: { user: string } }>;
    const Grant = Enum.companion<Grant>();
    expect(Grant.implicit.create({ scope: "read" })).toEqual({ scope: "read", _tag: "implicit" });
  });

  // The member would replace the constructor or `match` at run time, under the library's type.
  test("a trait member may not take a variant's name, nor `match`", () => {
    type Sq = Trait<"Sq", Record<never, never>, { Square: (self: Self) => string }>;
    type Sized = Trait<"Sized", Record<never, never>, { size: (self: Self) => number }>;
    type Boxy = Enum<"Boxy", { Circle: { r: number }; Square: { side: number } }, Sq & Sized>;
    // @ts-expect-error a trait member cannot take a variant's name
    Enum.companion<Boxy>();

    type Matcher = Trait<"Matcher", Record<never, never>, { match: (self: Self) => string }>;
    type Coin = Enum<"Coin", { Heads: { n: number }; Tails: { n: number } }, Matcher>;
    // @ts-expect-error a trait member cannot take the name `match`
    Enum.companion<Coin>();
  });

  // An indexed access over a single key hands back the variant itself, and the alias goes with
  // the union: a consumer's `.d.ts` then expands onto the private phantoms and fails with TS4094.
  test("an enum needs at least two variants", () => {
    type Lonely = Enum<"Lonely", { Only: { n: number } }>;
    // @ts-expect-error an enum needs at least two variants; one is a Val
    Enum.companion<Lonely>();

    // With no variants at all the indexed access is `never`, and there is no value to build.
    expectTypeOf<Enum<"Empty", Record<never, never>>>().toEqualTypeOf<never>();
  });

  test("a variant's payload must be a record of fields", () => {
    type Primitive = Enum<"Primitive", { One: number; Two: { n: number } }>;
    // @ts-expect-error a variant's payload must be a record of fields
    Enum.companion<Primitive>();

    type Listed = Enum<"Listed", { Many: readonly string[]; Other: { n: number } }>;
    // @ts-expect-error same, for an array
    Enum.companion<Listed>();
  });

  test("the tag may not take a name a payload or a shared field holds", () => {
    type Clash = Enum<"Clash", { One: { _tag: string }; Two: { n: number } }>;
    // @ts-expect-error the tag cannot take the name of a field the payload holds
    Enum.companion<Clash>();

    type SharedClash = Enum<
      "SharedClash",
      { One: { n: number }; Two: { n: number } },
      { _tag: string }
    >;
    // @ts-expect-error the tag cannot take the name of a shared field
    Enum.companion<SharedClash>();
  });

  test("a variant takes no companion of its own, and neither does the union", () => {
    // @ts-expect-error a variant is built by its enum's companion
    Val.companion<VariantOf<Shape, "Circle">>();
    // @ts-expect-error same, for the union
    Val.companion<Shape>();
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
    );

  test("every variant builds with `create`, and the seal's return propagates", () => {
    const cash = Money.Cash.create({ id: "m1", yen: 100 });
    expectTypeOf(cash).toEqualTypeOf<VariantOf<Money, "Cash"> | RangeError>();
    expect(cash).toEqual({ id: "m1", yen: 100, _tag: "Cash" });
    expect(Money.Cash.create({ id: "m1", yen: 0 })).toBeInstanceOf(RangeError);
  });

  test("`seal` runs the seal of the variant the tag names", () => {
    const sealed = Money.seal({ id: "m1", yen: 1, _tag: "Cash" });
    expectTypeOf(sealed).toEqualTypeOf<
      VariantOf<Money, "Cash"> | VariantOf<Money, "Card"> | RangeError
    >();
    expect(sealed).toEqual({ id: "m1", yen: 1, _tag: "Cash" });
    expect(Money.seal({ id: "m1", yen: 0, _tag: "Cash" })).toBeInstanceOf(RangeError);
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

  test("`implSeal` comes first, once", () => {
    // A variant's frame reads the enum's seal off the chain as it stands, so a later seal would
    // run in a frame typed without it.
    type Priced = Trait<"Priced", { id: string }, { price: (self: Self) => number }>;
    const Priced = Trait.companion<Priced>();
    type Item = Enum<"Item", { Cash: { yen: number }; Card: { limit: number } }, Priced>;
    const varied = Enum.companion<Money>().implVariant("Cash", (variant) => variant);
    const implemented = Enum.companion<Money>().impl({ id: (m) => m.id });
    const traited = Enum.companion<Item>().implTrait(Priced, { price: (_i) => 0 });
    const sealed = Enum.companion<Money>().implSeal((p, seal) => seal(p));
    // One line each: over the array's union, the check would read only the keys all four share.
    expectTypeOf(sealed).not.toHaveProperty("implSeal");
    expectTypeOf(varied).not.toHaveProperty("implSeal");
    expectTypeOf(implemented).not.toHaveProperty("implSeal");
    expectTypeOf(traited).not.toHaveProperty("implSeal");
    for (const built of [sealed, varied, implemented, traited])
      expect((built as unknown as Record<string, unknown>)["implSeal"]).toBeUndefined();
  });

  test("a seal whose return can be awaited is rejected", () => {
    // @ts-expect-error a seal is synchronous
    Enum.companion<Money>().implSeal(async (p, seal) => seal(p));
    Enum.companion<Money>().implVariant("Cash", (variant) =>
      // @ts-expect-error the same for a variant's seal
      variant.implSeal(async (p, seal) => seal(p)),
    );
  });

  test("a variant seals alone where the enum wrote none", () => {
    const Plain = Enum.companion<Shape>().implVariant("Circle", (variant) =>
      variant.implSeal((p, seal) => (p.r > 0 ? seal(p) : new RangeError("r must be positive"))),
    );
    expect(Plain.Circle.create({ r: 2 })).toEqual(circle);
    expect(Plain.Circle.create({ r: 0 })).toBeInstanceOf(RangeError);
    expectTypeOf(Plain.Square.create({ side: 3 })).toEqualTypeOf<VariantOf<Shape, "Square">>();
    expect(Plain.Square.create({ side: 3 })).toEqual(square);
    expectTypeOf(Plain.Square).not.toHaveProperty("seal");
  });

  test("a variant's member reaching the enum names the companion and annotates its return", () => {
    const Twinned = Enum.companion<Shape>().implVariant("Circle", (variant) =>
      variant.impl({ twin: (c): Shape => Twinned.Square.create({ side: c.r }) }),
    );
    expect(Twinned.Circle.twin(circle)).toEqual({ side: 2, _tag: "Square" });
  });

  test("a variant already built cannot be named again", () => {
    Enum.companion<Shape>()
      .implVariant("Circle", (variant) => variant.impl({ diameter: (c) => c.r * 2 }))
      // @ts-expect-error the second frame would drop the first
      .implVariant("Circle", (variant) => variant);
  });

  test("the steps are already the frame, so a callback collecting nothing hands them back", () => {
    const Kept = Enum.companion<Money>()
      .implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id must not be empty")))
      .implVariant("Cash", (variant) => variant);
    expect(Kept.Cash.create({ id: "m1", yen: 1 })).toEqual({ id: "m1", yen: 1, _tag: "Cash" });
    expect(Kept.Cash.create({ id: "", yen: 1 })).toBeInstanceOf(RangeError);
  });

  test("a frame a step made is closed", () => {
    // A step reached from that frame would stand a second constructor beside the first.
    expect("implSeal" in Money.Cash).toBe(false);
    expectTypeOf(Money.Cash).not.toHaveProperty("implSeal");
  });
});

describe("the order of the steps", () => {
  test("`impl` is written once, and `implVariant` and `implTrait` may follow it", () => {
    type Labelled = Trait<"Labelled", { at: number }, { label: (self: Self) => string }>;
    const Labelled = Trait.companion<Labelled>();
    type Tile = Enum<"Tile", { Floor: { at: number }; Wall: { at: number } }, Labelled>;
    const Tile = Enum.companion<Tile>()
      .impl({ at: (t) => t.at })
      .implVariant("Wall", (variant) => variant.impl({ solid: (_w) => true }))
      .implTrait(Labelled, { label: (t) => `${t._tag} ${t.at}` });
    const wall = Tile.Wall.create({ at: 2 });

    expectTypeOf(Tile).not.toHaveProperty("impl");
    expect((Tile as unknown as Record<string, unknown>)["impl"]).toBeUndefined();
    expect([Tile.at(wall), Tile.Wall.solid(wall), Tile.label(wall)]).toEqual([2, true, "Wall 2"]);
  });

  test("`impl` takes the members: with no chain to close, there is no call without them", () => {
    // Never called: the empty call would throw before the type is the point.
    const bare = () => {
      // @ts-expect-error `Enum.companion<Shape>()` is the companion already
      Enum.companion<Shape>().impl();
      // @ts-expect-error the same for a variant: the callback hands the steps back unchanged
      Enum.companion<Shape>().implVariant("Circle", (variant) => variant.impl());
    };
    expectTypeOf(bare).toBeFunction();
  });

  test("a member calling a sibling names the companion and annotates its return", () => {
    const Sized = Enum.companion<Shape>().impl({
      area: (s): number =>
        Sized.match(s, { Circle: (c) => c.r * c.r * 3, Square: (q) => q.side ** 2 }),
      twice: (s): number => Sized.area(s) * 2,
    });

    expect(Sized.twice(Sized.Square.create({ side: 3 }))).toBe(18);
  });
});

describe("data-first and data-last", () => {
  const pipe = <A, B>(a: A, f: (a: A) => B): B => f(a);
  const Sized = Enum.companion<Shape>()
    .implVariant("Circle", (variant) => variant.impl({ grown: (c, by: number) => c.r + by }))
    .impl({ sides: (s, round: number) => (s._tag === "Circle" ? round : 4) });

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
  });

  test("so does `[Tag].match`", () => {
    const sides = Shape[Tag].match({ Circle: () => 0, Square: () => 4 });
    expectTypeOf(sides).toEqualTypeOf<(tag: "Circle" | "Square") => number>();
    expect(sides("Square")).toBe(4);
  });

  test("a member whose arguments can be left out is rejected", () => {
    Enum.companion<Shape>().impl({
      // @ts-expect-error a parameter that can be left out
      sides: (s: Shape, round?: number) => (s._tag === "Circle" ? (round ?? 0) : 4),
    });
    Enum.companion<Shape>().implVariant("Circle", (variant) =>
      variant.impl({
        // @ts-expect-error a parameter that can be left out
        grown: (c: VariantOf<Shape, "Circle">, by?: number) => c.r + (by ?? 0),
      }),
    );
    expect(() =>
      Enum.companion<Shape>().impl({
        // @ts-expect-error the first parameter must be the Val
        sides: () => 4,
      }),
    ).toThrow(/first parameter/);
    Enum.companion<Shape>().implVariant("Circle", (variant) =>
      variant.impl({
        // @ts-expect-error the first parameter must be the Val
        unit: () => 1,
      }),
    );
  });

  test("a member hiding its parameters throws in development", () => {
    const sides = (s: Shape) => (s._tag === "Circle" ? 0 : 4);
    expect(() =>
      Enum.companion<Shape>().impl({ sides: (...args: [Shape]) => sides(...args) }),
    ).toThrow(/first parameter/);
  });
});

describe("the companion is a proxy", () => {
  test("a symbol and `then` come back undefined", async () => {
    expect((Shape as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
    expect(await Promise.resolve(Shape)).toBe(Shape);
  });
});
