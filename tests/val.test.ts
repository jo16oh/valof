import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type {
  AnyVal,
  Patch,
  PayloadOf,
  PrivateCreate,
  PrivateSeal,
  Rec,
  SeedOf,
  Unpatchable,
} from "../src/index.ts";
import { equals, Trait, Val, type Final, type Self } from "../src/index.ts";
import { Traits } from "../src/keys.ts";
// `BrandOf` is not published from the entry point.
import type {
  BrandOf,
  CallBuildFirst,
  CompanionMembers,
  Takes,
  Verdict,
  Wired,
} from "../src/val.ts";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// The verdict is a private field, so it is read through the class rather than by a key.
type VerdictOf<V> = V extends Verdict<infer X> ? X : never;

type User = Val<"app/User", { id: string; name: string; nickname?: string }>;
type Age = Val<"Age", number>;
type ArticleId = Val<"ArticleId", string>;
type Tags = Val<"Tags", Record<string, true>>;
type Grid = Val<"Grid", number[][]>;

const User = Val.companion<User>().build();
const Age = Val.companion<Age>()
  .implSeal((n: number, seal): Result<Age> =>
    n >= 0 && Number.isInteger(n)
      ? { ok: true, value: seal(n) }
      : { ok: false, error: "age must be a non-negative integer" },
  )
  .build();

describe("Val", () => {
  describe("of", () => {
    test("returns an equal value, copied", () => {
      const raw = { id: "a", name: "alice" };
      const user = Val.of<User>(raw);
      expect(user).toEqual(raw);
      expect(user).not.toBe(raw);
    });

    test("can adopt an explicitly-owned payload", () => {
      const raw = { id: "a", name: "alice" } as const;
      const user = Val.of.nocopy<User>(raw);
      expect(user).toBe(raw);
      expect(Object.isFrozen(raw)).toBe(true);
    });
  });

  describe("nocopy", () => {
    test("keeps every identity and freezes the adopted graph", () => {
      const tags: readonly string[] = ["one"];
      const raw = { id: "a", name: "alice", tags } as const;
      const user = Val.companion<Val<"NocopyUser", typeof raw>>().build().seal.nocopy(raw);
      expect(user).toBe(raw);
      expect(user.tags).toBe(raw.tags);
      expect(Object.isFrozen(raw)).toBe(true);
      expect(Object.isFrozen(raw.tags)).toBe(true);
    });

    test("requires a deeply readonly default seal's input", () => {
      type NocopyUser = Val<"NocopyUser", { id: string; tags: string[]; nested: { n: number } }>;
      const NocopyUser = Val.companion<NocopyUser>().build();
      const readonly: {
        readonly id: string;
        readonly tags: readonly string[];
        readonly nested: { readonly n: number };
      } = {
        id: "a",
        tags: ["one"],
        nested: { n: 1 },
      };
      const mutable = { id: "a", tags: ["one"], nested: { n: 1 } };
      const mutableArray: {
        readonly id: string;
        readonly tags: string[];
        readonly nested: { readonly n: number };
      } = { id: "a", tags: ["one"], nested: { n: 1 } };
      NocopyUser.seal.nocopy(readonly);
      // @ts-expect-error writable properties are not ownership evidence
      NocopyUser.seal.nocopy(mutable);
      // @ts-expect-error mutable arrays are not ownership evidence
      NocopyUser.seal.nocopy(mutableArray);
      NocopyUser.seal.nocopy({ id: "a", tags: ["one"], nested: { n: 1 } });
    });

    test("accepts readonly optional properties and tuples", () => {
      type WithOptional = Val<"WithOptional", { name: string; nickname?: string }>;
      const WithOptional = Val.companion<WithOptional>().build();
      const optionalSeed: SeedOf<WithOptional> = { name: "a" };

      type WithTuple = Val<
        "WithTuple",
        { pair: [string, number]; optionalPair: [string, number?] }
      >;
      const WithTuple = Val.companion<WithTuple>().build();
      const tupleSeed: SeedOf<WithTuple> = {
        pair: ["a", 1],
        optionalPair: ["b"],
      };
      const mutableTuple: {
        readonly pair: [string, number];
        readonly optionalPair: readonly [string, number?];
      } = { pair: ["a", 1], optionalPair: ["b"] };

      WithOptional.seal.nocopy(optionalSeed);
      WithTuple.seal.nocopy(tupleSeed);
      // @ts-expect-error mutable tuples are not ownership evidence
      WithTuple.seal.nocopy(mutableTuple);
    });

    test("accepts a fresh object literal", () => {
      type Plain = Val<"Plain", { id: string; name: string }>;
      Val.companion<Plain>().build().seal.nocopy({ id: "a", name: "alice" });
    });

    test("accepts a readonly array as the root payload", () => {
      type Names = Val<"Names", string[]>;
      const Names = Val.companion<Names>().build();
      const seed: readonly string[] = ["alice", "bob"];

      expect(Names.seal.nocopy(seed)).toBe(seed);
    });

    test("stops the readonly type check at a nested Val", () => {
      type Address = Val<"Address", { street: string }>;
      type Customer = Val<"Customer", { address: Address }>;
      const Customer = Val.companion<Customer>().build();
      const address = Val.of<Address>({ street: "main" });
      const seed: { readonly address: Address } = { address };

      expect(Customer.seal.nocopy(seed).address).toBe(address);
    });

    test("rejects unsupported adopted graphs in development", () => {
      type Point = Val<"NocopyPoint", { x: number }>;
      const Point = Val.companion<Point>().build();
      const accessor = {};
      Object.defineProperty(accessor, "x", {
        get() {
          return 1;
        },
      });
      class Source {
        x = 1;
      }
      const cyclic: { x: number; self?: unknown } = { x: 1 };
      Object.defineProperty(cyclic, "self", { value: cyclic });

      expect(() => Point.seal.nocopy(accessor as never)).toThrow(/accessor/);
      expect(() => Point.seal.nocopy(new Source() as never)).toThrow(/plain objects/);
      expect(() => Point.seal.nocopy(cyclic as never)).toThrow(/cycle/);
    });

    test("freezes children stored in non-enumerable data properties", () => {
      type Point = Val<"NocopyPoint", { x: number }>;
      const Point = Val.companion<Point>().build();
      const child = { y: 2 };
      const raw = { x: 1 } as const;
      Object.defineProperty(raw, "child", { value: child });

      expect(Point.seal.nocopy(raw)).toBe(raw);
      expect(Object.isFrozen(raw)).toBe(true);
      expect(Object.isFrozen(child)).toBe(true);
    });
  });

  describe("unwrap", () => {
    test("hands back a mutable copy", () => {
      type Post = Val<"Post", { title: string; tags: string[] }>;
      const Post = Val.companion<Post>().build();
      const post = Post.seal({ title: "t", tags: ["a"] });

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
      const ArticleId = Val.companion<ArticleId>().build();
      expect(Val.unwrap(ArticleId.seal("a1b2c3"))).toBe("a1b2c3");

      const Tags = Val.companion<Val<"Tags", string[]>>().build();
      const tags = Tags.seal(["a", "b"]);
      const raw = Val.unwrap(tags);
      expect(raw).toEqual(["a", "b"]);
      expect(raw).not.toBe(tags);
    });

    test("a nested Val comes back as data", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Order = Val<"Order", { id: string; total: Money }>;
      const Money = Val.companion<Money>().build();
      const Order = Val.companion<Order>().build();
      const order = Order.seal({ id: "o", total: Money.seal({ amount: 1, currency: "JPY" }) });

      const raw = Val.unwrap(order);
      expect(raw).toEqual({ id: "o", total: { amount: 1, currency: "JPY" } });
      expectTypeOf(raw).toEqualTypeOf<{
        id: string;
        total: { amount: number; currency: string };
      }>();
    });

    test("a Val nested two deep comes back as data too", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Line = Val<"Line", { price: Money }>;
      type Order = Val<"Order", { line: Line }>;
      expectTypeOf<PayloadOf<Order>>().toEqualTypeOf<{
        line: { price: { amount: number; currency: string } };
      }>();
    });

    test("a nested Val must pass its own seal again", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Order = Val<"Order", { id: string; total: Money }>;
      const Money = Val.companion<Money>().build();
      const Order = Val.companion<Order>().build();
      const raw = Val.unwrap(
        Order.seal({ id: "o", total: Money.seal({ amount: 1, currency: "JPY" }) }),
      );

      // @ts-expect-error `total` is data now, not a Money
      Order.seal(raw);
      Order.seal({ ...raw, total: Money.seal(raw.total) });
    });
  });

  describe("payloads", () => {
    test("a primitive can be wrapped directly", () => {
      const ArticleId = Val.companion<ArticleId>().build();
      const id = ArticleId.seal("a1b2c3");
      expect(id).toBe("a1b2c3");
      expectTypeOf(id).toExtend<string>();
    });

    test("a Record works as a Set", () => {
      const Tags = Val.companion<Tags>().build();
      const t = Tags.seal({ a: true, b: true });
      expect(t.a).toBe(true);
      expect(t.c).toBeUndefined();
    });

    test("optional keys are allowed", () => {
      type Allowed = Val<"Allowed", { nickname?: string }>;
      expectTypeOf<Allowed>().toExtend<AnyVal>();
    });

    // `{}` takes every value but `null` and `undefined`.
    test("an empty payload takes an object, an existing value included, and nothing else", () => {
      type Marker = Val<"Marker", {}>;
      const Marker = Val.companion<Marker>().build();
      expectTypeOf(Marker.seal({})).toExtend<SeedOf<Marker>>();
      expectTypeOf<string>().not.toExtend<SeedOf<Marker>>();
      expectTypeOf<number[]>().not.toExtend<SeedOf<Marker>>();
      expectTypeOf<Promise<void>>().not.toExtend<SeedOf<Marker>>();
    });

    test("so does an empty object nested in a payload", () => {
      type Tagged = Val<"Tagged", { meta: {}; list: {}[] }>;
      expectTypeOf<{ meta: string; list: [] }>().not.toExtend<SeedOf<Tagged>>();
      expectTypeOf<{ meta: {}; list: string[] }>().not.toExtend<SeedOf<Tagged>>();
      type Pair = Val<"Pair", [{}, number]>;
      expectTypeOf<[string, number]>().not.toExtend<SeedOf<Pair>>();
    });

    test("Vals, arrays, records and primitives are allowed", () => {
      expectTypeOf<Val<"A", string>>().toExtend<AnyVal>();
      expectTypeOf<Val<"C", string[]>>().toExtend<AnyVal>();
      expectTypeOf<Val<"D", Record<string, true>>>().toExtend<AnyVal>();
      expectTypeOf<Val<"E", { at: Val<"A", string>; n: number | null }>>().toExtend<AnyVal>();
    });

    test("a tuple keeps its positions, its length and its labels", () => {
      type Point = Val<"Point", string>;
      const Point = Val.companion<Point>().build();
      type Pair = Val<"Pair", { at: [Point, number] }>;
      const Pair = Val.companion<Pair>().build();

      const p = Pair.seal({ at: [Point.seal("a"), 1] });

      expectTypeOf(p.at).toEqualTypeOf<readonly [Point, number]>();
      expectTypeOf(p.at[0]).toEqualTypeOf<Point>();
      expectTypeOf(p.at.length).toEqualTypeOf<2>();
      expect(Val.unwrap(p).at).toEqual(["a", 1]);

      // @ts-expect-error the positions are not interchangeable
      Pair.seal({ at: [1, Point.seal("a")] });
    });

    test("an optional element is allowed; a rest element falls back to an array", () => {
      type Opt = Val<"Opt", { at: [string, number?] }>;
      expectTypeOf<Opt>().toExtend<AnyVal>();
      expectTypeOf<SeedOf<Opt>["at"][0]>().toEqualTypeOf<string>();
      expectTypeOf<SeedOf<Opt>["at"][1]>().toEqualTypeOf<number | undefined>();

      // A rest element makes `length` plain `number`, which is what tells a tuple from an array,
      // so this one is read as an array. Positions are lost, nothing is unsound.
      type Rest = Val<"Rest", { at: [string, ...number[]] }>;
      expectTypeOf<SeedOf<Rest>["at"]>().toEqualTypeOf<readonly (string | number)[]>();
    });

    test("nested arrays", () => {
      const Grid = Val.companion<Grid>().build();
      const g = Grid.seal([
        [1, 2],
        [3, 4],
      ]);
      expect(g[1]?.[0]).toBe(3);
    });
  });

  describe("rejected payloads", () => {
    test("the rule that rejected a payload is carried in the verdict", () => {
      type BadFn = Val<"Bad", { run: () => void }>;
      expectTypeOf<VerdictOf<BadFn>>().toEqualTypeOf<{
        run: { readonly __valError: "functions are not allowed" };
      }>();

      type BadSymbol = Val<"Bad", symbol>;
      expectTypeOf<VerdictOf<BadSymbol>>().toEqualTypeOf<{
        readonly __valError: "not a plain value";
      }>();
    });

    test("the rules reach inside a tuple", () => {
      type Element<V> = VerdictOf<V> extends { at: [infer A, unknown] } ? A : never;

      type BadFn = Val<"Bad", { at: [string, () => void] }>;
      expectTypeOf<Element<BadFn>>().toEqualTypeOf<string>();
      expectTypeOf<BadFn>().not.toExtend<AnyVal>();

      type BadUndefined = Val<"Bad", { at: [string | undefined, number] }>;
      expectTypeOf<Element<BadUndefined>>().toEqualTypeOf<{
        readonly __valError: "a tuple element cannot be undefined; use null or make it optional";
      }>();
      expectTypeOf<BadUndefined>().not.toExtend<AnyVal>();
    });

    test("undefined as a required key's value is rejected", () => {
      type Bad = Val<"Bad", { nickname: string | undefined }>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error required property cannot be undefined
      Val.companion<Bad>().build();
    });

    test("functions are rejected", () => {
      type Bad = Val<"Bad", { run: () => void }>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
    });

    test("bigint is rejected, alone or in a union", () => {
      type Bad = Val<"Bad", { n: bigint; m: number | bigint }>;
      type Rejected = {
        readonly __valError: "bigint does not survive a JSON round trip; use a decimal string";
      };
      expectTypeOf<VerdictOf<Bad>>().toEqualTypeOf<{ n: Rejected; m: Rejected }>();
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error JSON.stringify throws on a bigint
      Val.companion<Bad>().build();
    });

    test("null is allowed inside a payload, but not at its top level", () => {
      type Nested = Val<"Nested", { value: string | null }>;
      expectTypeOf<Nested>().toExtend<AnyVal>();

      type Null = Val<"Null", null>;
      type Maybe = Val<"Maybe", string | null>;
      expectTypeOf<VerdictOf<Null>>().toEqualTypeOf<{
        readonly __valError: "a top-level payload cannot include null; null cannot carry a Val brand";
      }>();
      expectTypeOf<Null>().not.toExtend<AnyVal>();
      expectTypeOf<Maybe>().not.toExtend<AnyVal>();
      // @ts-expect-error null cannot carry the phantom brand
      Val.companion<Null>().build();
      // @ts-expect-error the nullable branch would disappear from the branded value
      Val.companion<Maybe>().build();
    });

    test("an object union is rejected, however it is spelled", () => {
      type Bad = Val<"Bad", { kind: "a"; a: number } | { kind: "b"; b: string }>;
      expectTypeOf<VerdictOf<Bad>>().toEqualTypeOf<{
        readonly __valError: "an object payload cannot be a union; patch merges, so it cannot switch variants";
      }>();
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
      // @ts-expect-error patch merges, so it cannot switch variants
      Val.companion<Bad>().build();

      type State = { kind: "a"; a: number } | { kind: "b"; b: string };
      type ViaAlias = Val<"ViaAlias", State>;
      expectTypeOf<ViaAlias>().not.toExtend<AnyVal>();

      type Nested = Val<"Nested", { state: State; name: string }>;
      expectTypeOf<VerdictOf<Nested>>().toEqualTypeOf<{
        state: {
          readonly __valError: "an object payload cannot be a union; patch merges, so it cannot switch variants";
        };
        name: string;
      }>();
      expectTypeOf<Nested>().not.toExtend<AnyVal>();

      type InArray = Val<"InArray", State[]>;
      expectTypeOf<InArray>().not.toExtend<AnyVal>();

      type InTuple = Val<"InTuple", [State, number]>;
      expectTypeOf<InTuple>().not.toExtend<AnyVal>();
    });

    test("a union of primitives is not an object union", () => {
      type Ok = Val<"Ok", { tag: "a" | "b"; n: number | null; flag: boolean }>;
      expectTypeOf<Ok>().toExtend<AnyVal>();
      Val.companion<Ok>().build().seal({ tag: "a", n: null, flag: true });
    });

    test("number and symbol keys are rejected", () => {
      expectTypeOf<Val<"Bad", Record<number, true>>>().not.toExtend<AnyVal>();
      expectTypeOf<Val<"Bad", Record<symbol, string>>>().not.toExtend<AnyVal>();
      expectTypeOf<Val<"Bad", { 1: string }>>().not.toExtend<AnyVal>();
    });

    test("an index signature's entry may not be undefined", () => {
      type Bad = Val<"Bad", { rows: Record<string, string | undefined> }>;
      expectTypeOf<VerdictOf<Bad>>().toEqualTypeOf<{
        rows: { [x: string]: { readonly __valError: "not a plain value" } };
      }>();
      expectTypeOf<Bad>().not.toExtend<AnyVal>();

      type Ok = Val<"Ok", { rows: Record<string, string> }>;
      expectTypeOf<Ok>().toExtend<AnyVal>();
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

    test("object spread drops the brand until the payload is sealed again", () => {
      const user = User.seal({ id: "a", name: "bob" });
      // oxlint-disable-next-line typescript/no-misused-spread -- a Val is plain data at runtime
      const changed = { ...user, name: "sue" };

      expectTypeOf(changed).not.toExtend<User>();
      // @ts-expect-error spreading copies payload fields, not the nominal brand
      const unsealed: User = changed;
      expect(unsealed).toEqual(changed);

      const resealed = User.seal(changed);
      expectTypeOf(resealed).toEqualTypeOf<User>();
      expect(resealed).toEqual({ id: "a", name: "sue" });
    });

    test("nested Vals keep their brand", () => {
      type Money = Val<"Money", { amount: number; currency: string }>;
      type Order = Val<"Order", { id: string; total: Money }>;
      const Order = Val.companion<Order>().build();
      const order = Order.seal({ id: "o", total: Val.of<Money>({ amount: 1, currency: "JPY" }) });
      expectTypeOf(order.total).toEqualTypeOf<Money>();
    });

    test("an array Val is a branded ReadonlyArray", () => {
      const GridVal = Val.companion<Grid>().build();
      const g = GridVal.seal([[1]]);
      expectTypeOf(g).toExtend<readonly (readonly number[])[]>();
    });

    test("BrandOf / PayloadOf", () => {
      expectTypeOf<BrandOf<User>>().toEqualTypeOf<"app/User">();
      expectTypeOf<PayloadOf<ArticleId>>().toEqualTypeOf<string>();
      expectTypeOf<keyof User>().toEqualTypeOf<"id" | "name" | "nickname">();
    });

    test("does not exist at runtime", () => {
      const user = User.seal({ id: "a", name: "bob" });
      expect(Object.keys(user)).toEqual(["id", "name"]);
      expect(Reflect.ownKeys(user)).toEqual(["id", "name"]);
      expect(JSON.parse(JSON.stringify(user))).toEqual({ id: "a", name: "bob" });
      expect(structuredClone(user)).toEqual({ id: "a", name: "bob" });
    });
  });

  describe("recursion", () => {
    // Written plain, like any other payload: `Val` makes it readonly, and `Val.unwrap` returns the
    // mutable array the declaration wrote.
    type Tree = Val<"app/Tree", { value: number; children: Rec<Tree>[] }>;
    const Tree = Val.companion<Tree>().build();

    type Node = Val<"app/Node", { value: number; next?: Rec<Node> }>;
    const Node = Val.companion<Node>().build();

    test("a type can name itself through Rec", () => {
      const leaf = Tree.seal({ value: 1, children: [] });
      const root = Tree.seal({ value: 2, children: [leaf, leaf] });

      expectTypeOf<Tree>().toExtend<AnyVal>();
      expectTypeOf(root.children[0]).toEqualTypeOf<Tree | undefined>();
      expect(root.children[0]).toBe(leaf);
      expect(Val.unwrap(root)).toEqual({
        value: 2,
        children: [
          { value: 1, children: [] },
          { value: 1, children: [] },
        ],
      });
    });

    test("Rec is erased from the seed and from the value", () => {
      expectTypeOf<SeedOf<Tree>>().toEqualTypeOf<{
        readonly value: number;
        readonly children: readonly Tree[];
      }>();
      expectTypeOf<SeedOf<Node>>().toEqualTypeOf<{
        readonly value: number;
        readonly next?: Node;
      }>();

      const node = Node.seal({ value: 1, next: Node.seal({ value: 2 }) });
      expect(Object.keys(node)).toEqual(["value", "next"]);
    });

    test("the payload and the mutable copy open it too", () => {
      expectTypeOf<PayloadOf<Tree>>().toEqualTypeOf<{
        value: number;
        children: PayloadOf<Tree>[];
      }>();

      const raw = Val.unwrap(
        Tree.seal({ value: 2, children: [Tree.seal({ value: 1, children: [] })] }),
      );
      raw.children.push({ value: 3, children: [] });
      expect(raw.children.map((child) => child.value)).toEqual([1, 3]);
    });

    test("a Rec inside another Val opens too", () => {
      type Forest = Val<"app/Forest", { tree: Tree }>;
      expectTypeOf<PayloadOf<Forest>["tree"]["children"]>().toEqualTypeOf<PayloadOf<Tree>[]>();
    });

    test("a readonly array in the declaration stays readonly", () => {
      type Chain = Val<"app/Chain", { links: readonly Rec<Chain>[] }>;
      expectTypeOf<PayloadOf<Chain>>().toEqualTypeOf<{ links: readonly PayloadOf<Chain>[] }>();
    });

    test("Rec reaches through a record and a nested object", () => {
      type Dir = Val<"app/Dir", { name: string; entries: Record<string, Rec<Dir>> }>;
      const Dir = Val.companion<Dir>().build();
      const leaf = Dir.seal({ name: "leaf", entries: {} });

      expectTypeOf<SeedOf<Dir>["entries"]>().toEqualTypeOf<{ readonly [x: string]: Dir }>();
      expect(Dir.seal({ name: "root", entries: { a: leaf } }).entries["a"]).toBe(leaf);

      type Cell = Val<"app/Cell", { value: number; prev?: { at: Rec<Cell> } }>;
      const Cell = Val.companion<Cell>().build();
      const head = Cell.seal({ value: 1 });
      expectTypeOf(Cell.seal({ value: 2, prev: { at: head } }).prev).toEqualTypeOf<
        { readonly at: Cell } | undefined
      >();
    });

    test("a payload key named after an array member still opens its Rec", () => {
      type Index = Val<"app/Index", { entries: Record<string, Rec<Index>>; name?: string }>;
      const Index = Val.companion<Index>().build();
      const leaf = Index.seal({ entries: {} });

      expect(Index.seal({ entries: { a: leaf }, name: "root" }).entries["a"]).toBe(leaf);
    });

    test("the companion's members take the recursive type", () => {
      const Sum = Val.companion<Tree>()
        .impl(() => ({
          total(t: Tree): number {
            return t.value + t.children.reduce((n, c) => n + Sum.total(c), 0);
          },
        }))
        .build();
      const tree = Sum.seal({ value: 1, children: [Sum.seal({ value: 2, children: [] })] });

      expect(Sum.total(tree)).toBe(3);
    });

    test("a trait a recursive type declares is checked as any other", () => {
      type Sized = Trait<"app/Sized", { value: number }, { size: (self: Self) => number }>;
      type Counted = Val<"app/Counted", { value: number; next?: Rec<Counted> }, Sized>;
      const Sized = Trait.companion<Sized>().build();
      const Counted = Val.companion<Counted>()
        .implTrait(Sized, () => ({ size: (c) => c.value }))
        .build();

      expectTypeOf<Counted>().toExtend<AnyVal>();
      expect(Counted.size(Counted.seal({ value: 2 }))).toBe(2);

      type Linked = Val<"app/Linked", { other: string; next?: Rec<Linked> }, Sized>;
      expectTypeOf<SeedOf<Linked>>().toEqualTypeOf<{
        readonly other: string;
        readonly next?: Linked;
        readonly value: number;
      }>();

      type Clashing = Val<"app/Clashing", { value: string; next?: Rec<Clashing> }, Sized>;
      expectTypeOf<Clashing>().not.toExtend<AnyVal>();
    });

    test("the trait check reads the payload with its Rec opened", () => {
      type Leaf = Val<"app/Leaf", { n: number }>;
      type Held = Trait<"app/Held", { at: Leaf }>;
      type Slot = Val<"app/Slot", { at: Rec<Leaf> }, Held>;

      expectTypeOf<Slot>().toExtend<AnyVal>();
    });

    test("a Rec in a tuple opens at its position", () => {
      type Pair = Val<"app/Pair", { pair: readonly [Rec<Pair>, number] }>;

      expectTypeOf<SeedOf<Pair>>().toEqualTypeOf<{ readonly pair: readonly [Pair, number] }>();
    });

    test("a Rec around anything but the type being declared opens to it", () => {
      expectTypeOf<SeedOf<Val<"app/Plain", { n: Rec<number> }>>>().toEqualTypeOf<{
        readonly n: number;
      }>();
      type Other = Val<"app/Other", { n: number }>;
      expectTypeOf<SeedOf<Val<"app/Holder", { at: Rec<Other> }>>>().toEqualTypeOf<{
        readonly at: Other;
      }>();
    });

    test("a payload the rules reject is still rejected inside a recursive type", () => {
      type Bad = Val<"app/Bad", { run: () => void; next?: Rec<Bad> }>;
      expectTypeOf<Bad>().not.toExtend<AnyVal>();
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
      type Post = Val<"Post", { title: string; author: { name: string }; tags: string[] }>;
      const Post = Val.companion<Post>().build();
      const post = Post.seal({ title: "t", author: { name: "alice" }, tags: ["a"] });

      expect(Object.isFrozen(post)).toBe(true);
      expect(Object.isFrozen(post.author)).toBe(true);
      expect(Object.isFrozen(post.tags)).toBe(true);
    });

    test("a payload's getter cannot leave a value half-sealed", () => {
      // Copying a payload runs its getters, so someone else's code can run mid-copy and reach
      // back into the library.
      type Note = Val<"Note", { id: string; body: { text: string } }>;
      const Note = Val.companion<Note>().build();
      const other = Note.seal({ id: "b", body: { text: "b" } });

      const note = Note.seal({
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
      const raw = Val.unwrap(User.seal({ id: "a", name: "bob" }));
      expect(Object.isFrozen(raw)).toBe(false);
      raw.name = "sue";
      expect(raw.name).toBe("sue");
    });
  });
});

describe("copying", () => {
  describe("owning", () => {
    type Order = Val<"Order", { id: string; total: { amount: number; currency: string } }>;
    const Order = Val.companion<Order>().build();

    test("mutating the argument afterwards does not reach the value", () => {
      const raw = { id: "a", name: "alice" };
      const user = User.seal(raw);
      raw.name = "mallory";
      expect(user.name).toBe("alice");
    });

    test("the copy is deep", () => {
      const total = { amount: 100, currency: "JPY" };
      const order = Order.seal({ id: "o", total });
      total.amount = 999;
      expect(order.total.amount).toBe(100);
      expect(order.total).not.toBe(total);
    });

    test("arrays are copied, not aliased", () => {
      const Grid = Val.companion<Grid>().build();
      const rows = [[1, 2], [3]];
      const grid = Grid.seal(rows);
      rows[0]![0] = 99;
      expect(grid[0]![0]).toBe(1);
      expect(grid).toEqual([[1, 2], [3]]);
    });

    test("a patch handed to `patch` is copied as well", () => {
      const total = { amount: 100, currency: "JPY" };
      const order = Order.patch(Order.seal({ id: "o", total: { amount: 1, currency: "JPY" } }), {
        total,
      });
      total.amount = 999;
      expect(order.total.amount).toBe(100);
    });

    test("a `__proto__` key stays an own property", () => {
      const Tags = Val.companion<Tags>().build();
      const tags = Tags.seal(JSON.parse('{"a":true,"__proto__":{"isAdmin":true}}'));
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
      type Pt = Val<"Pt", { x: number; y: number }>;
      expect(() => Val.of<Pt>(new Point())).toThrow(TypeError);
      expect(() => Val.of<Pt>({ x: 1, y: 2 })).not.toThrow();
    });

    test("a null-prototype object is allowed, and comes back plain", () => {
      const source = Object.assign(Object.create(null) as Record<string, true>, { a: true });
      const tags = Val.of<Tags>(source);
      expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);
      expect(tags["a"]).toBe(true);
    });

    test("the seal copies through Val.of, not by copying its argument itself", () => {
      type Point = Val<"Point", { x: number; y: number }>;
      const Point = Val.companion<Point>()
        .implSeal((p) => Val.of<Point>(p))
        .build();
      const raw = { x: 1, y: 2 };
      const p = Point.seal(raw);
      raw.x = 99;
      expect(p.x).toBe(1);
    });

    test("a seal normalises by deriving, and leaves the caller's object alone", () => {
      type Labels = Val<"Labels", string[]>;
      const Labels = Val.companion<Labels>()
        .implSeal((l, seal) => seal(l.toSorted()))
        .build();
      const raw = ["b", "a"];
      expect(Labels.seal(raw)).toEqual(["a", "b"]);
      expect(raw).toEqual(["b", "a"]);
    });
  });

  describe("reuse", () => {
    type Money = Val<"Money", { amount: number; currency: string }>;
    type Line = Val<"Line", { sku: string; qty: number }>;
    type Order = Val<"Order", { id: string; note: string; total: Money; lines: Line[] }>;
    const Money = Val.companion<Money>().build();
    const Line = Val.companion<Line>().build();
    const Order = Val.companion<Order>().build();
    const order = () =>
      Order.seal({
        id: "o",
        note: "n",
        total: Money.seal({ amount: 1, currency: "JPY" }),
        lines: [Line.seal({ sku: "s", qty: 1 })],
      });

    test("`patch` keeps the subtrees it did not touch", () => {
      const before = order();
      const after = Order.patch(before, { note: "changed" });
      expect(after).not.toBe(before);
      expect(after.lines).toBe(before.lines);
      expect(after.lines[0]).toBe(before.lines[0]);
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
      const foreign = [Line.seal({ sku: "s", qty: 1 })];
      const a = Order.seal({
        id: "a",
        note: "n",
        total: Money.seal({ amount: 1, currency: "JPY" }),
        lines: foreign,
      });
      const b = Order.seal({
        id: "b",
        note: "n",
        total: Money.seal({ amount: 1, currency: "JPY" }),
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
      raw.lines[0]!.qty = 999;
      expect(derived.lines[0]!.qty).toBe(1);
    });

    test("an unwrapped payload is not adopted when it is sealed again", () => {
      const raw = Val.unwrap(order());
      const line = Line.seal(raw.lines[0]!);
      expect(line).not.toBe(raw.lines[0]);
      raw.lines[0]!.qty = 999;
      expect(line.qty).toBe(1);
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
      const user = User.seal({ id: "a", name: "bob" });
      expect(User.patch(user, { nickname: undefined })).toBe(user);
      expect(
        User.patch(User.seal({ id: "a", name: "bob", nickname: "b" }), { nickname: undefined }),
      ).toEqual({
        id: "a",
        name: "bob",
      });
    });

    test("a freshly built child counts as a change", () => {
      // It went through a constructor, so a new instance is what the caller asked for.
      const before = order();
      expect(Order.patch(before, { total: Money.seal({ amount: 1, currency: "JPY" }) })).not.toBe(
        before,
      );
    });

    test("a no-op still goes through a custom seal, which keeps the identity", () => {
      type Tenure = Val<"Tenure", { years: number }>;
      const seen: number[] = [];
      const Tenure = Val.companion<Tenure>()
        .implSeal((t, seal) => {
          seen.push(t.years);
          return { ok: seal(t) };
        })
        .build();
      const tenure = Tenure.seal({ years: 30 }).ok;
      seen.length = 0;

      const same = Tenure.patch(tenure, { years: 30 });
      expect(seen).toEqual([30]); // the seal ran: it owns the return shape
      expect(same.ok).toBe(tenure); // and the copy inside it handed the value back
    });

    test("reuse does not change what `equals` answers", () => {
      const a = order();
      const b = Order.patch(a, { note: "changed" });
      expect(equals(a, b)).toBe(false);
      expect(equals(b, Order.patch(a, { note: "changed" }))).toBe(true);
      expect(equals(a.lines[0]!, b.lines[0]!)).toBe(true);
    });
  });
});

describe("equals", () => {
  test("compares primitive, object and array payloads deeply", () => {
    const ArticleId = Val.companion<ArticleId>().build();
    type Numbers = Val<"Numbers", number[]>;
    const Numbers = Val.companion<Numbers>().build();

    expect(equals(ArticleId.seal("a"), ArticleId.seal("a"))).toBe(true);
    expect(equals(ArticleId.seal("a"), ArticleId.seal("b"))).toBe(false);
    expect(equals(User.seal({ id: "a", name: "bob" }), User.seal({ id: "a", name: "bob" }))).toBe(
      true,
    );
    expect(equals(User.seal({ id: "a", name: "bob" }), User.seal({ id: "a", name: "sue" }))).toBe(
      false,
    );
    expect(equals(Numbers.seal([1, 2]), Numbers.seal([1, 2]))).toBe(true);
    expect(equals(Numbers.seal([1, 2]), Numbers.seal([2, 1]))).toBe(false);
    expect(equals(Numbers.seal([1, 2]), Numbers.seal([1, 2, 3]))).toBe(false);
  });

  test("is independent of key order and ignores undefined-valued keys", () => {
    type Fields = Val<"Fields", { a?: number; b?: number }>;
    const Fields = Val.companion<Fields>().build();
    expect(equals(Fields.seal({ a: 1, b: 2 }), Fields.seal({ b: 2, a: 1 }))).toBe(true);
    expect(
      equals(Fields.seal({ a: undefined } as unknown as SeedOf<Fields>), Fields.seal({})),
    ).toBe(true);
    expect(
      equals(
        Fields.seal({ a: 1, b: undefined } as unknown as SeedOf<Fields>),
        Fields.seal({ a: 1 }),
      ),
    ).toBe(true);
  });

  test("treats NaN as equal to NaN, and -0 as equal to 0", () => {
    type NumberValue = Val<"NumberValue", number>;
    const NumberValue = Val.companion<NumberValue>().build();
    expect(equals(NumberValue.seal(Number.NaN), NumberValue.seal(Number.NaN))).toBe(true);
    expect(equals(NumberValue.seal(-0), NumberValue.seal(0))).toBe(true);
  });

  test("compares nested Vals structurally", () => {
    type Order = Val<"Order", { owner: User; lines: number[] }>;
    const Order = Val.companion<Order>().build();
    const a = Order.seal({ owner: User.seal({ id: "a", name: "bob" }), lines: [1, 2] });
    const b = Order.seal({ owner: User.seal({ id: "a", name: "bob" }), lines: [1, 2] });
    expect(equals(a, b)).toBe(true);
  });

  test("infers the Val type from the first argument", () => {
    type Account = Val<"Account", { id: string }>;
    const Account = Val.companion<Account>().build();
    const user = User.seal({ id: "a", name: "bob" });
    const account = Account.seal({ id: "a" });

    expect(equals(user, User.seal({ id: "a", name: "bob" }))).toBe(true);
    const compare: (a: User, b: User) => boolean = equals;
    expect(compare(user, user)).toBe(true);
    // @ts-expect-error the brand differs even when the payload structure is compatible
    equals(user, Val.of<Val<"OtherUser", { id: string; name: string }>>(user));
    // @ts-expect-error the brand and payload differ
    equals(user, account);
  });
});

describe("patch", () => {
  test("omitting a key leaves it unchanged", () => {
    const u = User.seal({ id: "a", name: "bob", nickname: "bo" });
    expect(User.patch(u, { name: "sue" })).toEqual({
      id: "a",
      name: "sue",
      nickname: "bo",
    });
  });

  test("undefined deletes the key", () => {
    const u = User.seal({ id: "a", name: "bob", nickname: "bo" });
    const next = User.patch(u, { nickname: undefined });
    expect(Object.hasOwn(next, "nickname")).toBe(false);
    expect(next).toEqual({ id: "a", name: "bob" });
  });

  test("does not mutate the original value", () => {
    const u = User.seal({ id: "a", name: "bob" });
    User.patch(u, { name: "sue" });
    expect(u.name).toBe("bob");
  });

  test("goes through a custom seal when one is defined", () => {
    type Account = Val<"Account", { id: string; balance: number }>;
    const Account = Val.companion<Account>()
      .implSeal((a: { id: string; balance: number }, seal): Result<Account> =>
        a.balance >= 0
          ? { ok: true, value: seal(a) }
          : { ok: false, error: "balance must not be negative" },
      )
      .build();

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
    const u = User.seal({ id: "a", name: "bob" });
    expectTypeOf(User.patch(u, { name: "x" })).toEqualTypeOf<User>();
  });

  test("is not offered at all on a non-object Val", () => {
    // Only what deep-merges carries it. Everything else is rebuilt through the constructor.
    expectTypeOf(Val.companion<ArticleId>().build()).not.toHaveProperty("patch");
    expectTypeOf(Val.companion<Grid>().build()).not.toHaveProperty("patch");
    expectTypeOf(Val.companion<Val<"Pair", [number, string]>>().build()).not.toHaveProperty(
      "patch",
    );
    expectTypeOf(Val.companion<Tags>().build()).toHaveProperty("patch");
  });

  test("still guards at runtime, for callers without types", () => {
    const ArticleId = Val.companion<ArticleId>().build() as unknown as {
      patch: (...args: unknown[]) => unknown;
    };
    expect(() => ArticleId.patch("a1b2c3", {})).toThrow(/object-shaped/);
  });

  test("with routes through the seal, whatever the seal returns", () => {
    type Box = Val<"Box", { n: number }>;
    const box = Val.companion<Box>().build();
    const Box = Val.companion<Box>()
      .implSeal((b: { n: number }) => ({ tagged: box.seal(b) }))
      .build();
    const out = Box.patch(Val.of<Box>({ n: 1 }), { n: 2 });
    expectTypeOf(out).toEqualTypeOf<{ tagged: Box }>();
    expect(out).toEqual({ tagged: { n: 2 } });
  });

  test("undefined on a required key is a type error", () => {
    const u = User.seal({ id: "a", name: "bob" });
    // @ts-expect-error a required key cannot be deleted
    User.patch(u, { name: undefined });
    // optional keys can be deleted
    User.patch(u, { nickname: undefined });
  });

  describe("nested", () => {
    type City = Val<"City", { name: string; zip?: string }>;
    const City = Val.companion<City>().build();

    type Shop = Val<
      "Shop",
      {
        id: string;
        owner: { name: string; contact: { email: string; phone?: string } };
        city: City;
        tags: string[];
        staff: Record<string, { role: string }>;
      }
    >;
    const Shop = Val.companion<Shop>().build();
    const shop = () =>
      Shop.seal({
        id: "s",
        owner: { name: "bob", contact: { email: "b@example.com", phone: "1" } },
        city: City.seal({ name: "Kyoto", zip: "600" }),
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
      const after = Shop.patch(before, { city: City.seal({ name: "Osaka" }) });
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
      const other = Shop.seal({
        id: "o",
        owner: { name: "sue", contact: { email: "s@example.com" } },
        city: City.seal({ name: "Nara" }),
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

    test("an optional key and a record entry take the whole value, never a patch", () => {
      type Place = Val<"Place", { name: string; at?: { x: number; y: number } }>;
      const Place = Val.companion<Place>().build();
      const place = Place.seal({ name: "p" });

      // @ts-expect-error `at` may be absent, and a merge into nothing would drop `y`
      Place.patch(place, { at: { x: 1 } });
      // @ts-expect-error an entry the record does not hold yet is the same case
      Shop.patch(shop(), { staff: { u3: {} } });

      expect(Place.patch(place, { at: { x: 1, y: 2 } }).at).toEqual({ x: 1, y: 2 });
      expect(Shop.patch(shop(), { staff: { u3: { role: "host" } } }).staff.u3).toEqual({
        role: "host",
      });
    });

    test("a nested object merges, so replacing one takes the constructor", () => {
      const before = shop();
      const staff = { u3: { role: "host" } };
      expect(Shop.patch(before, { staff }).staff).toEqual({
        u1: { role: "cook" },
        u2: { role: "waiter" },
        u3: { role: "host" },
      });
      // oxlint-disable-next-line typescript/no-misused-spread -- a Val is plain data at runtime
      expect(Shop.seal({ ...before, staff }).staff).toEqual(staff);
    });

    test("goes through the seal, which sees the merged payload", () => {
      type Box = Val<"Box", { inner: { n: number; seen: number } }>;
      const Box = Val.companion<Box>()
        .implSeal((b, seal) => seal({ inner: { ...b.inner, seen: b.inner.seen + 1 } }))
        .build();
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
        .impl(() => ({
          moved: (p, by: { x: number; y: number }): Point =>
            Point.seal({ x: p.x + by.x, y: p.y + by.y }),
        }))
        .build();

      expect(Point.moved(Point.seal({ x: 1, y: 2 }), { x: 2.7, y: 0 })).toEqual({ x: 3, y: 2 });
    });

    test("which is the only route for a primitive Val, since it carries no `patch`", () => {
      type UnixEpoch = Val<"UnixEpoch", number>;
      const UnixEpoch = Val.companion<UnixEpoch>()
        .implSeal((t: number, seal) => seal(Math.trunc(t)))
        .impl(() => ({ plus: (t, seconds: number): UnixEpoch => UnixEpoch.seal(t + seconds) }))
        .build();

      expect(UnixEpoch.plus(Val.of<UnixEpoch>(1_756_771_200), 60.5)).toBe(1_756_771_260);
    });
  });
});

describe("data-first and data-last", () => {
  const pipe = <A, B>(a: A, f: (a: A) => B): B => f(a);
  const Named = Val.companion<User>()
    .impl(() => ({
      greet: (u) => `Hi, ${u.name}`,
      renamed: (u, name: string): User => Named.patch(u, { name }),
      noted: (u, nickname: string | undefined): User => Named.patch(u, { nickname }),
    }))
    .build();
  const bob = Named.seal({ id: "a", name: "bob" });
  const sue = { id: "a", name: "sue" };

  test("a member takes the value first, or last", () => {
    expectTypeOf(Named.renamed(bob, "sue")).toEqualTypeOf<User>();
    expectTypeOf(Named.renamed("sue")).toEqualTypeOf<(self: User) => User>();
    expect([Named.renamed(bob, "sue"), Named.renamed("sue")(bob)]).toEqual([sue, sue]);
  });

  test("a member taking only the value has no form taking it last", () => {
    expectTypeOf(Named.greet).toEqualTypeOf<(self: User) => string>();
    // Not even at run time: called with no argument, it runs.
    // @ts-expect-error the value is required
    expect(() => Named.greet()).toThrow(TypeError);
  });

  test("so does `patch`", () => {
    expectTypeOf(Named.patch({ name: "sue" })).toEqualTypeOf<(self: User) => User>();
    expect(Named.patch({ name: "sue" })(bob)).toEqual(sue);
  });

  test("a member passed unapplied runs data-first, whatever the caller passes", () => {
    const greetings = [bob].map(Named.greet);
    expectTypeOf(greetings).toEqualTypeOf<string[]>();
    expectTypeOf(pipe(bob, Named.greet)).toEqualTypeOf<string>();
    expect(greetings).toEqual(["Hi, bob"]);
  });

  test("`undefined` counts as an argument", () => {
    const nicked = Named.patch(bob, { nickname: "b" });
    expect([Named.noted(nicked, undefined), Named.noted(undefined)(nicked)]).toEqual([
      { id: "a", name: "bob" },
      { id: "a", name: "bob" },
    ]);
  });

  describe("a member whose arguments can be left out is rejected", () => {
    test("an optional parameter", () => {
      Val.companion<User>()
        .impl(() => ({
          // @ts-expect-error a parameter that can be left out
          at: (u: User, n?: number) => u.name.at(n ?? 0),
        }))
        .build();
    });

    test("a default parameter", () => {
      expect(() =>
        Val.companion<User>()
          .impl(() => ({
            // @ts-expect-error a parameter that can be left out
            at: (u: User, n = 0) => u.name.at(n),
          }))
          .build(),
      ).toThrow(/default or a rest parameter/);
    });

    test("a trailing parameter that takes `void`", () => {
      Val.companion<User>()
        .impl(() => ({
          // @ts-expect-error a parameter that can be left out
          at: (u: User, n: number | void) => u.name.at(n ?? 0),
        }))
        .build();
    });

    test("a rest parameter", () => {
      expect(() =>
        Val.companion<User>()
          .impl(() => ({
            // @ts-expect-error a parameter that can be left out
            joined: (u: User, ...parts: string[]) => [u.name, ...parts].join(),
          }))
          .build(),
      ).toThrow(/default or a rest parameter/);
    });

    test("no parameter at all", () => {
      expect(() =>
        Val.companion<User>()
          .impl(() => ({
            // @ts-expect-error the first parameter must be the Val
            anonymous: () => "anonymous",
          }))
          .build(),
      ).toThrow(/first parameter/);
    });

    test("but not one that takes `undefined` or `unknown`", () => {
      Val.companion<User>()
        .impl(() => ({
          at: (u, n: number | undefined) => u.name.at(n ?? 0),
          is: (u, other: unknown) => u === other,
        }))
        .build();
    });
  });
});

describe("building", () => {
  describe("companion", () => {
    test("a companion has no constructor: the seal is the only way in", () => {
      expectTypeOf(Age).not.toBeFunction();
      expect(typeof Age).not.toBe("function");
    });

    test("a step does not change the builder it was taken on", () => {
      const bare = Val.companion<Age>();
      bare.impl(() => ({ label: (a) => `${a}` }));
      expect("label" in bare.build()).toBe(false);
    });
  });

  describe("build", () => {
    test("closes the chain: the companion has no step left", () => {
      const Built = Val.companion<User>()
        .implCreate((name: string) => ({ id: "a", name }))
        .impl(() => ({ greet: (u) => u.name }))
        .build();
      for (const step of [
        "impl",
        "implSeal",
        "implCreate",
        "implTrait",
        "implAssoc",
        "build",
      ] as const) {
        expectTypeOf(Built).not.toHaveProperty(step);
        expect(step in Built).toBe(false);
      }
      expect(Built.greet(Built.create("bob"))).toBe("bob");
    });

    test("a builder holds the steps alone", () => {
      const builder = Val.companion<User>()
        .implCreate((name: string) => ({ id: "a", name }))
        .impl(() => ({ greet: (u) => u.name }));
      expectTypeOf(builder).not.toHaveProperty("greet");
      for (const name of ["seal", "create", "patch", "greet", Traits])
        expect(name in builder).toBe(false);
    });

    test("a builder used as the companion says to call `.build()`", () => {
      const builder = Val.companion<User>().implCreate((name: string) => ({ id: "a", name }));
      expectTypeOf(builder.seal).toEqualTypeOf<CallBuildFirst>();
      expectTypeOf(builder.create).toEqualTypeOf<CallBuildFirst>();
      expectTypeOf(builder.patch).toEqualTypeOf<CallBuildFirst>();
    });

    test("a step keeps what the steps before it registered", () => {
      type Named = Trait<"BuiltNamed", { name: string }, { named: (self: Self) => string }>;
      const Named = Trait.companion<Named>().build();
      type Tagged = Val<"BuiltTagged", { name: string }, Named>;
      const Tagged = Val.companion<Tagged>()
        .implTrait(Named, () => ({ named: (t) => t.name }))
        .impl(() => ({ upper: (t) => t.name.toUpperCase() }))
        .build();
      const tagged = Tagged.seal({ name: "a" });
      expect([Tagged.named(tagged), Tagged.upper(tagged)]).toEqual(["a", "A"]);
    });
  });

  describe("the order of the steps", () => {
    type Account = Val<"OrderedAccount", { id: string; owner: string }>;
    const seal = (a: SeedOf<Account>, s: (a: SeedOf<Account>) => Account) => s(a);
    const create = (owner: string) => ({ id: "a1", owner });

    // Every message is the type a parameter takes, so passing or naming the literal is what pins
    // the wording.
    test("a step written too late says which one it belongs before", () => {
      const created = Val.companion<Account>().implCreate(create);
      // @ts-expect-error write `implSeal` before `implCreate`
      created.implSeal(seal);
      created.implSeal("write `implSeal` before `implCreate`");
    });

    test("each step of the first half is written once", () => {
      const all = Val.companion<Account>().implSeal(seal).implCreate(create);
      expectTypeOf(all).not.toHaveProperty("implSeal");
      expectTypeOf(all).not.toHaveProperty("implCreate");
    });

    test("`impl`, `implTrait` and `implAssoc` close the first half", () => {
      type Owned = Trait<"Owned", { owner: string }, { owned: (self: Self) => string }>;
      const Owned = Trait.companion<Owned>().build();
      type Held = Val<"Held", { id: string; owner: string }, Owned>;
      const members = Val.companion<Account>().impl(() => ({ owned: (a) => a.owner }));
      const traits = Val.companion<Held>().implTrait(Owned, () => ({ owned: (h) => h.owner }));
      const assoc = Val.companion<Account>().implAssoc(() => ({ CURRENCY: "JPY" }));
      for (const step of ["implSeal", "implCreate"] as const) {
        expectTypeOf(members).not.toHaveProperty(step);
        expectTypeOf(traits).not.toHaveProperty(step);
        expectTypeOf(assoc).not.toHaveProperty(step);
      }
    });
  });

  describe("impl", () => {
    test("the first parameter is contextually the Val, so it needs no annotation", () => {
      const Greeter = Val.companion<User>()
        .impl(() => ({
          greet(u) {
            expectTypeOf(u).toEqualTypeOf<User>();
            return u.name.toUpperCase();
          },
        }))
        .build();
      expect(Greeter.greet(Greeter.seal({ id: "a", name: "bob" }))).toBe("BOB");
    });

    test("a member that is not a function attaches as it is", () => {
      const Labelled = Val.companion<User>()
        .impl(() => ({ LABEL: "user" }))
        .build();
      expect(Labelled.LABEL).toBe("user");
    });

    test("`equals` can name an ordinary comparison", () => {
      const SameId = Val.companion<User>()
        .impl(() => ({
          equals: (a, b: User) => a.id === b.id,
        }))
        .build();
      const a = SameId.seal({ id: "a", name: "bob" });
      const b = SameId.seal({ id: "a", name: "sue" });

      expect(SameId.equals(a, b)).toBe(true);
      expect(equals(a, b)).toBe(false);
    });

    test("a method whose first parameter is not the Val is rejected", () => {
      Val.companion<User>()
        .impl(() => ({
          // @ts-expect-error the first parameter must be the Val; a factory belongs elsewhere
          fromId(id: string) {
            return id;
          },
        }))
        .build();
    });

    test("`seal` cannot be smuggled in as an ordinary method", () => {
      Val.companion<Age>()
        .impl(() => ({
          // @ts-expect-error `seal` belongs to .implSeal(), not to .impl()
          seal: (n: number) => Val.of<Age>(n),
        }))
        .build();
    });

    test("`create` cannot be smuggled in either: it would never reach the seal", () => {
      Val.companion<Age>()
        .impl(() => ({
          // @ts-expect-error `create` belongs to .implCreate(), not to .impl()
          create: (n: number) => Val.of<Age>(n),
        }))
        .build();
    });

    test("a member reaching `patch` or a sibling names the companion, and annotates", () => {
      const Loud = Val.companion<User>()
        .impl(() => ({
          renamed: (u, name: string): User => Loud.patch(u, { name }),
          shouted: (u): User => Loud.renamed(u, u.name.toUpperCase()),
        }))
        .build();
      const bob = Loud.seal({ id: "a", name: "bob" });

      expect([Loud.renamed(bob, "sue"), Loud.shouted(bob)]).toEqual([
        { id: "a", name: "sue" },
        { id: "a", name: "BOB" },
      ]);
    });

    test("is written once, and `implTrait` may follow it", () => {
      type Yelling = Trait<"Yelling", { name: string }, { yell: (self: Self) => string }>;
      const Yelling = Trait.companion<Yelling>().build();
      type Crier = Val<"Crier", { name: string }, Yelling>;
      const implemented = Val.companion<Crier>().impl(() => ({ greet: (c) => c.name }));
      const Crier = implemented
        .implTrait(Yelling, () => ({ yell: (c) => c.name.toUpperCase() }))
        .build();
      const bob = Crier.seal({ name: "bob" });

      expectTypeOf(implemented).not.toHaveProperty("impl");
      expect([Crier.greet(bob), Crier.yell(bob)]).toEqual(["bob", "BOB"]);
    });

    test("takes the members: `.build()` closes the chain, not `.impl()`", () => {
      // Never called: the empty call would throw before the type is the point.
      const bare = () => {
        // @ts-expect-error Expected 1 arguments, but got 0
        Val.companion<User>().impl().build();
      };
      expectTypeOf(bare).toBeFunction();
    });

    test("a member has no `this`, which the type says", () => {
      const Held = Val.companion<User>()
        .impl(() => ({
          method(u) {
            return [this, u] as const;
          },
          expression: function (u: User) {
            return [this, u] as const;
          },
        }))
        .build();
      const u = Held.seal({ id: "a", name: "alice" });
      expectTypeOf(Held.method(u)[0]).toEqualTypeOf<undefined>();
      expectTypeOf(Held.expression(u)[0]).toEqualTypeOf<undefined>();
      expect([Held.method(u)[0], Held.expression(u)[0]]).toEqual([undefined, undefined]);
    });

    test("the function receives `seal`, `create` and `patch`, so a member reaching them needs no annotation", () => {
      const Named = Val.companion<User>()
        .implSeal((u, seal) => (u.name ? seal(u) : new RangeError("name must not be empty")))
        .implCreate((name: string) => ({ id: "n1", name }))
        .impl(({ seal, create, patch }) => ({
          renamed: (u, name: string) => patch(u, { name }),
          resealed: (u, name: string) => seal({ id: u.id, name }),
          another: (u) => create(u.name),
        }))
        .build();
      const u = Named.seal({ id: "a", name: "alice" }) as User;
      expectTypeOf(Named.renamed(u, "bob")).toEqualTypeOf<User | RangeError>();
      expect([Named.renamed(u, "bob"), Named.resealed(u, ""), Named.another(u)]).toEqual([
        { id: "a", name: "bob" },
        new RangeError("name must not be empty"),
        { id: "n1", name: "alice" },
      ]);
    });

    test("without `implCreate`, the function receives no `create`", () => {
      Val.companion<User>()
        // @ts-expect-error `create` exists only with `implCreate`
        .impl(({ create }) => ({ again: (u) => create(u.name) }))
        .build();
    });

    test("`patch` is the library's, not yours", () => {
      Val.companion<User>()
        .impl(() => ({
          // @ts-expect-error a derivation with different rules deserves its own name
          patch: (u: User) => u,
        }))
        .build();
    });

    // `dyn` is the one name a trait member may not take that a Val companion may: `Trait`'s
    // `dyn` reads a symbol key, never the companion's own `dyn`.
    test("`dyn` is not among them: a Val companion has none to shadow", () => {
      const Boxed = Val.companion<User>()
        .impl(() => ({ dyn: (u) => u.name }))
        .build();
      expect(Boxed.dyn(Boxed.seal({ id: "a", name: "bob" }))).toBe("bob");
    });

    // The three tests above name one `Wired` member each. This one fails if the union grows a
    // name `.impl` still accepts, which is how the two drifted apart before.
    test("no name in `Wired` is accepted", () => {
      type Accepted = {
        [K in Wired]: ((v: User) => string) extends CompanionMembers<User>[K] ? K : never;
      }[Wired];
      expectTypeOf<Accepted>().toEqualTypeOf<never>();
      // The control: without it the conditional could answer `never` for every name.
      type Greet = ((v: User) => string) extends CompanionMembers<User>["greet"] ? "greet" : never;
      expectTypeOf<Greet>().toEqualTypeOf<"greet">();
    });
  });

  describe("implAssoc", () => {
    type Money = Val<"AssocMoney", { cents: number }>;

    test("the function receives the companion's `seal`, so a member passes the custom one", () => {
      const Money = Val.companion<Money>()
        .implSeal((m, seal) => (m.cents >= 0 ? seal(m) : new RangeError("negative")))
        .implAssoc(({ seal }) => ({ fromCents: (cents: number) => seal({ cents }) }))
        .build();
      expectTypeOf(Money.fromCents(-1)).toEqualTypeOf<Money | RangeError>();
      expect([Money.fromCents(1), Money.fromCents(-1)]).toEqual([
        { cents: 1 },
        new RangeError("negative"),
      ]);
    });

    test("and `create`, which goes through the same seal", () => {
      type Token = Val<"AssocToken", { id: string; scope: string }>;
      const Token = Val.companion<Token>()
        .implSeal((t, seal) => (t.scope ? seal(t) : undefined))
        .implCreate((scope: string) => ({ id: "t1", scope }))
        .implAssoc(({ create }) => ({ forAdmin: () => create("admin") }))
        .build();
      expectTypeOf(Token.forAdmin()).toEqualTypeOf<Token | undefined>();
      expect(Token.forAdmin()).toEqual({ id: "t1", scope: "admin" });
    });

    test("without `implCreate`, the function receives no `create`", () => {
      Val.companion<Money>()
        // @ts-expect-error `create` exists only with `implCreate`
        .implAssoc(({ create }) => ({ zero: () => create() }))
        .build();
    });

    test("the private `seal` and `create` are received too", () => {
      type Token = Val<"AssocPrivate", { id: string }>;
      const Token = Val.companion<Token, [PrivateSeal, PrivateCreate]>()
        .implCreate(() => ({ id: "fresh" }))
        .implAssoc(({ seal, create }) => ({
          fromId: (id: string) => seal({ id }),
          fresh: () => create(),
        }))
        .build();
      expectTypeOf(Token).not.toHaveProperty("seal");
      expectTypeOf(Token).not.toHaveProperty("create");
      expect([Token.fromId("a"), Token.fresh()]).toEqual([{ id: "a" }, { id: "fresh" }]);
    });

    test("a member takes its first argument first, or last", () => {
      const Money = Val.companion<Money>()
        .implAssoc(({ seal }) => ({
          scaled: (cents: number, by: number) => seal({ cents: cents * by }),
        }))
        .build();
      expectTypeOf(Money.scaled(2)).toEqualTypeOf<(cents: number) => Money>();
      expect([Money.scaled(5, 2), Money.scaled(2)(5)]).toEqual([{ cents: 10 }, { cents: 10 }]);
    });

    test("a member taking one argument has no form taking it last", () => {
      const Money = Val.companion<Money>()
        .implAssoc(({ seal }) => ({ fromCents: (cents: number) => seal({ cents }) }))
        .build();
      expectTypeOf(Money.fromCents).toEqualTypeOf<(cents: number) => Money>();
      // Not even at run time: called with no argument, it runs.
      // @ts-expect-error the argument is required
      expect(Money.fromCents()).toEqual({ cents: undefined });
    });

    test("a member passed unapplied runs first-argument-first, whatever the caller passes", () => {
      const Money = Val.companion<Money>()
        .implAssoc(({ seal }) => ({ fromCents: (cents: number) => seal({ cents }) }))
        .build();
      const moneys = [1, 2].map(Money.fromCents);
      expectTypeOf(moneys).toEqualTypeOf<Money[]>();
      expect(moneys).toEqual([{ cents: 1 }, { cents: 2 }]);
    });

    test("a member taking no argument is called as it is", () => {
      const Money = Val.companion<Money>()
        .implAssoc(({ seal }) => ({ zero: () => seal({ cents: 0 }) }))
        .build();
      expectTypeOf(Money.zero).toEqualTypeOf<() => Money>();
      expect(Money.zero()).toEqual({ cents: 0 });
    });

    test("a member that is not a function attaches as it is", () => {
      const Money = Val.companion<Money>()
        .implAssoc(({ seal }) => ({ ZERO: seal({ cents: 0 }), CURRENCY: "JPY" }))
        .build();
      expectTypeOf(Money.ZERO).toEqualTypeOf<Money>();
      expect([Money.ZERO, Money.CURRENCY]).toEqual([{ cents: 0 }, "JPY"]);
    });

    describe("a member whose arguments can be left out is rejected", () => {
      test("an optional parameter", () => {
        Val.companion<Money>()
          .implAssoc(({ seal }) => ({
            // @ts-expect-error a parameter that can be left out
            parse: (raw: string, radix?: number) => seal({ cents: parseInt(raw, radix) }),
          }))
          .build();
      });

      test("a default parameter", () => {
        expect(() =>
          Val.companion<Money>()
            .implAssoc(({ seal }) => ({
              // @ts-expect-error a parameter that can be left out
              fromCents: (cents = 0) => seal({ cents }),
            }))
            .build(),
        ).toThrow(/default or a rest parameter/);
      });

      test("a rest parameter", () => {
        expect(() =>
          Val.companion<Money>()
            .implAssoc(({ seal }) => ({
              // @ts-expect-error a parameter that can be left out
              sum: (...cents: number[]) => seal({ cents: cents.reduce((a, b) => a + b, 0) }),
            }))
            .build(),
        ).toThrow(/default or a rest parameter/);
      });
    });

    test("is written any number of times, before and after `impl` and `implTrait`", () => {
      type Priced = Trait<"AssocPriced", { cents: number }, { price: (self: Self) => string }>;
      const Priced = Trait.companion<Priced>().build();
      type Item = Val<"AssocItem", { cents: number }, Priced>;
      const Item = Val.companion<Item>()
        .implAssoc(({ seal }) => ({ fromCents: (cents: number) => seal({ cents }) }))
        .implTrait(Priced, () => ({ price: (i) => `${i.cents}` }))
        .impl(() => ({ doubled: (i): Item => Item.fromCents(i.cents * 2) }))
        // A member reaching the companion names it and annotates its return type, as in `impl`.
        .implAssoc(() => ({
          sum: (items: readonly Item[]): Item =>
            Item.fromCents(items.reduce((total, i) => total + i.cents, 0)),
        }))
        .build();
      const five = Item.fromCents(5);
      expectTypeOf(five).toEqualTypeOf<Item>();
      expect([Item.sum([five, five]), Item.doubled(five), Item.price(five)]).toEqual([
        { cents: 10 },
        { cents: 10 },
        "5",
      ]);
    });

    test("a name is taken once, across `impl`, `implTrait` and `implAssoc`", () => {
      type Priced = Trait<"AssocTaken", { cents: number }, { price: (self: Self) => string }>;
      const Priced = Trait.companion<Priced>().build();
      type Item = Val<"AssocTakenItem", { cents: number }, Priced>;
      const priced = Val.companion<Item>().implTrait(Priced, () => ({
        price: (i) => `${i.cents}`,
      }));
      // @ts-expect-error this name is already taken
      priced.implAssoc(() => ({ price: (cents: number) => `${cents}` }));
      const assoc = Val.companion<Item>().implAssoc(() => ({
        price: (cents: number) => `${cents}`,
      }));
      assoc.implTrait(
        // @ts-expect-error another member already answers to one of these names
        Priced,
        () => ({ price: (i: Item) => `${i.cents}` }),
      );
      // @ts-expect-error this name is already taken
      assoc.implAssoc(() => ({ price: (cents: number) => `${cents}` }));
      // @ts-expect-error this name is already taken
      assoc.impl(() => ({ price: (i: Item) => `${i.cents}` }));
    });

    test("a name in `Wired` is not accepted", () => {
      // @ts-expect-error a name the library reserves
      Val.companion<Money>().implAssoc(() => ({ seal: (cents: number) => cents }));
    });

    test("a member has no `this`, which the type says", () => {
      const Held = Val.companion<Money>()
        .implAssoc(() => ({
          fromCents(cents: number): unknown {
            expectTypeOf(this).toEqualTypeOf<undefined>();
            return [this, cents];
          },
          zero(): unknown {
            return this;
          },
        }))
        .build();
      expect([Held.fromCents(1), Held.zero()]).toEqual([[undefined, 1], undefined]);
    });
  });

  describe("implSeal", () => {
    type Score = Val<"Score", { points: number }>;
    type Email = Val<"Email", string>;
    type Point = Val<"Point", { x: number; y: number }>;

    test("registers `seal` and routes `patch` through it, without any impl", () => {
      const Score = Val.companion<Score>()
        .implSeal((s: { points: number }, seal): Result<Score> =>
          s.points >= 0
            ? { ok: true, value: seal(s) }
            : { ok: false, error: "points must not be negative" },
        )
        .build();

      const s = Val.of<Score>({ points: 3 });
      expectTypeOf(Score.patch(s, { points: 1 })).toEqualTypeOf<Result<Score>>();
      expect(Score.patch(s, { points: -1 })).toEqual({
        ok: false,
        error: "points must not be negative",
      });
      expect(equals(s, Val.of<Score>({ points: 3 }))).toBe(true);
    });

    test("methods added afterwards keep the contextual type and the routing", () => {
      const Score = Val.companion<Score>()
        .implSeal((s, seal) => {
          expectTypeOf(s).toEqualTypeOf<{ readonly points: number }>();
          return seal(s);
        })
        .impl(() => ({
          double(v) {
            expectTypeOf(v).toEqualTypeOf<Score>();
            return v.points * 2;
          },
        }))
        .build();

      const s = Score.seal({ points: 3 });
      expect(Score.double(s)).toBe(6);
      expectTypeOf(Score.patch(s, { points: 1 })).toEqualTypeOf<Score>();
    });

    test("the default seal comes in as a second parameter, so Val.of is not needed", () => {
      const Email = Val.companion<Email>()
        .implSeal((s: string, seal) => {
          expectTypeOf(seal).toEqualTypeOf<(value: string) => Email>();
          return seal(s.trim().toLowerCase());
        })
        .build();

      const e = Email.seal("  A@B.com ");
      expectTypeOf(e).toEqualTypeOf<Email>();
      expect(e).toBe("a@b.com");
      expectTypeOf(Email.seal).parameters.toEqualTypeOf<[string]>();
    });

    test("the default seal copies, so the value is detached from the raw payload", () => {
      type Box = Val<"Box", { tags: string[] }>;
      const Box = Val.companion<Box>()
        .implSeal((b, seal) => seal(b))
        .build();
      const raw = { tags: ["a"] };
      const b = Box.seal(raw);
      raw.tags.push("b");
      expect(b.tags).toEqual(["a"]);
    });

    test("detects a getter that changes between validation and copying", () => {
      type Reading = Val<"Reading", { n: number }>;
      const Reading = Val.companion<Reading>()
        .implSeal((r, seal) => {
          void r.n; // validation observes the input before the default seal copies it
          return seal(r);
        })
        .build();
      let n = 0;
      const input = {
        get n() {
          return ++n;
        },
      };

      expect(() => Reading.seal(input)).toThrow(
        new TypeError("The payload changed while the custom seal was running."),
      );
    });

    test("detects a non-idempotent get trap", () => {
      type Reading = Val<"Reading", { n: number }>;
      let n = 0;
      const candidate = new Proxy(
        { n: 0 },
        {
          get(target, key, receiver) {
            return key === "n" ? ++n : Reflect.get(target, key, receiver);
          },
        },
      );
      const Reading = Val.companion<Reading>()
        .implSeal((_r, seal) => seal(candidate))
        .build();

      expect(() => Reading.seal({ n: 0 })).toThrow(TypeError);
    });

    test("detects mutation of the original input inside the custom seal", () => {
      type Reading = Val<"Reading", { n: number }>;
      const Reading = Val.companion<Reading>()
        .implSeal((r: { n: number }, seal) => {
          r.n += 1;
          return seal(r);
        })
        .build();

      expect(() => Reading.seal({ n: 1 })).toThrow(TypeError);
    });

    test("allows a stable reactive Proxy and detaches the result", () => {
      type Box = Val<"Box", { nested: { n: number } }>;
      const Box = Val.companion<Box>()
        .implSeal((b, seal) => seal(b))
        .build();
      const target = { nested: { n: 1 } };
      const input = new Proxy<typeof target>(target, {
        ownKeys: Reflect.ownKeys,
        getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor,
        get: Reflect.get,
      });

      const box = Box.seal(input);
      expect(box).toEqual({ nested: { n: 1 } });
      expect(box).not.toBe(input);
      expect(box.nested).not.toBe(target.nested);
      target.nested.n = 2;
      expect(box.nested.n).toBe(1);
    });

    test("allows normalization into a new plain candidate", () => {
      type Name = Val<"Name", { value: string }>;
      const Name = Val.companion<Name>()
        .implSeal((n, seal) => seal({ value: n.value.trim().toLowerCase() }))
        .build();

      expect(Name.seal({ value: " Alice " })).toEqual({ value: "alice" });
    });

    test("reuses the starting snapshot for every default seal call", () => {
      type Reading = Val<"Reading", { n: number }>;
      const Reading = Val.companion<Reading>()
        .implSeal((r: { n: number }, seal) => {
          const first = seal(r);
          r.n += 1;
          return [first, seal(r)] as const;
        })
        .build();

      expect(() => Reading.seal({ n: 1 })).toThrow(TypeError);
    });

    test("does no comparison when a rejected result never calls the default seal", () => {
      type Reading = Val<"Reading", { n: number }>;
      const Reading = Val.companion<Reading>()
        .implSeal((_r): Result<Reading> => ({
          ok: false,
          error: "rejected",
        }))
        .build();
      let n = 0;
      const input = {
        get n() {
          return ++n;
        },
      };

      expect(Reading.seal(input)).toEqual({ ok: false, error: "rejected" });
    });

    test("does not newly reject wider class or cyclic inputs before the custom seal", () => {
      type Reading = Val<"Reading", { n: number }>;
      const Reading = Val.companion<Reading>()
        .implSeal((r: object, seal) => seal({ n: (r as { n: number }).n }))
        .build();
      class Source {
        n = 1;
      }
      const cyclic: { n: number; self?: unknown } = { n: 2 };
      cyclic.self = cyclic;

      expect(Reading.seal(new Source())).toEqual({ n: 1 });
      expect(Reading.seal(cyclic)).toEqual({ n: 2 });
    });

    test("the seal accepts an existing value as readily as a raw payload", () => {
      const Score = Val.companion<Score>()
        .implSeal((s, seal) => seal(s))
        .build();
      const s = Val.of<Score>({ points: 3 });
      expect(Score.seal(s)).toEqual({ points: 3 });
    });

    test("seal may return a Result (the library never inspects it)", () => {
      expect(Age.seal(30)).toEqual({ ok: true, value: 30 });
      expect(Age.seal(-1)).toEqual({ ok: false, error: "age must be a non-negative integer" });
    });

    test("construct in normal form", () => {
      const Email = Val.companion<Email>()
        .implSeal((s: string, seal) => seal(s.trim().toLowerCase()))
        .build();
      expect(Email.seal("  A@B.com ")).toBe("a@b.com");
      // normalised at construction, so a parent's structural comparison is correct
      expect(equals(Email.seal(" a@b.com"), Email.seal("A@B.COM"))).toBe(true);
    });

    test("a constructor that cannot take the payload is rejected where it is written", () => {
      const point = Val.companion<Point>().build();
      Val.companion<Point>()
        .implSeal(
          // @ts-expect-error a seal must accept the whole payload; this one takes two numbers
          (x: number, y: number) => point.seal({ x, y }),
        )
        .build();
    });

    describe("the seal's parameter", () => {
      type Email = Val<"Email", string>;

      test("a parameter wider than the payload is fine while it excludes strings", () => {
        const wide = Val.companion<User>()
          .implSeal((u: object, seal) => seal(u as SeedOf<User>))
          .build();
        const record = Val.companion<User>()
          .implSeal((u: Record<string, unknown>, seal) => seal(u as SeedOf<User>))
          .build();
        const raw = { id: "a", name: "bob" };
        expect(wide.seal(raw)).toEqual(raw);
        expect(record.seal(raw)).toEqual(raw);
      });

      test("a parameter that also accepts a string is rejected", () => {
        Val.companion<User>()
          // @ts-expect-error a seal takes the payload, not a wire format
          .implSeal((u: unknown, seal) => seal(u as SeedOf<User>))
          .build();
        Val.companion<User>()
          // @ts-expect-error `{}` accepts a string too
          .implSeal((u: {}, seal) => seal(u as SeedOf<User>))
          .build();
        Val.companion<Age>()
          // @ts-expect-error a primitive payload has nothing to parse
          .implSeal((n: unknown, seal) => seal(n as number))
          .build();
        Val.companion<Age>()
          // @ts-expect-error widening to include a string is the same hole
          .implSeal((n: number | string, seal) => seal(n as number))
          .build();
        Val.companion<Val<"Marker", {}>>()
          // @ts-expect-error an empty payload is an object too, not a string
          .implSeal((m: unknown, seal) => seal(m as {}))
          .build();
      });

      test("a payload that is a string is exempt", () => {
        const Email = Val.companion<Email>()
          .implSeal((e: unknown, seal) => seal(e as string))
          .build();
        expect(Email.seal("a@b.com")).toBe("a@b.com");
      });
    });

    describe("the seal's return", () => {
      test("a return that can be awaited is rejected", () => {
        Val.companion<Age>()
          // @ts-expect-error a seal is synchronous
          .implSeal(async (n, seal) => seal(n))
          .build();
        Val.companion<Val<"Email", string>>()
          // @ts-expect-error a string payload is exempt from the parameter check alone
          .implSeal(async (e, seal) => seal(e))
          .build();
        Val.companion<Age>()
          // @ts-expect-error a union that includes a promise is the same
          .implSeal((n, seal) => (n > 0 ? seal(n) : Promise.resolve(seal(n))))
          .build();
        Val.companion<Age>()
          // @ts-expect-error so is a `PromiseLike`, which an async result type implements
          .implSeal((n, seal) => Promise.resolve(seal(n)) as PromiseLike<Age>)
          .build();
      });

      test("a return typed `any` is accepted", () => {
        Val.companion<Age>()
          // oxlint-disable-next-line no-explicit-any -- the case under test
          .implSeal((n, seal): any => seal(n))
          .build();
      });
    });
  });

  describe("implCreate", () => {
    test("create and seal retain their nocopy terminal operation", () => {
      type Dog = Val<"Dog", { name: string }>;
      let calls = 0;
      const Dog = Val.companion<Dog>()
        .implSeal((dog, seal) => seal({ name: dog.name.trim() }))
        .implCreate((name: string) => {
          calls += 1;
          return { name };
        })
        .build();

      const input = { name: " spot " } as const;
      const sealed = Dog.seal.nocopy(input);
      expect(sealed).not.toBe(input); // normalization, not the public input, is adopted
      expect(Object.isFrozen(sealed)).toBe(true);
      const created = Dog.create.nocopy(" spot ");
      expect(created).toEqual({ name: "spot" });
      expect(calls).toBe(1);
      expectTypeOf(Dog.seal.nocopy).parameters.toEqualTypeOf<[SeedOf<Dog>]>();
      expectTypeOf(Dog.create.nocopy).returns.toEqualTypeOf<Dog>();
    });

    test("alone it still derives: the default seal is a payload function too", () => {
      type Point = Val<"Point", { x: number; y: number }>;
      const Point = Val.companion<Point>()
        .implCreate((x: number, y: number) => ({ x, y }))
        .build();

      const p = Point.create(1, 2);
      expect(p).toEqual({ x: 1, y: 2 });
      expectTypeOf(p).toEqualTypeOf<Point>();
      expect(Point.patch(p, { x: 3 })).toEqual({ x: 3, y: 2 });
    });

    test("what create returns is sealed: it is not a way past the seal", () => {
      type Score = Val<"Score", { points: number }>;
      const Score = Val.companion<Score>()
        .implSeal((s: SeedOf<Score>, seal): Result<Score> =>
          s.points >= 0
            ? { ok: true, value: seal(s) }
            : { ok: false, error: "points must not be negative" },
        )
        .implCreate((points: number) => ({ points }))
        .build();

      expect(Score.create(3)).toEqual({ ok: true, value: { points: 3 } });
      expect(Score.create(-1)).toEqual({ ok: false, error: "points must not be negative" });
      expectTypeOf(Score.create(1)).toEqualTypeOf<Result<Score>>();
    });

    test("nocopy preserves Result behavior and adopts the created payload", () => {
      type Score = Val<"NocopyScore", { points: number }>;
      let created: SeedOf<Score> | undefined;
      const Score = Val.companion<Score>()
        .implSeal((seed, seal): Result<Score> =>
          seed.points >= 0
            ? { ok: true, value: seal(seed) }
            : { ok: false, error: "points must not be negative" },
        )
        .implCreate((points: number) => (created = { points }))
        .build();

      const copied = Score.create(1);
      expect(copied.ok).toBe(true);
      if (copied.ok) expect(copied.value).not.toBe(created);

      const adopted = Score.create.nocopy(2);
      expect(adopted.ok).toBe(true);
      if (adopted.ok) expect(adopted.value).toBe(created);

      expect(Score.create.nocopy(-1)).toEqual({
        ok: false,
        error: "points must not be negative",
      });

      const valid = { points: 3 } as const;
      const sealed = Score.seal.nocopy(valid);
      expect(sealed.ok).toBe(true);
      if (sealed.ok) expect(sealed.value).toBe(valid);
      expect(Score.seal.nocopy({ points: -1 })).toEqual({
        ok: false,
        error: "points must not be negative",
      });
    });

    test("create and seal compose: with re-seals, never re-running create", () => {
      type Member = Val<"Member", { id: string; name: string }>;
      type Fields = Omit<SeedOf<Member>, "id">;

      let created = 0;
      const Member = Val.companion<Member>()
        .implSeal((m: SeedOf<Member>, seal) => seal(m))
        .implCreate((f: Fields): SeedOf<Member> => {
          created += 1;
          return { id: `id-${created}`, ...f };
        })
        .build();

      const m = Member.create({ name: "bob" });
      expect(m).toEqual({ id: "id-1", name: "bob" });

      const renamed = Member.patch(m, { name: "sue" });
      expect(renamed).toEqual({ id: "id-1", name: "sue" });
      expect(created).toBe(1);
      expectTypeOf(renamed).toEqualTypeOf<Member>();
    });

    describe("noseal", () => {
      type SectionId = Val<"SectionId", string>;
      const hex = (text: string, seal: (text: string) => SectionId): SectionId | undefined =>
        /^[0-9a-f]{8}$/.test(text) ? seal(text) : undefined;

      test("create returns the Val, not what the seal returns", () => {
        const SectionId = Val.companion<SectionId>()
          .implSeal((text, seal): Result<SectionId> => ({ ok: true, value: seal(text) }))
          .implCreate.noseal(() => "0123abcd")
          .build();

        expect(SectionId.create()).toBe("0123abcd");
        expectTypeOf(SectionId.create).returns.toEqualTypeOf<SectionId>();
      });

      test("throws in development when the seal rejects the created payload or normalization changes it", () => {
        type Cents = Val<"NosealCents", number>;
        const rejected = Val.companion<SectionId>()
          .implSeal(hex)
          .implCreate.noseal(() => "not hex")
          .build();
        const changed = Val.companion<Cents>()
          .implSeal((n: number, seal): Cents | undefined => seal(Math.round(n)))
          .implCreate.noseal(() => 1.5)
          .build();

        const message = /payload from `\.implCreate\.noseal`/;
        expect(() => rejected.create()).toThrow(message);
        expect(() => rejected.create.nocopy()).toThrow(message);
        expect(() => changed.create()).toThrow(message);
      });

      test("nocopy adopts the created payload", () => {
        type Doc = Val<"NosealAdopted", { label: string }>;
        let created: SeedOf<Doc> | undefined;
        const Doc = Val.companion<Doc>()
          .implSeal((d, seal): Doc | undefined => seal(d))
          .implCreate.noseal(() => (created = { label: "x" }))
          .build();

        expect(Doc.create.nocopy()).toBe(created);
        expect(Doc.create()).not.toBe(created);
      });

      test("create takes no arguments", () => {
        const builder = Val.companion<SectionId>();
        // @ts-expect-error a required argument would reach the payload unsealed
        builder.implCreate.noseal((text: string) => text);
        // @ts-expect-error an optional one too
        builder.implCreate.noseal((text?: string) => text ?? "0123abcd");
        // @ts-expect-error and a rest parameter
        builder.implCreate.noseal((...texts: string[]) => texts.join(""));
        // @ts-expect-error nor return another payload
        builder.implCreate.noseal(() => 5);
      });
    });
  });

  describe("Unpatchable", () => {
    type Account = Val<"app/Account", { id: string; owner: string; note: string }>;
    type Fields = Omit<SeedOf<Account>, "id">;

    // The counter is closed over per companion, so a test never reads another test's ids.
    const account = () => {
      let created = 0;
      return Val.companion<Account, [Unpatchable<"id">]>()
        .implSeal((a, seal) => seal({ ...a, owner: a.owner.trim().toLowerCase() }))
        .implCreate((f: Fields): SeedOf<Account> => {
          created += 1;
          return { id: `id-${created}`, ...f };
        })
        .build();
    };

    test("create generates the id, and `patch` preserves it", () => {
      const Account = account();
      const a = Account.create({ owner: "bob", note: "" });
      expect(a.id).toBe("id-1");

      // still `id-1`, so neither path re-ran create
      const b = Account.patch(a, { owner: " SUE " });
      expect(b).toEqual({ id: "id-1", owner: "sue", note: "" }); // normalised by the seal
    });

    test("the id is not reachable through the patch path", () => {
      const Account = account();
      const a = Account.create({ owner: "bob", note: "" });
      expectTypeOf<Parameters<typeof Account.patch>>().toEqualTypeOf<[Account, Patch<Fields>]>();
      // @ts-expect-error id is not patchable
      Account.patch(a, { id: "forged" });
    });

    test("keys must exist on the payload", () => {
      // @ts-expect-error there is no such field
      Val.companion<Account, [Unpatchable<"nope">]>().build();
    });

    // An intersection of two would collapse to `never` and take nothing out.
    test("the keys of every `Unpatchable` in the list are taken out", () => {
      const Account = Val.companion<Account, [Unpatchable<"id">, Unpatchable<"owner">]>().build();
      expectTypeOf<Parameters<typeof Account.patch>>().toEqualTypeOf<
        [Account, Patch<Pick<SeedOf<Account>, "note">>]
      >();
    });

    test("anything but the markers is rejected", () => {
      // @ts-expect-error a key alone is not a marker
      Val.companion<Account, ["id"]>().build();
    });
  });

  describe("PrivateSeal", () => {
    type Account = Val<"SealedAccount", { id: string; owner: string }>;
    const Account = Val.companion<Account, [PrivateSeal]>()
      .implSeal((a, seal) => seal({ ...a, owner: a.owner.trim() }))
      .implCreate((owner: string) => ({ id: "a1", owner }))
      .build();

    test("takes `seal` off the companion, so a caller cannot pass what `create` generates", () => {
      expectTypeOf(Account).not.toHaveProperty("seal");
    });

    test("a step's function still receives `seal`, and `create` under `PrivateCreate`", () => {
      const Held = Val.companion<Account, [PrivateSeal, PrivateCreate]>()
        .implSeal((a, seal) => seal({ ...a, owner: a.owner.trim() }))
        .implCreate((owner: string) => ({ id: "a1", owner }))
        .impl(({ seal, create }) => ({
          reowned: (a, owner: string) => seal({ id: a.id, owner }),
          again: (a) => create(a.owner),
        }))
        .build();
      const a = Account.create(" bob ");
      expect([Held.reowned(a, " sue "), Held.again(a)]).toEqual([
        { id: "a1", owner: "sue" },
        { id: "a1", owner: "bob" },
      ]);
    });

    test("`create` and `patch` still go through the seal", () => {
      const a = Account.create(" bob ");
      expect([a, Account.patch(a, { owner: " sue " })]).toEqual([
        { id: "a1", owner: "bob" },
        { id: "a1", owner: "sue" },
      ]);
    });
  });

  describe("PrivateCreate", () => {
    type Token = Val<"HiddenToken", { value: string }>;
    const Token = Val.companion<Token, [PrivateCreate]>()
      .implCreate(() => ({ value: "t" }))
      .build();

    test("takes `create` off the companion, and leaves `seal`", () => {
      expectTypeOf(Token).not.toHaveProperty("create");
      expect(Token.seal({ value: "v" })).toEqual({ value: "v" });
    });
  });

  describe("PrivateSeal and Unpatchable together", () => {
    type Owned = Trait<"OptionOwned", { owner: string }, { owned: (self: Self) => string }>;
    const Owned = Trait.companion<Owned>().build();
    type Held = Val<"OptionHeld", { id: string; owner: string }, Owned>;
    const held = () => Val.companion<Held, [PrivateSeal, Unpatchable<"id">]>();
    type Patched = Parameters<ReturnType<ReturnType<typeof held>["build"]>["patch"]>;

    // Each step builds the companion's type again, so each has to pass the list on.
    test("hold through every later step", () => {
      const members = held()
        .impl(() => ({ label: (h) => h.owner }))
        .build();
      const traits = held()
        .implTrait(Owned, () => ({ owned: (h) => h.owner }))
        .build();
      const created = held()
        .implCreate.noseal(() => ({ id: "h1", owner: "bob" }))
        .build();
      expectTypeOf<Patched>().toEqualTypeOf<[Held, Patch<{ owner: string }>]>();
      expectTypeOf<Parameters<typeof members.patch>>().toEqualTypeOf<Patched>();
      expectTypeOf<Parameters<typeof traits.patch>>().toEqualTypeOf<Patched>();
      expectTypeOf<Parameters<typeof created.patch>>().toEqualTypeOf<Patched>();
      expectTypeOf(members).not.toHaveProperty("seal");
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
    const Greetable = Trait.companion<Greetable>()
      .impl(() => ({
        greet: (g) => `Hi, ${g.name}`, // a Val may replace this one
        shout: (g) => g.name.toUpperCase(), // declared Final: no Val may
      }))
      .build();

    type Member = Val<"Member", { id: string; name: string }, Greetable>;
    const Member = Val.companion<Member>()
      .implTrait(Greetable, () => ({
        toWire: (m, sep) => `${m.id}${sep}${m.name}`,
      }))
      .build();

    type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
    const Admin = Val.companion<Admin>()
      .implTrait(Greetable, () => ({
        toWire: (a, sep) => `admin${sep}${a.name}`,
        greet: (a) => `Sir ${a.name}`,
      }))
      .build();

    const member = Val.of<Member>({ id: "a", name: "alice" });
    const admin = Val.of<Admin>({ name: "root", level: 9 });

    test("a member without a default is the Val's own", () => {
      expect(Member.toWire(member, ":")).toBe("a:alice");
    });

    test("a member with a default is taken unless implTrait passes one", () => {
      expect([Member.greet(member), Admin.greet(admin)]).toEqual(["Hi, alice", "Sir root"]);
    });

    test("an implementation reaching the companion names it and annotates its return", () => {
      const Wired = Val.companion<Member>()
        .implTrait(Greetable, () => ({
          toWire: (m, sep): string => `${Wired.seal.nocopy(m).id}${sep}${m.name}`,
        }))
        .build();
      expect(Wired.toWire(Wired.seal({ id: "a", name: "alice" }), ":")).toBe("a:alice");
    });

    test("a member without a default must be implemented", () => {
      Val.companion<Member>()
        // @ts-expect-error `toWire` is missing
        .implTrait(Greetable, () => ({}))
        .build();
    });

    test("an implementation has no `this`, which the type says", () => {
      Val.companion<Member>()
        .implTrait(Greetable, () => ({
          toWire(m, sep) {
            expectTypeOf(this).toEqualTypeOf<undefined>();
            return `${m.id}${sep}`;
          },
        }))
        .build();

      // Where the trait implemented every member, the function is optional.
      type Hello = Trait<"Hello", { name: string }, { hello: (self: Self) => string }>;
      const Hello = Trait.companion<Hello>()
        .impl(() => ({ hello: (h) => h.name }))
        .build();
      type Guest = Val<"Guest", { name: string }, Hello>;
      Val.companion<Guest>()
        .implTrait(Hello, () => ({
          hello(g) {
            expectTypeOf(this).toEqualTypeOf<undefined>();
            return g.name;
          },
        }))
        .build();
    });

    test("the function receives the same `seal`, `create` and `patch`", () => {
      const Patched = Val.companion<Member>()
        .implTrait(Greetable, ({ patch }) => ({
          toWire: (m, sep) => patch(m, { name: sep }).name,
        }))
        .build();
      expect(Patched.toWire(Patched.seal({ id: "a", name: "alice" }), ":")).toBe(":");
    });

    test("the members a trait leaves open must be passed", () => {
      // @ts-expect-error the members the trait leaves open are missing
      Val.companion<Member>().implTrait(Greetable).build();
    });

    test("the type must declare the trait", () => {
      type Plain = Val<"Plain", { id: string; name: string }>;
      Val.companion<Plain>()
        .implTrait(
          // @ts-expect-error the type does not declare this trait
          Greetable,
          () => ({ toWire: (p, sep) => `${p.id}${sep}` }),
        )
        .build();
    });

    test("the trait brings the fields it requires into the payload", () => {
      type Badge = Val<"Badge", { id: string }, Greetable>;
      const Badge = Val.companion<Badge>()
        .implTrait(Greetable, () => ({
          toWire: (b, sep) => `${b.id}${sep}${b.name}`,
        }))
        .build();
      expectTypeOf<SeedOf<Badge>>().toEqualTypeOf<{ readonly id: string; readonly name: string }>();
      // @ts-expect-error `name` is missing
      Badge.seal({ id: "b" });
      expect(Badge.greet(Badge.seal({ id: "b", name: "bob" }))).toBe("Hi, bob");

      type Bare = Val<"Bare", Record<never, never>, Greetable>;
      expectTypeOf<Bare>().toExtend<Greetable>();
    });

    // A trait holds its shape deep-readonly, and `Val.unwrap` hands back a mutable copy.
    test("the fields come in as the trait wrote them, without readonly", () => {
      type Tagged = Trait<"Tagged", { tags: string[]; owner: User }>;
      type Post = Val<"Post", { id: string }, Tagged>;
      expectTypeOf<PayloadOf<Post>>().toEqualTypeOf<{
        id: string;
        tags: string[];
        owner: PayloadOf<User>;
      }>();

      const Post = Val.companion<Post>().build();
      const owner = { id: "u", name: "una" };
      Post.seal({ id: "p", tags: [], owner: User.seal(owner) });
      // @ts-expect-error a record is not a User
      Post.seal({ id: "p", tags: [], owner });
    });

    test("the payload may narrow a field the trait requires, but not contradict it", () => {
      expectTypeOf<Val<"Root", { name: "root" }, Greetable>>().toExtend<AnyVal>();

      type Bad = Val<"Bad", { name: number }, Greetable>;
      expectTypeOf<VerdictOf<Bad>>().toEqualTypeOf<{
        readonly __valError: "the payload and the trait declare `name` with conflicting types";
      }>();
    });

    test("a payload that is not a record cannot hold the fields", () => {
      const rejected = { __valError: "the payload does not hold what the trait requires" } as const;
      expectTypeOf<VerdictOf<Val<"Bad", string, Greetable>>>().toEqualTypeOf(rejected);
      expectTypeOf<VerdictOf<Val<"Bad", string[], Greetable>>>().toEqualTypeOf(rejected);
    });

    // Left to `implTrait`, the mistake answered "the type does not declare this trait" about a
    // trait the declaration names, and a payload holding neither shape had passed on the way.
    test("several traits are one intersection, and a union is rejected", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      type Either = Val<"Either", { id: string }, Greetable | Weighed>;
      expectTypeOf<Either>().not.toExtend<AnyVal>();
      // @ts-expect-error declare several traits with `&`, not `|`
      Val.companion<Either>().build();

      type Both = Val<"Both", { name: string; kg: number }, Greetable & Weighed>;
      expectTypeOf<Both>().toExtend<AnyVal>();
    });

    test("create, seal and patch keep working beside a trait", () => {
      type Ticket = Val<"Ticket", { id: string; name: string }, Greetable>;
      const Ticket = Val.companion<Ticket>()
        .implSeal((seed, seal) => seal(seed))
        .implCreate((name: string) => ({ id: "t1", name }))
        .implTrait(Greetable, () => ({ toWire: (t, sep) => `${t.id}${sep}${t.name}` }))
        .build();
      const t = Ticket.create("alice");
      expect([t.id, Ticket.greet(t), Ticket.patch(t, { name: "bob" }).name]).toEqual([
        "t1",
        "Hi, alice",
        "bob",
      ]);
    });

    test("equals stays the structural default", () => {
      expect(equals(member, Val.of<Member>({ name: "alice", id: "a" }))).toBe(true);
    });

    describe("a trait that implements nothing of its own", () => {
      type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
      const Wired = Trait.companion<Wired>().build();
      type Row = Val<"Row", { id: string; n: number }, Wired>;

      test("is implemented through its companion all the same", () => {
        const Row = Val.companion<Row>()
          .implTrait(Wired, () => ({
            toWire: (r, sep) => `${r.id}${sep}${r.n}`,
          }))
          .build();
        expect(Row.toWire(Val.of<Row>({ id: "r", n: 1 }), ":")).toBe("r:1");
      });

      test("cannot be named as a type argument instead", () => {
        const toWire = (r: Row, sep: string) => r.id + sep;
        // @ts-expect-error implTrait takes the trait's companion, not a type argument
        Val.companion<Row>().implTrait<Wired>({ toWire }).build();
      });

      test("nor be left out, with its members passed alone", () => {
        // The message is the parameter type, so passing the literal is what pins the wording. A
        // `@ts-expect-error` alone cannot: the call errored before this message existed too.
        const unnamed = "pass the trait's companion, then the members it leaves open";
        const row = { toWire: (r: Row, sep: string) => `${r.id}${sep}` };
        // @ts-expect-error the members alone do not say which trait they implement
        Val.companion<Row>().implTrait(row).build();
        Val.companion<Row>().implTrait(unnamed).build();
      });
    });

    describe("a Final member", () => {
      test("every implementing companion answers to it, with the trait's own implementation", () => {
        expect([Member.shout(member), Admin.shout(admin)]).toEqual(["ALICE", "ROOT"]);
      });

      test("a Val cannot override it", () => {
        Val.companion<Member>()
          .implTrait(Greetable, () => ({
            toWire: (m, sep) => `${m.id}${sep}`,
            // @ts-expect-error a Final member is not the Val's to implement
            shout: (m: Member) => m.name,
          }))
          .build();
      });

      test("nor through a payload the excess property check does not read", () => {
        const carried = {
          toWire: (m: Member, sep: string) => `${m.id}${sep}`,
          shout: (m: Member) => m.name,
        };
        Val.companion<Member>()
          // @ts-expect-error a Final member is declared `never`, so a variable carries no override in
          .implTrait(Greetable, () => carried)
          .build();
      });

      test("a companion that skipped one cannot be implemented", () => {
        Val.companion<Member>()
          .implTrait(
            // @ts-expect-error this trait's companion has not implemented every member declared Final
            Trait.companion<Greetable>()
              .impl(() => ({ greet: (g: { name: string }) => g.name }))
              .build(),
            // Annotated because the first argument is the error: the implementation loses its
            // contextual type along with it. A healthy call needs neither annotation.
            () => ({ toWire: (m: Member, sep: string) => `${m.id}${sep}` }),
          )
          .build();
      });
    });

    describe("more than one trait", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      const Weighed = Trait.companion<Weighed>()
        .impl(() => ({ heavy: (w) => w.kg > 10 }))
        .build();
      type Crate = Val<"Crate", { id: string; name: string; kg: number }, Greetable & Weighed>;
      const Crate = Val.companion<Crate>()
        .implTrait(Greetable, () => ({ toWire: (c, sep) => `${c.id}${sep}${c.name}` }))
        .implTrait(Weighed)
        .build();
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
      });

      test("one may be left unimplemented: it is then a declaration and nothing more", () => {
        const Half = Val.companion<Crate>()
          .implTrait(Greetable, () => ({
            toWire: (c, sep) => `${c.id}${sep}`,
          }))
          .build();
        expect(Half.greet(crate)).toBe("Hi, box");
        expectTypeOf(Half).not.toHaveProperty("heavy");
        expect("heavy" in Half).toBe(false);
        expect(() => {
          // @ts-expect-error nor can a box reach one
          Weighed.dyn(Half, crate).heavy();
        }).toThrow(TypeError);
      });

      test("but the same trait cannot be implemented twice", () => {
        Val.companion<Crate>()
          .implTrait(Greetable, () => ({ toWire: (c, sep) => `${c.id}${sep}` }))
          // @ts-expect-error another member already answers to one of these names
          .implTrait(Greetable, () => ({ toWire: (c, sep) => `${c.name}${sep}` }))
          .build();
      });

      test("two traits on one Val may not answer to the same name", () => {
        type Other = Trait<
          "Other",
          { name: string },
          { toWire: (self: Self, sep: string) => number }
        >;
        const Other = Trait.companion<Other>()
          .impl(() => ({}))
          .build();
        type Twice = Val<"Twice", { id: string; name: string }, Greetable & Other>;
        Val.companion<Twice>()
          .implTrait(Greetable, () => ({ toWire: (t, sep) => `${t.id}${sep}` }))
          // @ts-expect-error another member already answers to one of these names
          .implTrait(Other, () => ({ toWire: (t, sep) => t.id.length + sep.length }))
          .build();
      });

      test("nor may a member take a name another trait requires as a field", () => {
        type Tagged = Trait<"Tagged", { tag: string }, { size: (self: Self) => number }>;
        const Tagged = Trait.companion<Tagged>()
          .impl(() => ({ size: (t) => t.tag.length }))
          .build();
        type Labelled = Trait<"Labelled", { name: string }, { tag: (self: Self) => string }>;
        const Labelled = Trait.companion<Labelled>()
          .impl(() => ({ tag: (l) => l.name }))
          .build();
        type Parcel = Val<"Parcel", { name: string; tag: string }, Tagged & Labelled>;
        Val.companion<Parcel>()
          .implTrait(Tagged)
          // @ts-expect-error a member cannot take the name of a field the payload holds
          .implTrait(Labelled)
          .build();
        // The directive above takes any error on the line, so the branch is named here.
        expectTypeOf<
          Takes<Parcel, Labelled, { size: unknown }, "ok">
        >().toEqualTypeOf<"a member cannot take the name of a field the payload holds">();
      });

      test("nor to the same final", () => {
        type Yelling = Trait<"Yelling", { name: string }, { shout: Final<(self: Self) => string> }>;
        const Yelling = Trait.companion<Yelling>()
          .impl(() => ({ shout: (y) => y.name }))
          .build();
        type Crier = Val<"Crier", { id: string; name: string }, Greetable & Yelling>;
        Val.companion<Crier>()
          .implTrait(Greetable, () => ({ toWire: (c, sep) => `${c.id}${sep}` }))
          // @ts-expect-error another member already answers to one of these names
          .implTrait(Yelling)
          .build();
      });

      test("but they may require the same field", () => {
        type Weighing = Trait<"Weighing", { name: string }, { kilos: (self: Self) => number }>;
        const Weighing = Trait.companion<Weighing>()
          .impl(() => ({ kilos: (_w) => 0 }))
          .build();
        type Parcel = Val<"Parcel", { id: string; name: string }, Greetable & Weighing>;
        const Parcel = Val.companion<Parcel>()
          .implTrait(Greetable, () => ({ toWire: (p, sep) => `${p.id}${sep}` }))
          .implTrait(Weighing)
          .build();
        const p = Val.of<Parcel>({ id: "p", name: "box" });
        expect([Parcel.greet(p), Parcel.kilos(p)]).toEqual(["Hi, box", 0]);
      });

      test("unless no payload satisfies both", () => {
        type Sized = Trait<"Sized", { name: number }, { half: (self: Self) => number }>;
        type Both = Val<"Both", { id: string }, Greetable & Sized>;
        expectTypeOf<VerdictOf<Both>>().toEqualTypeOf<{
          readonly __valError: "no value fits every declaration of `name`";
        }>();
      });
    });

    describe("names", () => {
      // Every message is the parameter type, so passing the literal is what pins the wording.
      const taken = "this name is already taken";

      test("a companion may not grow a function over a member", () => {
        Val.companion<Member>()
          .implTrait(Greetable, () => ({ toWire: (m, sep) => `${m.id}${sep}` }))
          // @ts-expect-error this name is already taken
          .impl(() => ({ greet: (m) => `yo ${m.name}` }))
          .build();
        Val.companion<Member>()
          .implTrait(Greetable, () => ({ toWire: (m, sep) => `${m.id}${sep}` }))
          .impl(() => ({ greet: taken }))
          .build();
      });

      test("nor may a trait's member take a name `impl` took before it", () => {
        Val.companion<Member>()
          .impl(() => ({ greet: (m) => m.name }))
          // @ts-expect-error another member already answers to one of these names
          .implTrait(Greetable, () => ({ toWire: (m, sep) => `${m.id}${sep}` }))
          .build();
        // The directive above takes any error on the line, so the branch is named here.
        expectTypeOf<
          Takes<Member, Greetable, { greet: unknown }, "ok">
        >().toEqualTypeOf<"another member already answers to one of these names">();
      });

      test("nor over a final function", () => {
        Val.companion<Member>()
          .implTrait(Greetable, () => ({ toWire: (m, sep) => `${m.id}${sep}` }))
          // @ts-expect-error this name is already taken
          .impl(() => ({ shout: (m) => m.name }))
          .build();
      });

      // A string key here once overwrote the record `dyn` reads.
      test("but may take any string the library once kept", () => {
        const Kept = Val.companion<Member>()
          .implTrait(Greetable, () => ({ toWire: (m, sep) => `${m.id}${sep}` }))
          .impl(() => ({ __valof_traits: (m) => m.name }))
          .build();
        expect([Kept.__valof_traits(member), Greetable.dyn(Kept, member).greet()]).toEqual([
          "alice",
          "Hi, alice",
        ]);
      });

      test("but may take a step's name: the companion holds no step", () => {
        const Stepped = Val.companion<Member>()
          .impl(() => ({
            impl: (m) => m.id,
            implTrait: (m) => m.name,
            implCreate: (m) => m.id,
            build: (m) => m.name,
          }))
          .build();
        expect([Stepped.impl(member), Stepped.build(member)]).toEqual(["a", "alice"]);
      });

      test("but may take `nocopy`: the seal holds that one, not the companion", () => {
        const Copied = Val.companion<Member>()
          .impl(() => ({ nocopy: (m) => m.name }))
          .build();
        expect(Copied.nocopy(member)).toBe("alice");
      });

      // The companion becomes a thenable, and the caller is responsible for avoiding that.
      test("but may take `then`", () => {
        const Thenable = Val.companion<Member>()
          // oxlint-disable-next-line no-thenable -- accepting it is what this test reads
          .impl(() => ({ then: (m: Member) => m.name }))
          .build();
        expect(Thenable.then(member)).toBe("alice");
      });

      test("a member may not take a name the payload holds", () => {
        type Loud = Trait<"Loud", { name: string }, { greet: (self: Self) => string }>;
        const Loud = Trait.companion<Loud>()
          .impl(() => ({ greet: (l) => l.name }))
          .build();
        type Sign = Val<"Sign", { name: string; greet: string }, Loud>;
        Val.companion<Sign>()
          .implTrait(
            // @ts-expect-error a member cannot take the name of a field the payload holds
            Loud,
          )
          .build();
      });
    });
  });
});
