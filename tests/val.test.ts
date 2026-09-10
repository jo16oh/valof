import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type { AnyVal, Final, Patch, PayloadOf, SeedOf, Self } from "../src/index.ts";
import { Trait, Val } from "../src/index.ts";
// `BrandOf` and `deepEquals` are not published from the entry point.
import type { BrandOf } from "../src/val.ts";
import { deepEquals } from "../src/val.ts";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

type User = Val<"app/User", { id: string; name: string; nickname?: string }>;
type Age = Val<"Age", number>;
type ArticleId = Val<"ArticleId", string>;
type Tags = Val<"Tags", Readonly<Record<string, true>>>;
type Grid = Val<"Grid", ReadonlyArray<ReadonlyArray<number>>>;

const User = Val.sealer<User>();
const Age = Val.companion<Age>().implSeal((n: number, seal): Result<Age> =>
  n >= 0 && Number.isInteger(n)
    ? { ok: true, value: seal(n) }
    : { ok: false, error: "age must be a non-negative integer" },
);

describe("Val", () => {
  describe("of", () => {
    test("a constructor returns an equal value, copied", () => {
      const raw = { id: "a", name: "bob" };
      const user = User(raw);
      expect(user).toEqual(raw);
      expect(user).not.toBe(raw);
      expect(user.name).toBe("bob");
    });

    test("Val.of copies too", () => {
      const raw = { id: "a", name: "alice" };
      const user = Val.of<User>(raw);
      expect(user).toEqual(raw);
      expect(user).not.toBe(raw);
    });
  });

  describe("unwrap", () => {
    test("hands back a mutable copy", () => {
      type Post = Val<"Post", { title: string; tags: string[] }>;
      const Post = Val.sealer<Post>();
      const post = Post({ title: "t", tags: ["a"] });

      const raw = Val.unwrap(post);
      expect(raw).toEqual({ title: "t", tags: ["a"] });
      expect(raw).not.toBe(post);
      expect(raw.tags).not.toBe(post.tags);

      raw.tags.push("b");
      raw.title = "changed";
      expect(post.tags).toEqual(["a"]);
      expect(post.title).toBe("t");

      expectTypeOf(raw).toEqualTypeOf<{ title: string; tags: string[] }>();
    });

    test("works on primitive and array payloads", () => {
      const ArticleId = Val.sealer<ArticleId>();
      expect(Val.unwrap(ArticleId("a1b2c3"))).toBe("a1b2c3");

      const Tags = Val.sealer<Val<"Tags", readonly string[]>>();
      const tags = Tags(["a", "b"]);
      const raw = Val.unwrap(tags);
      expect(raw).toEqual(["a", "b"]);
      expect(raw).not.toBe(tags);
    });

    test("a nested Val comes back as data", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Order = Val<"Order", { id: string; total: Money }>;
      const Money = Val.sealer<Money>();
      const Order = Val.sealer<Order>();
      const order = Order({ id: "o", total: Money({ amount: 1, currency: "JPY" }) });

      const raw = Val.unwrap(order);
      expect(raw).toEqual({ id: "o", total: { amount: 1, currency: "JPY" } });
      expect(Money.equals(raw.total, Money({ amount: 1, currency: "JPY" }))).toBe(true);
    });
  });

  describe("payloads", () => {
    test("a primitive can be wrapped directly", () => {
      const ArticleId = Val.sealer<ArticleId>();
      const id = ArticleId("a1b2c3");
      expect(id).toBe("a1b2c3");
      expectTypeOf(id).toExtend<string>();
    });

    test("a Record works as a Set", () => {
      const Tags = Val.sealer<Tags>();
      const t = Tags({ a: true, b: true });
      expect(t.a).toBe(true);
      expect(t.c).toBeUndefined();
    });

    test("optional keys are allowed", () => {
      type Allowed = Val<"Allowed", { nickname?: string }>;
      expectTypeOf<Allowed>().toExtend<AnyVal>();
    });

    test("Vals, arrays, records and primitives are allowed", () => {
      expectTypeOf<Val<"A", string>>().toExtend<AnyVal>();
      expectTypeOf<Val<"B", bigint>>().toExtend<AnyVal>();
      expectTypeOf<Val<"C", readonly string[]>>().toExtend<AnyVal>();
      expectTypeOf<Val<"D", Readonly<Record<string, true>>>>().toExtend<AnyVal>();
      expectTypeOf<Val<"E", { at: Val<"A", string>; n: number | null }>>().toExtend<AnyVal>();
    });

    test("a tuple keeps its positions, its length and its labels", () => {
      type Point = Val<"Point", string>;
      const Point = Val.sealer<Point>();
      type Pair = Val<"Pair", { at: readonly [Point, number] }>;
      const Pair = Val.sealer<Pair>();

      const p = Pair({ at: [Point("a"), 1] });

      expectTypeOf(p.at).toEqualTypeOf<readonly [Point, number]>();
      expectTypeOf(p.at[0]).toEqualTypeOf<Point>();
      expectTypeOf(p.at.length).toEqualTypeOf<2>();
      expect(Val.unwrap(p).at).toEqual(["a", 1]);

      // @ts-expect-error the positions are not interchangeable
      Pair({ at: [1, Point("a")] });
    });

    test("an optional element is allowed; a rest element falls back to an array", () => {
      type Opt = Val<"Opt", { at: readonly [string, number?] }>;
      expectTypeOf<Opt>().toExtend<AnyVal>();
      expectTypeOf<SeedOf<Opt>["at"][0]>().toEqualTypeOf<string>();
      expectTypeOf<SeedOf<Opt>["at"][1]>().toEqualTypeOf<number | undefined>();

      // A rest element makes `length` plain `number`, which is what tells a tuple from an array,
      // so this one is read as an array. Positions are lost, nothing is unsound.
      type Rest = Val<"Rest", { at: readonly [string, ...number[]] }>;
      expectTypeOf<SeedOf<Rest>["at"]>().toEqualTypeOf<readonly (string | number)[]>();
    });

    test("nested arrays", () => {
      const Grid = Val.sealer<Grid>();
      const g = Grid([
        [1, 2],
        [3, 4],
      ]);
      expect(g[1]?.[0]).toBe(3);
    });
  });

  describe("rejected payloads", () => {
    // `BrandOf` constrains its argument to `AnyVal`, which an invalid Val fails by design.
    type BrandOfInvalid<V> = V extends { readonly __valof_internal_phantom_brand: infer B }
      ? B
      : never;

    test("the rule that rejected a payload is carried in the brand", () => {
      type BadFn = Val<"Bad", { run: () => void }>;
      expectTypeOf<BrandOfInvalid<BadFn>>().toEqualTypeOf<{
        run: { readonly __valError: "functions are not allowed" };
      }>();

      type BadSymbol = Val<"Bad", symbol>;
      expectTypeOf<BrandOfInvalid<BadSymbol>>().toEqualTypeOf<{
        readonly __valError: "not a plain value";
      }>();
    });

    test("the rules reach inside a tuple", () => {
      type Element<V> = BrandOfInvalid<V> extends { at: readonly [infer A, unknown] } ? A : never;

      type BadFn = Val<"Bad", { at: readonly [string, () => void] }>;
      expectTypeOf<Element<BadFn>>().toEqualTypeOf<string>();
      expectTypeOf<BadFn>().not.toExtend<AnyVal>();

      type BadUndefined = Val<"Bad", { at: readonly [string | undefined, number] }>;
      expectTypeOf<Element<BadUndefined>>().toEqualTypeOf<{
        readonly __valError: "a tuple element cannot be undefined; use null or make it optional";
      }>();
      expectTypeOf<BadUndefined>().not.toExtend<AnyVal>();
    });

    test("undefined as a required key's value is rejected", () => {
      type Bad = Val<"Bad", { nickname: string | undefined }>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error required property cannot be undefined
      Val.companion<Bad>();
    });

    test("functions are rejected", () => {
      type Bad = Val<"Bad", { run: () => void }>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
    });

    test("null is allowed inside a payload, but not at its top level", () => {
      type Nested = Val<"Nested", { value: string | null }>;
      expectTypeOf<Nested>().toExtend<AnyVal>();

      type Null = Val<"Null", null>;
      type Maybe = Val<"Maybe", string | null>;
      expectTypeOf<BrandOfInvalid<Null>>().toEqualTypeOf<{
        readonly __valError: "a top-level payload cannot include null; null cannot carry a Val brand";
      }>();
      expectTypeOf<Null>().not.toExtend<AnyVal>();
      expectTypeOf<Maybe>().not.toExtend<AnyVal>();
      // @ts-expect-error null cannot carry the phantom brand
      Val.sealer<Null>();
      // @ts-expect-error the nullable branch would disappear from the branded value
      Val.sealer<Maybe>();
    });

    test("number and symbol keys are rejected", () => {
      expectTypeOf<Val<"Bad", Readonly<Record<number, true>>>>().not.toExtend<AnyVal>();
      expectTypeOf<Val<"Bad", Readonly<Record<symbol, string>>>>().not.toExtend<AnyVal>();
      expectTypeOf<Val<"Bad", { readonly 1: string }>>().not.toExtend<AnyVal>();
    });
  });

  describe("the brand", () => {
    test("different brands are not assignable", () => {
      type A = Val<"A", string>;
      type B = Val<"B", string>;
      expectTypeOf<A>().not.toExtend<B>();
      expectTypeOf<A>().toExtend<string>();
      expectTypeOf<string>().not.toExtend<A>();
    });

    test("nested Vals keep their brand", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Order = Val<"Order", { id: string; total: Money }>;
      const Order = Val.sealer<Order>();
      const order = Order({ id: "o", total: Val.of<Money>({ amount: 1, currency: "JPY" }) });
      expectTypeOf(order.total).toEqualTypeOf<Money>();
    });

    test("an array Val is a branded ReadonlyArray", () => {
      const GridVal = Val.sealer<Grid>();
      const g = GridVal([[1]]);
      expectTypeOf(g).toExtend<readonly (readonly number[])[]>();
    });

    test("BrandOf / PayloadOf", () => {
      expectTypeOf<BrandOf<User>>().toEqualTypeOf<"app/User">();
      expectTypeOf<PayloadOf<ArticleId>>().toEqualTypeOf<string>();
    });

    test("does not exist at runtime", () => {
      const user = User({ id: "a", name: "bob" });
      expect(Object.keys(user)).toEqual(["id", "name"]);
      expect(Reflect.ownKeys(user)).toEqual(["id", "name"]);
      expect(JSON.parse(JSON.stringify(user))).toEqual({ id: "a", name: "bob" });
      expect(structuredClone(user)).toEqual({ id: "a", name: "bob" });
    });
  });

  describe("freezing", () => {
    test("DeepReadonly applies", () => {
      type Post = Val<"Post", { title: string; tags: string[] }>;
      const post = Val.of<Post>({ title: "t", tags: ["a"] });
      expectTypeOf(post.tags).toEqualTypeOf<readonly string[]>();
      // The type is the guarantee; in development the freeze catches a write that casts past it.
      expect(() => {
        // @ts-expect-error readonly, so it cannot be assigned
        post.title = "x";
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error a readonly array cannot be pushed to
        post.tags.push("b");
      }).toThrow(TypeError);
    });

    test("values are frozen in development, all the way down", () => {
      type Post = Val<"Post", { title: string; author: { name: string }; tags: readonly string[] }>;
      const Post = Val.sealer<Post>();
      const post = Post({ title: "t", author: { name: "alice" }, tags: ["a"] });

      expect(Object.isFrozen(post)).toBe(true);
      expect(Object.isFrozen(post.author)).toBe(true);
      expect(Object.isFrozen(post.tags)).toBe(true);
    });

    test("a payload's getter cannot leave a value half-sealed", () => {
      // Copying a payload runs its getters, so someone else's code can run mid-copy and reach
      // back into the library.
      type Note = Val<"Note", { id: string; body: { text: string } }>;
      const Note = Val.sealer<Note>();
      const other = Note({ id: "b", body: { text: "b" } });

      const note = Note({
        id: "a",
        get body() {
          Val.unwrap(other);
          return { text: "a" };
        },
      });

      expect(Object.isFrozen(note)).toBe(true);
      expect(Object.isFrozen(note.body)).toBe(true);
      expect(note.body.text).toBe("a");
    });

    test("a mutable copy is not frozen", () => {
      const raw = Val.unwrap(User({ id: "a", name: "bob" }));
      expect(Object.isFrozen(raw)).toBe(false);
      raw.name = "sue";
      expect(raw.name).toBe("sue");
    });
  });
});

describe("copying", () => {
  describe("owning", () => {
    type Order = Val<"Order", { id: string; total: { amount: number; currency: string } }>;
    const Order = Val.sealer<Order>();

    test("mutating the argument afterwards does not reach the value", () => {
      const raw = { id: "a", name: "alice" };
      const user = User(raw);
      raw.name = "mallory";
      expect(user.name).toBe("alice");
    });

    test("the copy is deep", () => {
      const total = { amount: 100, currency: "JPY" };
      const order = Order({ id: "o", total });
      total.amount = 999;
      expect(order.total.amount).toBe(100);
      expect(order.total).not.toBe(total);
    });

    test("arrays are copied, not aliased", () => {
      const Grid = Val.sealer<Grid>();
      const rows = [[1, 2], [3]];
      const grid = Grid(rows);
      rows[0]![0] = 99;
      expect(grid[0]![0]).toBe(1);
      expect(grid).toEqual([[1, 2], [3]]);
    });

    test("a patch handed to `patch` is copied as well", () => {
      const total = { amount: 100, currency: "JPY" };
      const order = Order.patch(Order({ id: "o", total: { amount: 1, currency: "JPY" } }), {
        total,
      });
      total.amount = 999;
      expect(order.total.amount).toBe(100);
    });

    test("a `__proto__` key stays an own property", () => {
      const Tags = Val.sealer<Tags>();
      const tags = Tags(JSON.parse('{"a":true,"__proto__":{"isAdmin":true}}'));
      expect(Object.keys(tags)).toEqual(["a", "__proto__"]);
      expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);
      expect((tags as Record<string, unknown>)["isAdmin"]).toBeUndefined();
      expect(JSON.parse(JSON.stringify(tags))).toEqual(
        JSON.parse(JSON.stringify(Val.unwrap(tags))),
      );
    });

    test("a class instance is rejected in development", () => {
      class Point {
        constructor(
          public x = 1,
          public y = 2,
        ) {}
      }
      type Pt = Val<"Pt", { readonly x: number; readonly y: number }>;
      expect(() => Val.of<Pt>(new Point())).toThrow(TypeError);
      expect(() => Val.of<Pt>({ x: 1, y: 2 })).not.toThrow();
    });

    test("a null-prototype object is allowed, and comes back plain", () => {
      const source = Object.assign(Object.create(null) as Record<string, true>, { a: true });
      const tags = Val.of<Tags>(source);
      expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);
      expect(tags["a"]).toBe(true);
    });

    test("primitives pass through as-is", () => {
      const ArticleId = Val.sealer<ArticleId>();
      expect(ArticleId("a1b2c3")).toBe("a1b2c3");
    });

    test("the seal copies through Val.of, not by copying its argument itself", () => {
      type Point = Val<"Point", { x: number; y: number }>;
      const Point = Val.companion<Point>().implSeal((p) => Val.of<Point>(p));
      const raw = { x: 1, y: 2 };
      const p = Point.seal(raw);
      raw.x = 99;
      expect(p.x).toBe(1);
    });

    test("a seal normalises by deriving, and leaves the caller's object alone", () => {
      type Labels = Val<"Labels", string[]>;
      const Labels = Val.companion<Labels>().implSeal((l, seal) => seal(l.toSorted()));
      const raw = ["b", "a"];
      expect(Labels.seal(raw)).toEqual(["a", "b"]);
      expect(raw).toEqual(["b", "a"]);
    });
  });

  describe("reuse", () => {
    type Money = Val<"Money", { amount: number; currency: string }>;
    type Line = Val<"Line", { sku: string; qty: number }>;
    type Order = Val<"Order", { id: string; note: string; total: Money; lines: readonly Line[] }>;
    const Money = Val.sealer<Money>();
    const Line = Val.sealer<Line>();
    const Order = Val.sealer<Order>();
    const order = () =>
      Order({
        id: "o",
        note: "n",
        total: Money({ amount: 1, currency: "JPY" }),
        lines: [Line({ sku: "s", qty: 1 })],
      });

    test("`patch` keeps the subtrees it did not touch", () => {
      const before = order();
      const after = Order.patch(before, { note: "changed" });
      expect(after).not.toBe(before);
      expect(after.lines).toBe(before.lines);
      expect(after.lines[0]).toBe(before.lines[0]);
    });

    test("`update` keeps them too", () => {
      const before = order();
      const after = Order.update(before, (o) => ({ ...o, note: "changed" }));
      expect(after.lines).toBe(before.lines);
    });

    test("a leaf is reused too, so a nested Val keeps its identity", () => {
      // By copying time alone a leaf would not earn its record back. What a framework compares
      // is identity: without this, changing `note` would hand `total` a new one and a memoised
      // component reading it would re-render for a change it never saw.
      const before = order();
      expect(Order.patch(before, { note: "changed" }).total).toBe(before.total);
    });

    test("a subtree arriving through a patch is copied, not adopted", () => {
      const foreign = [{ sku: "s", qty: 2 }];
      const after = Order.patch(order(), { lines: foreign as unknown as readonly Line[] });
      foreign[0]!.qty = 999;
      expect(after.lines[0]!.qty).toBe(2);
    });

    test("two values built from one caller object do not share it", () => {
      const foreign = [Line({ sku: "s", qty: 1 })];
      const a = Order({
        id: "a",
        note: "n",
        total: Money({ amount: 1, currency: "JPY" }),
        lines: foreign,
      });
      const b = Order({
        id: "b",
        note: "n",
        total: Money({ amount: 1, currency: "JPY" }),
        lines: foreign,
      });
      expect(a.lines).not.toBe(foreign);
      expect(a.lines).not.toBe(b.lines);
    });

    test("`Val.unwrap` shares nothing, including with a value built by reuse", () => {
      const derived = Order.patch(order(), { note: "changed" });
      const raw = Val.unwrap(derived);
      expect(raw.lines).not.toBe(derived.lines);
      expect(raw.lines[0]).not.toBe(derived.lines[0]);
      // `PayloadOf` keeps a nested Val a Val, so the write goes through an untyped view: the
      // claim under test is about what the copy shares at runtime, not about its type.
      (raw.lines[0] as unknown as { qty: number }).qty = 999;
      expect(derived.lines[0]!.qty).toBe(1);
    });

    test("an unwrapped payload is not adopted when it is sealed again", () => {
      const raw = Val.unwrap(order());
      const resealed = Order(raw);
      expect(resealed.lines).not.toBe(raw.lines);
      (raw.lines[0] as unknown as { qty: number }).qty = 999;
      expect(resealed.lines[0]!.qty).toBe(1);
    });

    test("a write into a reused node is caught in development", () => {
      // The reason the freeze earns its keep: without it this write would land in both values.
      const before = order();
      const after = Order.patch(before, { note: "changed" });
      expect(after.lines).toBe(before.lines);
      expect(() => {
        (after.lines[0] as unknown as { qty: number }).qty = 999;
      }).toThrow(TypeError);
      expect(before.lines[0]!.qty).toBe(1);
    });

    test("a patch that changes nothing gives back the value itself", () => {
      const before = order();
      expect(Order.patch(before, { note: "n" })).toBe(before);
      expect(Order.patch(before, {})).toBe(before);
    });

    test("removing a key the value does not have is not a change", () => {
      const user = User({ id: "a", name: "bob" });
      expect(User.patch(user, { nickname: undefined })).toBe(user);
      expect(
        User.patch(User({ id: "a", name: "bob", nickname: "b" }), { nickname: undefined }),
      ).toEqual({
        id: "a",
        name: "bob",
      });
    });

    test("a transform that returns its argument gives back the value itself", () => {
      const before = order();
      expect(Order.update(before, (o) => o)).toBe(before);
      expect(Order.update(before, (o) => ({ ...o }))).not.toBe(before);
    });

    test("a freshly built child counts as a change", () => {
      // It went through a constructor, so a new instance is what the caller asked for.
      const before = order();
      expect(Order.patch(before, { total: Money({ amount: 1, currency: "JPY" }) })).not.toBe(
        before,
      );
    });

    test("a no-op still goes through a custom seal, which keeps the identity", () => {
      type Tenure = Val<"Tenure", { years: number }>;
      const seen: number[] = [];
      const Tenure = Val.companion<Tenure>().implSeal((t, seal) => {
        seen.push(t.years);
        return { ok: seal(t) };
      });
      const tenure = Tenure.seal({ years: 30 }).ok;
      seen.length = 0;

      const same = Tenure.patch(tenure, { years: 30 });
      expect(seen).toEqual([30]); // the seal ran: it owns the return shape
      expect(same.ok).toBe(tenure); // and the copy inside it handed the value back
    });

    test("reuse does not change what `equals` answers", () => {
      const a = order();
      const b = Order.patch(a, { note: "changed" });
      expect(Order.equals(a, b)).toBe(false);
      expect(Order.equals(b, Order.patch(a, { note: "changed" }))).toBe(true);
      expect(Line.equals(a.lines[0]!, b.lines[0]!)).toBe(true);
    });
  });
});

describe("equals", () => {
  test("defaults to a structural deep comparison", () => {
    expect(User.equals(User({ id: "a", name: "bob" }), User({ id: "a", name: "bob" }))).toBe(true);
    expect(User.equals(User({ id: "a", name: "bob" }), User({ id: "a", name: "sue" }))).toBe(false);
  });

  test("is independent of key order", () => {
    expect(deepEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  test("ignores keys whose value is undefined", () => {
    expect(deepEquals({ a: undefined }, {})).toBe(true);
    expect(deepEquals({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEquals({ a: undefined }, { a: null })).toBe(false);
  });

  test("arrays depend on order", () => {
    expect(deepEquals([1, 2], [2, 1])).toBe(false);
    expect(deepEquals([1, 2], [1, 2])).toBe(true);
    expect(deepEquals([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEquals([1], { 0: 1 })).toBe(false);
  });

  test("NaN equals NaN, and -0 equals 0", () => {
    expect(deepEquals(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEquals([0], [-0])).toBe(true);
  });

  test("bigint and null", () => {
    expect(deepEquals(1n, 1n)).toBe(true);
    expect(deepEquals(1n, 2n)).toBe(false);
    expect(deepEquals(null, {})).toBe(false);
  });

  test("nested Vals are compared structurally", () => {
    const a = User({ id: "a", name: "bob" });
    const b = User({ id: "a", name: "bob" });
    expect(deepEquals({ owner: a }, { owner: b })).toBe(true);
  });

  test("equals can be overridden", () => {
    type Email = Val<"Email", string>;
    const Email = Val.sealer<Email>().implEquals((a, b) => a.toLowerCase() === b.toLowerCase());
    expect(Email.equals(Email("A@b.com"), Email("a@B.com"))).toBe(true);
  });

  test("an override is handed the structural default as a third argument", () => {
    type Doc = Val<"Doc", { id: string; body: string }>;
    // Published docs are identified by id; drafts have no stable one, so they fall
    // back to the structural comparison.
    const Doc = Val.sealer<Doc>().implEquals((a, b, deep) =>
      a.id.startsWith("draft:") ? deep(a, b) : a.id === b.id,
    );

    expect(Doc.equals(Doc({ id: "1", body: "x" }), Doc({ id: "1", body: "edited" }))).toBe(true);
    expect(Doc.equals(Doc({ id: "1", body: "x" }), Doc({ id: "2", body: "x" }))).toBe(false);

    const draft = { id: "draft:1", body: "x" };
    expect(Doc.equals(Doc(draft), Doc({ ...draft }))).toBe(true);
    expect(Doc.equals(Doc(draft), Doc({ ...draft, body: "y" }))).toBe(false);
  });

  test("callers pass two arguments; the third is bound for the override", () => {
    type N = Val<"N", number>;
    const N = Val.sealer<N>().implEquals((a, b, deep) => deep(a, b));

    expect(N.equals(N(1), N(1))).toBe(true);
    expect(N.equals(N(1), N(2))).toBe(false);
    expectTypeOf(N.equals).parameters.toEqualTypeOf<[N, N]>();
  });

  test("an override without the third parameter still works", () => {
    type S = Val<"S", string>;
    const S = Val.sealer<S>().implEquals((a, b) => a.length === b.length);
    expect(S.equals(S("ab"), S("cd"))).toBe(true);
  });

  describe("a spec instead of a function", () => {
    type Money = Val<"Money", { amount: number; currency: string }>;
    type Email = Val<"Email", string>;
    type Line = Val<"Line", { sku: string; qty: number }>;
    type Order = Val<
      "Order",
      {
        id: string;
        note: string;
        total: Money;
        email: Email;
        lines: readonly Line[];
        shipping: { zip: string; city: string };
        span: readonly [number, number];
        updatedAt: number;
      }
    >;

    // Compares on currency alone, so the amount is free to differ.
    const Money = Val.sealer<Money>().implEquals((a, b) => a.currency === b.currency);
    const Email = Val.sealer<Email>().implEquals((a, b) => a.toLowerCase() === b.toLowerCase());
    const Line = Val.sealer<Line>().implEquals((a, b) => a.sku === b.sku);

    const Order = Val.sealer<Order>().implEquals({
      total: Money,
      email: Email,
      lines: [Line],
      shipping: { zip: (a, b) => a.trim() === b.trim() },
      span: [undefined, (a, b) => Math.abs(a - b) <= 1],
      updatedAt: () => true,
    });

    const seed: SeedOf<Order> = {
      id: "o1",
      note: "hi",
      total: Money({ amount: 100, currency: "JPY" }),
      email: Email("a@b.com"),
      lines: [Line({ sku: "s1", qty: 1 })],
      shipping: { zip: "1000001", city: "Tokyo" },
      span: [1, 5],
      updatedAt: 1,
    };
    const order = Order(seed);
    const like = (patch: Partial<typeof seed>): Order => Order({ ...seed, ...patch });

    test("a companion compares the child by its own equality", () => {
      expect(Order.equals(order, like({ total: Money({ amount: 999, currency: "JPY" }) }))).toBe(
        true,
      );
      expect(Order.equals(order, like({ total: Money({ amount: 100, currency: "USD" }) }))).toBe(
        false,
      );
    });

    test("a child with a primitive payload works the same", () => {
      expect(Order.equals(order, like({ email: Email("A@B.COM") }))).toBe(true);
      expect(Order.equals(order, like({ email: Email("z@b.com") }))).toBe(false);
    });

    test("an array applies its one spec to every element", () => {
      expect(Order.equals(order, like({ lines: [Line({ sku: "s1", qty: 99 })] }))).toBe(true);
      expect(Order.equals(order, like({ lines: [Line({ sku: "s2", qty: 1 })] }))).toBe(false);
      expect(Order.equals(order, like({ lines: [] }))).toBe(false);
    });

    test("a tuple applies its specs by position", () => {
      expect(Order.equals(order, like({ span: [1, 6] }))).toBe(true);
      expect(Order.equals(order, like({ span: [2, 5] }))).toBe(false);
    });

    test("a plain nested object descends, and its unnamed keys stay structural", () => {
      expect(Order.equals(order, like({ shipping: { zip: " 1000001 ", city: "Tokyo" } }))).toBe(
        true,
      );
      expect(Order.equals(order, like({ shipping: { zip: "1000001", city: "Osaka" } }))).toBe(
        false,
      );
    });

    test("a spec that ignores its arguments takes the key out of the comparison", () => {
      expect(Order.equals(order, like({ updatedAt: 9999 }))).toBe(true);
    });

    test("keys the spec does not name fall back to the structural default", () => {
      expect(Order.equals(order, like({ note: "bye" }))).toBe(false);
      expect(Order.equals(order, like({ id: "o2" }))).toBe(false);
    });

    test("a key only one side carries fails, as it does structurally", () => {
      type Opt = Val<"Opt", { a: string; b?: string }>;
      const Opt = Val.sealer<Opt>().implEquals({ a: (x, y) => x === y });
      // A key held as `undefined` counts as absent, as it does structurally. EOPT keeps the
      // literal out of the constructor, so it arrives the way a looser caller would send it.
      const absent = Val.of<Opt>({ a: "x", b: undefined } as unknown as SeedOf<Opt>);
      expect(Opt.equals(Opt({ a: "x" }), Opt({ a: "x", b: "y" }))).toBe(false);
      expect(Opt.equals(Opt({ a: "x" }), absent)).toBe(true);
    });

    test("a nested Val holding an array is compared whole, not element by element", () => {
      type Tags = Val<"Tags", readonly string[]>;
      type Post = Val<"Post", { tags: Tags; raw: readonly Email[] }>;
      // Order-insensitive, which no elementwise walk could produce.
      const Tags = Val.sealer<Tags>().implEquals(
        (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join(),
      );
      const Post = Val.sealer<Post>().implEquals({ tags: Tags, raw: [Email] });

      const post = Post({ tags: Tags(["a", "b"]), raw: [Email("x@y.com")] });
      expect(Post.equals(post, Post({ tags: Tags(["b", "a"]), raw: [Email("X@Y.COM")] }))).toBe(
        true,
      );
      expect(Post.equals(post, Post({ tags: Tags(["a", "c"]), raw: [Email("x@y.com")] }))).toBe(
        false,
      );
    });

    test("a spec reaches the top level of an array or tuple Val", () => {
      type Emails = Val<"Emails", readonly Email[]>;
      const Emails = Val.sealer<Emails>().implEquals([Email]);
      expect(Emails.equals(Emails([Email("a@b.com")]), Emails([Email("A@B.COM")]))).toBe(true);
      expect(Emails.equals(Emails([Email("a@b.com")]), Emails([]))).toBe(false);
    });

    test("callers still pass two arguments", () => {
      expectTypeOf(Order.equals).parameters.toEqualTypeOf<[Order, Order]>();
    });
  });
});

describe("patch", () => {
  test("omitting a key leaves it unchanged", () => {
    const u = User({ id: "a", name: "bob", nickname: "bo" });
    expect(User.patch(u, { name: "sue" })).toEqual({
      id: "a",
      name: "sue",
      nickname: "bo",
    });
  });

  test("undefined deletes the key", () => {
    const u = User({ id: "a", name: "bob", nickname: "bo" });
    const next = User.patch(u, { nickname: undefined });
    expect(Object.hasOwn(next, "nickname")).toBe(false);
    expect(next).toEqual({ id: "a", name: "bob" });
  });

  test("does not mutate the original value", () => {
    const u = User({ id: "a", name: "bob" });
    User.patch(u, { name: "sue" });
    expect(u.name).toBe("bob");
  });

  test("goes through a custom seal when one is defined", () => {
    type Account = Val<"Account", { id: string; balance: number }>;
    const Account = Val.companion<Account>().implSeal(
      (a: { id: string; balance: number }, seal): Result<Account> =>
        a.balance >= 0
          ? { ok: true, value: seal(a) }
          : { ok: false, error: "balance must not be negative" },
    );

    const acc = Val.of<Account>({ id: "a", balance: 100 });
    expect(Account.patch(acc, { balance: 50 })).toEqual({
      ok: true,
      value: { id: "a", balance: 50 },
    });
    expect(Account.patch(acc, { balance: -1 })).toEqual({
      ok: false,
      error: "balance must not be negative",
    });

    expectTypeOf(Account.patch(acc, { balance: 1 })).toEqualTypeOf<Result<Account>>();
  });

  test("returns the Val itself when the seal is the default", () => {
    const u = User({ id: "a", name: "bob" });
    expectTypeOf(User.patch(u, { name: "x" })).toEqualTypeOf<User>();
  });

  test("is not offered at all on a non-object Val", () => {
    const ArticleId = Val.sealer<ArticleId>();
    expectTypeOf(ArticleId).not.toHaveProperty("patch");
  });

  test("still guards at runtime, for callers without types", () => {
    const ArticleId = Val.sealer<ArticleId>() as unknown as {
      patch: (...args: unknown[]) => unknown;
    };
    expect(() => ArticleId.patch("a1b2c3", {})).toThrow(/object-shaped/);
  });

  test("with routes through the seal, whatever the seal returns", () => {
    type Box = Val<"Box", { n: number }>;
    const box = Val.sealer<Box>();
    const Box = Val.companion<Box>().implSeal((b: { n: number }) => ({ tagged: box(b) }));
    const out = Box.patch(Val.of<Box>({ n: 1 }), { n: 2 });
    expectTypeOf(out).toEqualTypeOf<{ tagged: Box }>();
    expect(out).toEqual({ tagged: { n: 2 } });
  });

  test("undefined on a required key is a type error", () => {
    const u = User({ id: "a", name: "bob" });
    // @ts-expect-error a required key cannot be deleted
    User.patch(u, { name: undefined });
    // optional keys can be deleted
    User.patch(u, { nickname: undefined });
  });

  describe("nested", () => {
    type City = Val<"City", { name: string; zip?: string }>;
    const City = Val.sealer<City>();

    type Shop = Val<
      "Shop",
      {
        id: string;
        owner: { name: string; contact: { email: string; phone?: string } };
        city: City;
        tags: readonly string[];
        staff: Readonly<Record<string, { role: string }>>;
      }
    >;
    const Shop = Val.sealer<Shop>();
    const shop = () =>
      Shop({
        id: "s",
        owner: { name: "bob", contact: { email: "b@example.com", phone: "1" } },
        city: City({ name: "Kyoto", zip: "600" }),
        tags: ["a"],
        staff: { u1: { role: "cook" }, u2: { role: "waiter" } },
      });

    test("patches a nested object at any depth, leaving its other keys alone", () => {
      expect(Shop.patch(shop(), { owner: { contact: { email: "c@example.com" } } })).toEqual({
        id: "s",
        owner: { name: "bob", contact: { email: "c@example.com", phone: "1" } },
        city: { name: "Kyoto", zip: "600" },
        tags: ["a"],
        staff: { u1: { role: "cook" }, u2: { role: "waiter" } },
      });
    });

    test("undefined deletes at depth too", () => {
      const next = Shop.patch(shop(), { owner: { contact: { phone: undefined } } });
      expect(Object.hasOwn(next.owner.contact, "phone")).toBe(false);
      expect(next.owner.contact.email).toBe("b@example.com");
    });

    test("undefined on a required key is a type error at depth too", () => {
      // @ts-expect-error a required key cannot be deleted, however deep it sits
      Shop.patch(shop(), { owner: { contact: { email: undefined } } });
    });

    test("an unknown key is a type error at depth too", () => {
      // @ts-expect-error excess-property checking reaches the nested literal
      Shop.patch(shop(), { owner: { contact: { fax: "1" } } });
    });

    test("only the path down to the change is rebuilt", () => {
      const before = shop();
      const after = Shop.patch(before, { owner: { contact: { email: "c@example.com" } } });
      expect(after.owner).not.toBe(before.owner);
      expect(after.owner.contact).not.toBe(before.owner.contact);
      expect(after.city).toBe(before.city);
      expect(after.tags).toBe(before.tags);
      expect(after.staff).toBe(before.staff);
    });

    test("a patch that changes nothing at depth gives back the value itself", () => {
      const before = shop();
      expect(Shop.patch(before, { owner: { contact: { email: "b@example.com" } } })).toBe(before);
      expect(Shop.patch(before, { owner: {} })).toBe(before);
    });

    test("a nested Val is replaced whole, never merged", () => {
      // Merging into it would build a payload its own seal never saw.
      // @ts-expect-error a Val takes a Val, not a patch
      Shop.patch(shop(), { city: { name: "Osaka" } });

      const before = shop();
      const after = Shop.patch(before, { city: City({ name: "Osaka" }) });
      expect(Object.hasOwn(after.city, "zip")).toBe(false);
      expect(after.city).not.toBe(before.city);
    });

    test("deriving the nested Val is how you reach inside one", () => {
      const before = shop();
      const after = Shop.patch(before, { city: City.patch(before.city, { name: "Osaka" }) });
      expect(after.city).toEqual({ name: "Osaka", zip: "600" }); // its own `patch` kept the zip
      expect(after.owner).toBe(before.owner);
    });

    test("a subtree taken from another value replaces, since it is a value and not a patch", () => {
      const other = Shop({
        id: "o",
        owner: { name: "sue", contact: { email: "s@example.com" } },
        city: City({ name: "Nara" }),
        tags: [],
        staff: {},
      });
      const after = Shop.patch(shop(), { owner: other.owner });
      expect(after.owner).toBe(other.owner);
      expect(Object.hasOwn(after.owner.contact, "phone")).toBe(false);
    });

    test("an array is replaced, not merged", () => {
      const before = Shop.patch(shop(), { tags: ["a", "b"] });
      expect(Shop.patch(before, { tags: ["c"] }).tags).toEqual(["c"]);

      const other = Shop.patch(before, { tags: ["d"] });
      expect(Shop.patch(before, { tags: other.tags }).tags).toBe(other.tags);
    });

    test("a record of values patches one entry and deletes another", () => {
      const next = Shop.patch(shop(), { staff: { u1: { role: "chef" }, u2: undefined } });
      expect(next.staff).toEqual({ u1: { role: "chef" } });
      expect(Object.hasOwn(next.staff, "u2")).toBe(false);
    });

    test("`update` replaces a nested object where `patch` merges it", () => {
      const before = shop();
      const staff = { u3: { role: "host" } };
      expect(Shop.patch(before, { staff }).staff).toEqual({
        u1: { role: "cook" },
        u2: { role: "waiter" },
        u3: { role: "host" },
      });
      expect(Shop.update(before, (s) => ({ ...s, staff })).staff).toEqual(staff);
    });

    test("goes through the seal, which sees the merged payload", () => {
      type Box = Val<"Box", { inner: { n: number; seen: number } }>;
      const Box = Val.companion<Box>().implSeal((b, seal) =>
        seal({ inner: { ...b.inner, seen: b.inner.seen + 1 } }),
      );
      // `Val.of` skips the seal, so `seen` counts the calls `patch` made: one, at the root.
      const box = Val.of<Box>({ inner: { n: 1, seen: 0 } });
      expect(Box.patch(box, { inner: { n: 2 } })).toEqual({ inner: { n: 2, seen: 1 } });
    });
  });

  describe("a derivation of your own", () => {
    type Point = Val<"Point", { x: number; y: number }>;

    test("a named function in `.impl` reaches the type's own seal", () => {
      const Point = Val.companion<Point>()
        .implSeal((p, seal) => seal({ x: Math.trunc(p.x), y: Math.trunc(p.y) }))
        // The return type is annotated because `Point` is referenced in its own initializer.
        .impl({
          moved: (p, by: { x: number; y: number }): Point =>
            Point.seal({ x: p.x + by.x, y: p.y + by.y }),
        });

      expect(Point.moved(Point.seal({ x: 1, y: 2 }), { x: 2.7, y: 0 })).toEqual({ x: 3, y: 2 });
    });

    test("which is the only route for a primitive Val, since it carries no `patch`", () => {
      type UnixEpoch = Val<"UnixEpoch", number>;
      const UnixEpoch = Val.companion<UnixEpoch>()
        .implSeal((t: number, seal) => seal(Math.trunc(t)))
        .impl({ plus: (t, seconds: number): UnixEpoch => UnixEpoch.seal(t + seconds) });

      expect(UnixEpoch.plus(Val.of<UnixEpoch>(1_756_771_200), 60.5)).toBe(1_756_771_260);
    });
  });
});

describe("update", () => {
  test("value-to-value transform", () => {
    const u = User({ id: "a", name: "bob" });
    expect(User.update(u, (v) => ({ ...v, name: v.name.toUpperCase() }))).toEqual({
      id: "a",
      name: "BOB",
    });
  });

  test("goes through a custom seal when one is defined", () => {
    expect(Age.update(Val.of<Age>(30), (n) => n + 1)).toEqual({ ok: true, value: 31 });
    expect(Age.update(Val.of<Age>(0), (n) => n - 1)).toEqual({
      ok: false,
      error: "age must be a non-negative integer",
    });
  });
});

describe("building", () => {
  describe("sealer", () => {
    test("a bare sealer is a complete companion", () => {
      const ArticleId = Val.sealer<ArticleId>();
      expect(typeof ArticleId).toBe("function");
      expect(ArticleId("a1b2c3")).toBe("a1b2c3");
      expect(ArticleId.equals(ArticleId("a"), ArticleId("a"))).toBe(true);
    });

    test("impl() keeps the constructor it was built from", () => {
      const seal = Val.sealer<User>();
      const withMethods = seal.impl({ shout: (u) => u.name.toUpperCase() });
      expect(typeof withMethods).toBe("function");
      expect(withMethods({ id: "a", name: "bob" })).toEqual({ id: "a", name: "bob" });
      expect(withMethods.shout(Val.of<User>({ id: "a", name: "bob" }))).toBe("BOB");
    });

    test("a step keeps the sealer callable, and leaves the one before it alone", () => {
      const plain = Val.sealer<ArticleId>();
      const loose = plain.implEquals((a, b) => a.length === b.length);
      expect(typeof loose).toBe("function");
      expect(loose("a1b2c3")).toBe("a1b2c3");
      expect(loose.equals(loose("ab"), loose("cd"))).toBe(true);
      expect(plain.equals(plain("ab"), plain("cd"))).toBe(false);
    });

    test("impl() does not mutate the sealer it was built from", () => {
      const seal = Val.sealer<User>();
      seal.impl({ shout: (u) => u.name });
      expect("shout" in seal).toBe(false);
    });

    test("a companion has no constructor: the seal is the only way in", () => {
      expectTypeOf(Age).not.toBeFunction();
      expect(typeof Age).not.toBe("function");
    });

    test("companion() mirrors sealer(), minus the constructor", () => {
      const bare = Val.companion<Age>();
      expect(typeof bare).not.toBe("function");
      expect(bare.equals(Val.of<Age>(1), Val.of<Age>(1))).toBe(true);

      const built = bare.impl({ label: (a) => `${a}` });
      expect(built.label(Val.of<Age>(7))).toBe("7");
      expect("label" in bare).toBe(false);
    });

    test("a sealer has no implSeal: a second, checked seal beside the plain one is a hole", () => {
      expectTypeOf(Val.sealer<User>()).not.toHaveProperty("implSeal");
    });
  });

  describe("impl", () => {
    test("the first parameter is contextually the Val, so it needs no annotation", () => {
      const Greeter = Val.sealer<User>().impl({
        greet(u) {
          expectTypeOf(u).toEqualTypeOf<User>();
          return u.name.toUpperCase();
        },
      });
      expect(Greeter.greet(Greeter({ id: "a", name: "bob" }))).toBe("BOB");
    });

    test("extra parameters are the method's own business", () => {
      const Greeter = Val.sealer<User>().impl({
        greet(u, sep: string) {
          return u.id + sep + u.name;
        },
      });
      expect(Greeter.greet(Greeter({ id: "a", name: "bob" }), "/")).toBe("a/bob");
    });

    test("methods that take no value at all are still fine", () => {
      const Counter = Val.sealer<User>().impl({ anonymous: () => "anonymous", LABEL: "user" });
      expect(Counter.anonymous()).toBe("anonymous");
      expect(Counter.LABEL).toBe("user");
    });

    test("`name` and `length` attach, though a sealer is a function that owns both", () => {
      const Person = Val.sealer<User>().impl({
        name: (u) => u.name.toUpperCase(),
        length: (u) => u.name.length,
      });
      const bob = Person({ id: "a", name: "bob" });
      expect(Person.name(bob)).toBe("BOB");
      expect(Person.length(bob)).toBe(3);
    });

    test("a method whose first parameter is not the Val is rejected", () => {
      Val.sealer<User>().impl({
        // @ts-expect-error the first parameter must be the Val; a factory belongs elsewhere
        fromId(id: string) {
          return id;
        },
      });
    });

    test("`seal` cannot be smuggled in as an ordinary method", () => {
      Val.companion<Age>().impl({
        // @ts-expect-error `seal` belongs to .implSeal(), not to .impl()
        seal: (n: number) => Val.of<Age>(n),
      });
    });

    test("`create` cannot be smuggled in either: it would never reach the seal", () => {
      Val.companion<Age>().impl({
        // @ts-expect-error `create` belongs to .implCreate(), not to .impl()
        create: (n: number) => Val.of<Age>(n),
      });
    });

    test("`patch` and `update` are the library's, not yours", () => {
      Val.companion<User>().impl({
        // @ts-expect-error a derivation with different rules deserves its own name
        patch: (u: User) => u,
      });
      Val.companion<User>().impl({
        // @ts-expect-error same
        update: (u: User) => u,
      });
    });
  });

  describe("implSeal", () => {
    type Score = Val<"Score", { points: number }>;
    type Email = Val<"Email", string>;
    type Point = Val<"Point", { x: number; y: number }>;

    test("registers `seal` and routes with / update through it, without any impl", () => {
      const Score = Val.companion<Score>().implSeal((s: { points: number }, seal): Result<Score> =>
        s.points >= 0
          ? { ok: true, value: seal(s) }
          : { ok: false, error: "points must not be negative" },
      );

      const s = Val.of<Score>({ points: 3 });
      expectTypeOf(Score.patch(s, { points: 1 })).toEqualTypeOf<Result<Score>>();
      expect(Score.patch(s, { points: -1 })).toEqual({
        ok: false,
        error: "points must not be negative",
      });
      expect(Score.equals(s, Val.of<Score>({ points: 3 }))).toBe(true);
    });

    test("methods added afterwards keep the contextual type and the routing", () => {
      const Score = Val.companion<Score>()
        .implSeal((s, seal) => {
          expectTypeOf(s).toEqualTypeOf<{ readonly points: number }>();
          return seal(s);
        })
        .impl({
          double(v) {
            expectTypeOf(v).toEqualTypeOf<Score>();
            return v.points * 2;
          },
        });

      const s = Score.seal({ points: 3 });
      expect(Score.double(s)).toBe(6);
      expectTypeOf(Score.patch(s, { points: 1 })).toEqualTypeOf<Score>();
    });

    test("is optional: a companion with no seal is a behaviour bundle over Val.of", () => {
      type UserId = Val<"UserId", string>;
      const UserId = Val.companion<UserId>().impl({
        short(id) {
          expectTypeOf(id).toEqualTypeOf<UserId>();
          return id.slice(0, 8);
        },
      });

      const id = Val.of<UserId>("0123456789");
      expect(UserId.short(id)).toBe("01234567");
      expect(UserId.equals(id, Val.of<UserId>("0123456789"))).toBe(true);
      expectTypeOf(UserId).not.toHaveProperty("seal");
    });

    test("the default seal comes in as a second parameter, so Val.of is not needed", () => {
      const Email = Val.companion<Email>().implSeal((s: string, seal) => {
        expectTypeOf(seal).toEqualTypeOf<(value: string) => Email>();
        return seal(s.trim().toLowerCase());
      });

      const e = Email.seal("  A@B.com ");
      expectTypeOf(e).toEqualTypeOf<Email>();
      expect(e).toBe("a@b.com");
      expectTypeOf(Email.seal).parameters.toEqualTypeOf<[string]>();
    });

    test("the default seal copies, so the value is detached from the raw payload", () => {
      type Box = Val<"Box", { tags: string[] }>;
      const Box = Val.companion<Box>().implSeal((b, seal) => seal(b));
      const raw = { tags: ["a"] };
      const b = Box.seal(raw);
      raw.tags.push("b");
      expect(b.tags).toEqual(["a"]);
    });

    test("the seal accepts an existing value as readily as a raw payload", () => {
      const Score = Val.companion<Score>().implSeal((s, seal) => seal(s));
      const s = Val.of<Score>({ points: 3 });
      expect(Score.seal(s)).toEqual({ points: 3 });
    });

    test("seal may return a Result (the library never inspects it)", () => {
      expect(Age.seal(30)).toEqual({ ok: true, value: 30 });
      expect(Age.seal(-1)).toEqual({ ok: false, error: "age must be a non-negative integer" });
    });

    test("construct in normal form", () => {
      const Email = Val.companion<Email>().implSeal((s: string, seal) =>
        seal(s.trim().toLowerCase()),
      );
      expect(Email.seal("  A@B.com ")).toBe("a@b.com");
      // normalised at construction, so a parent's structural comparison is correct
      expect(deepEquals(Email.seal(" a@b.com"), Email.seal("A@B.COM"))).toBe(true);
    });

    test("a constructor that cannot take the payload is rejected where it is written", () => {
      const point = Val.sealer<Point>();
      Val.companion<Point>().implSeal(
        // @ts-expect-error a seal must accept the whole payload; this one takes two numbers
        (x: number, y: number) => point({ x, y }),
      );
    });

    describe("the seal's parameter", () => {
      type Email = Val<"Email", string>;

      test("a parameter wider than the payload is fine while it excludes strings", () => {
        const wide = Val.companion<User>().implSeal((u: object, seal) => seal(u as SeedOf<User>));
        const record = Val.companion<User>().implSeal((u: Record<string, unknown>, seal) =>
          seal(u as SeedOf<User>),
        );
        const raw = { id: "a", name: "bob" };
        expect(wide.seal(raw)).toEqual(raw);
        expect(record.seal(raw)).toEqual(raw);
      });

      test("a parameter that also accepts a string is rejected", () => {
        // @ts-expect-error a seal takes the payload, not a wire format
        Val.companion<User>().implSeal((u: unknown, seal) => seal(u as SeedOf<User>));
        // @ts-expect-error `{}` accepts a string too
        Val.companion<User>().implSeal((u: {}, seal) => seal(u as SeedOf<User>));
        // @ts-expect-error a primitive payload has nothing to parse
        Val.companion<Age>().implSeal((n: unknown, seal) => seal(n as number));
        // @ts-expect-error widening to include a string is the same hole
        Val.companion<Age>().implSeal((n: number | string, seal) => seal(n as number));
      });

      test("a payload that is a string is exempt", () => {
        const Email = Val.companion<Email>().implSeal((e: unknown, seal) => seal(e as string));
        expect(Email.seal("a@b.com")).toBe("a@b.com");
      });
    });
  });

  describe("implCreate", () => {
    test("alone it still derives: the default seal is a payload function too", () => {
      type Point = Val<"Point", { x: number; y: number }>;
      const Point = Val.companion<Point>().implCreate((x: number, y: number) => ({ x, y }));

      const p = Point.create(1, 2);
      expect(p).toEqual({ x: 1, y: 2 });
      expectTypeOf(p).toEqualTypeOf<Point>();
      expect(Point.patch(p, { x: 3 })).toEqual({ x: 3, y: 2 });
      expect(Point.update(p, (v) => ({ ...v, y: 9 }))).toEqual({ x: 1, y: 9 });
    });

    test("what create returns is sealed: it is not a way past the seal", () => {
      type Score = Val<"Score", { points: number }>;
      const Score = Val.companion<Score>()
        .implCreate((points: number) => ({ points }))
        .implSeal((s: SeedOf<Score>, seal): Result<Score> =>
          s.points >= 0
            ? { ok: true, value: seal(s) }
            : { ok: false, error: "points must not be negative" },
        );

      expect(Score.create(3)).toEqual({ ok: true, value: { points: 3 } });
      expect(Score.create(-1)).toEqual({ ok: false, error: "points must not be negative" });
      expectTypeOf(Score.create(1)).toEqualTypeOf<Result<Score>>();
    });

    test("create and seal compose: with re-seals, never re-running create", () => {
      type Member = Val<"Member", { id: string; name: string }>;
      type Fields = Omit<SeedOf<Member>, "id">;

      let minted = 0;
      const Member = Val.companion<Member>()
        .implCreate((f: Fields): SeedOf<Member> => {
          minted += 1;
          return { id: `id-${minted}`, ...f };
        })
        .implSeal((m: SeedOf<Member>, seal) => seal(m));

      const m = Member.create({ name: "bob" });
      expect(m).toEqual({ id: "id-1", name: "bob" });

      const renamed = Member.patch(m, { name: "sue" });
      expect(renamed).toEqual({ id: "id-1", name: "sue" });
      expect(minted).toBe(1);
      expectTypeOf(renamed).toEqualTypeOf<Member>();
    });
  });

  describe("fixed", () => {
    type Account = Val<"app/Account", { id: string; owner: string; note: string }>;
    type Fields = Omit<SeedOf<Account>, "id">;

    // The counter is closed over per companion, so a test never reads another test's ids.
    const account = () => {
      let minted = 0;
      return Val.companion<Account>()
        .implCreate((f: Fields): SeedOf<Account> => {
          minted += 1;
          return { id: `id-${minted}`, ...f };
        })
        .implSeal((a, seal) => seal({ ...a, owner: a.owner.trim().toLowerCase() }))
        .fixed<"id">();
    };

    test("create mints the id; with and update preserve it", () => {
      const Account = account();
      const a = Account.create({ owner: "bob", note: "" });
      expect(a.id).toBe("id-1");

      // still `id-1`, so neither path re-ran create
      const b = Account.patch(a, { owner: " SUE " });
      expect(b).toEqual({ id: "id-1", owner: "sue", note: "" }); // normalised by the seal

      const c = Account.update(b, (v) => ({ owner: v.owner, note: "seen" }));
      expect(c).toEqual({ id: "id-1", owner: "sue", note: "seen" });
    });

    test("the id is not reachable through either update path", () => {
      const Account = account();
      const a = Account.create({ owner: "bob", note: "" });
      expectTypeOf(Account.patch).parameters.toEqualTypeOf<[Account, Patch<Fields>]>();
      // @ts-expect-error id is not patchable
      Account.patch(a, { id: "forged" });
      // @ts-expect-error the transform cannot return an id either
      Account.update(a, (v) => ({ ...v, id: "forged" }));
    });

    test("the callback returns only what is left, and the rest is merged back on", () => {
      const Account = account();
      const a = Account.create({ owner: "bob", note: "x" });
      expectTypeOf(
        Account.update(a, (v) => ({ owner: v.owner, note: "y" })),
      ).toEqualTypeOf<Account>();
      expect(Account.update(a, (v) => ({ owner: v.owner, note: "y" })).id).toBe(a.id);
    });

    test("keys must exist on the payload", () => {
      // @ts-expect-error there is no such field
      Val.companion<Account>().fixed<"nope">();
    });
  });

  describe("implTrait", () => {
    type Greetable = Trait<
      "Greetable",
      { name: string },
      {
        greet: (self: Self) => string;
        toWire: (self: Self, sep: string) => string;
        shout: Final<(self: Self) => string>;
      }
    >;
    const Greetable = Trait.companion<Greetable>().impl({
      greet: (g) => `Hi, ${g.name}`, // a Val may replace this one
      shout: (g) => g.name.toUpperCase(), // declared Final: no Val may
    });

    type Member = Val<"Member", { id: string; name: string }, Greetable>;
    const Member = Val.companion<Member>().implTrait(Greetable, {
      toWire: (m, sep) => `${m.id}${sep}${m.name}`,
    });

    type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
    const Admin = Val.companion<Admin>().implTrait(Greetable, {
      toWire: (a, sep) => `admin${sep}${a.name}`,
      greet: (a) => `Sir ${a.name}`,
    });

    const member = Val.of<Member>({ id: "a", name: "alice" });
    const admin = Val.of<Admin>({ name: "root", level: 9 });

    test("a member without a default is the Val's own", () => {
      expect(Member.toWire(member, ":")).toBe("a:alice");
    });

    test("a member with a default is taken unless implTrait passes one", () => {
      expect([Member.greet(member), Admin.greet(admin)]).toEqual(["Hi, alice", "Sir root"]);
    });

    test("a member without a default must be implemented", () => {
      // @ts-expect-error `toWire` is missing
      Val.companion<Member>().implTrait(Greetable, {});
    });

    test("the type must declare the trait", () => {
      type Plain = Val<"Plain", { id: string; name: string }>;
      Val.companion<Plain>().implTrait(
        // @ts-expect-error the type does not declare this trait
        Greetable,
        { toWire: (p, sep) => `${p.id}${sep}` },
      );
    });

    test("the payload must hold what the trait requires", () => {
      type Bad = Val<"Bad", { id: string }, Greetable>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error the payload does not hold what this trait requires
      Val.companion<Bad>();
      // @ts-expect-error same
      Val.sealer<Bad>();
    });

    test("a trait requiring nothing of the members still requires its fields", () => {
      type Provable = Trait<"Provable", { theorem: string }, Record<never, never>>;
      type Bad = Val<"Bad", Record<never, never>, Provable>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error the payload does not hold what this trait requires
      Val.sealer<Bad>();
    });

    // Left to `implTrait`, the mistake answered "the type does not declare this trait" about a
    // trait the declaration names, and a payload holding neither shape had passed on the way.
    test("several traits are one intersection, and a union is rejected", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      type Either = Val<"Either", { id: string }, Greetable | Weighed>;
      expectTypeOf<Either>().not.toExtend<AnyVal>();
      // @ts-expect-error declare several traits with `&`, not `|`
      Val.companion<Either>();

      type Both = Val<"Both", { name: string; kg: number }, Greetable & Weighed>;
      expectTypeOf<Both>().toExtend<AnyVal>();
    });

    test("a sealer keeps its constructor", () => {
      type Point = Val<"Point", { name: string; x: number }, Greetable>;
      const Point = Val.sealer<Point>()
        .implTrait(Greetable, { toWire: (p, sep) => `${p.name}${sep}${p.x}` })
        .impl({ shifted: (p) => p.x + 1 });
      const p = Point({ name: "o", x: 1 });
      expect([Point.toWire(p, ":"), Point.shifted(p), Point.greet(p)]).toEqual(["o:1", 2, "Hi, o"]);
    });

    test("create, seal, fixed and patch keep working beside a trait", () => {
      type Ticket = Val<"Ticket", { id: string; name: string }, Greetable>;
      const Ticket = Val.companion<Ticket>()
        .implCreate((name: string) => ({ id: "t1", name }))
        .implSeal((seed, seal) => seal(seed))
        .fixed<"id">()
        .implTrait(Greetable, { toWire: (t, sep) => `${t.id}${sep}${t.name}` });
      const t = Ticket.create("alice");
      expect([t.id, Ticket.greet(t), Ticket.patch(t, { name: "bob" }).name]).toEqual([
        "t1",
        "Hi, alice",
        "bob",
      ]);
      expect(Ticket.update(t, () => ({ name: "carol" })).id).toBe("t1");
    });

    test("equals stays the structural default", () => {
      expect(Member.equals(member, Val.of<Member>({ name: "alice", id: "a" }))).toBe(true);
    });

    describe("a trait that implements nothing of its own", () => {
      type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
      type Row = Val<"Row", { id: string; n: number }, Wired>;
      const Row = Val.companion<Row>().implTrait<Wired>({
        toWire: (r, sep) => `${r.id}${sep}${r.n}`,
      });

      test("takes the type argument in place of a companion", () => {
        expect(Row.toWire(Val.of<Row>({ id: "r", n: 1 }), ":")).toBe("r:1");
      });

      // The parameter is the sentence itself where a check fails, so these implementations are
      // annotated: an object literal takes no contextual type from a string.
      test("still answers to the checks the companion carried", () => {
        type Plain = Val<"Plain", { id: string }>;
        const plain = { toWire: (p: Plain, sep: string) => `${p.id}${sep}` };
        // @ts-expect-error the type does not declare this trait
        Val.companion<Plain>().implTrait<Wired>(plain);

        type Note = Val<"Note", { id: string; name: string }, Greetable>;
        const note = { toWire: (n: Note, sep: string) => `${n.id}${sep}` };
        // @ts-expect-error a member cannot take the name of a field the payload holds
        Val.companion<Note>().implTrait<Wired>(note);
      });

      test("but a trait with a Final member needs one", () => {
        type Note = Val<"Note", { id: string; name: string }, Greetable>;
        const note = {
          greet: (n: Note) => n.name,
          toWire: (n: Note, sep: string) => `${n.id}${sep}`,
          shout: (n: Note) => n.name,
        };
        // @ts-expect-error this trait implements members of its own: pass its companion
        Val.companion<Note>().implTrait<Greetable>(note);
      });
    });

    describe("a Final member", () => {
      test("every implementing companion answers to it, with the trait's own function", () => {
        expect([Member.shout(member), Admin.shout(admin)]).toEqual(["ALICE", "ROOT"]);
        expect(Member.shout).toBe(Greetable.shout);
      });

      test("a Val cannot override it", () => {
        Val.companion<Member>().implTrait(Greetable, {
          toWire: (m, sep) => `${m.id}${sep}`,
          // @ts-expect-error a Final member is not the Val's to implement
          shout: (m: Member) => m.name,
        });
      });

      test("nor through a payload the excess property check does not read", () => {
        const carried = {
          toWire: (m: Member, sep: string) => `${m.id}${sep}`,
          shout: (m: Member) => m.name,
        };
        // @ts-expect-error a Final member is declared `never`, so a variable carries no override in
        Val.companion<Member>().implTrait(Greetable, carried);
      });

      test("a companion that skipped one cannot be implemented", () => {
        Val.companion<Member>().implTrait(
          // @ts-expect-error this trait's companion has not implemented every member declared Final
          Trait.companion<Greetable>().impl({ greet: (g: { name: string }) => g.name }),
          { toWire: (m, sep) => `${m.id}${sep}` },
        );
      });
    });

    describe("more than one trait", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      const Weighed = Trait.companion<Weighed>().impl({ heavy: (w) => w.kg > 10 });
      type Crate = Val<"Crate", { id: string; name: string; kg: number }, Greetable & Weighed>;
      const Crate = Val.companion<Crate>()
        .implTrait(Greetable, { toWire: (c, sep) => `${c.id}${sep}${c.name}` })
        .implTrait(Weighed);
      const crate = Val.of<Crate>({ id: "c", name: "box", kg: 20 });

      test("a step keeps what the one before it registered", () => {
        expect([Crate.toWire(crate, ":"), Crate.greet(crate), Crate.heavy(crate)]).toEqual([
          "c:box",
          "Hi, box",
          true,
        ]);
      });

      test("a Final stays the trait's own, however many traits the Val implements", () => {
        expect(Crate.shout(crate)).toBe("BOX");
        expect(Crate.shout).toBe(Greetable.shout);
      });

      test("one may be left unimplemented: it is then a declaration and nothing more", () => {
        const Half = Val.companion<Crate>().implTrait(Greetable, {
          toWire: (c, sep) => `${c.id}${sep}`,
        });
        expect(Half.greet(crate)).toBe("Hi, box");
        expectTypeOf(Half).not.toHaveProperty("heavy");
        expect("heavy" in Half).toBe(false);
        // @ts-expect-error nor can a box reach one: this threw at run time
        Weighed.dyn(Half, crate);
      });

      test("but the same trait cannot be implemented twice", () => {
        Val.companion<Crate>()
          .implTrait(Greetable, { toWire: (c, sep) => `${c.id}${sep}` })
          // @ts-expect-error another trait already answers to one of these names
          .implTrait(Greetable, { toWire: (c, sep) => `${c.name}${sep}` });
      });

      test("two traits on one Val may not answer to the same name", () => {
        type Other = Trait<
          "Other",
          { name: string },
          { toWire: (self: Self, sep: string) => number }
        >;
        const Other = Trait.companion<Other>().impl({});
        type Twice = Val<"Twice", { id: string; name: string }, Greetable & Other>;
        Val.companion<Twice>()
          .implTrait(Greetable, { toWire: (t, sep) => `${t.id}${sep}` })
          // @ts-expect-error another trait already answers to one of these names
          .implTrait(Other, { toWire: (t, sep) => t.id.length + sep.length });
      });

      test("nor to the same final", () => {
        type Yelling = Trait<"Yelling", { name: string }, { shout: Final<(self: Self) => string> }>;
        const Yelling = Trait.companion<Yelling>().impl({ shout: (y) => y.name });
        type Crier = Val<"Crier", { id: string; name: string }, Greetable & Yelling>;
        Val.companion<Crier>()
          .implTrait(Greetable, { toWire: (c, sep) => `${c.id}${sep}` })
          // @ts-expect-error another trait already answers to one of these names
          .implTrait(Yelling);
      });

      test("but they may require the same field", () => {
        type Weighing = Trait<"Weighing", { name: string }, { kilos: (self: Self) => number }>;
        const Weighing = Trait.companion<Weighing>().impl({ kilos: () => 0 });
        type Parcel = Val<"Parcel", { id: string; name: string }, Greetable & Weighing>;
        const Parcel = Val.companion<Parcel>()
          .implTrait(Greetable, { toWire: (p, sep) => `${p.id}${sep}` })
          .implTrait(Weighing);
        const p = Val.of<Parcel>({ id: "p", name: "box" });
        expect([Parcel.greet(p), Parcel.kilos(p)]).toEqual(["Hi, box", 0]);
      });

      test("unless no payload satisfies both", () => {
        type Sized = Trait<"Sized", { name: number }, { half: (self: Self) => number }>;
        type Both = Val<"Both", { name: string }, Greetable & Sized>;
        expectTypeOf<Both>().not.toExtend<AnyVal>();
        // @ts-expect-error the payload does not hold what this trait requires
        Val.companion<Both>();
      });
    });

    describe("names", () => {
      test("a companion may not grow a function over a member", () => {
        Val.companion<Member>()
          .implTrait(Greetable, { toWire: (m, sep) => `${m.id}${sep}` })
          // @ts-expect-error a trait already answers to this name
          .impl({ greet: (m) => `yo ${m.name}` });
      });

      test("nor over a final function", () => {
        Val.companion<Member>()
          .implTrait(Greetable, { toWire: (m, sep) => `${m.id}${sep}` })
          // @ts-expect-error a trait already answers to this name
          .impl({ shout: (m) => m.name });
      });

      test("nor may a companion grow one over the record `dyn` reads", () => {
        Val.companion<Member>()
          .implTrait(Greetable, { toWire: (m, sep) => `${m.id}${sep}` })
          .impl({
            // @ts-expect-error the library keeps this one: a function here would leave `dyn` unbound
            __valof_traits: (m: Member) => m.name,
          });
      });

      test("nor may it grow one over a step's name", () => {
        Val.companion<Member>().impl({
          // @ts-expect-error the `impl` prefix is the library's
          implTrait: (m: Member) => m.name,
        });
      });

      test("a member may not take a name the payload holds", () => {
        type Loud = Trait<"Loud", { name: string }, { greet: (self: Self) => string }>;
        const Loud = Trait.companion<Loud>().impl({ greet: (l) => l.name });
        type Sign = Val<"Sign", { name: string; greet: string }, Loud>;
        Val.companion<Sign>().implTrait(
          // @ts-expect-error a member cannot take the name of a field the payload holds
          Loud,
        );
      });
    });
  });
});
