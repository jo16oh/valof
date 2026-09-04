import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type { AnyVal, SeedOf, Patch, PayloadOf } from "../src/index.ts";
import { Val } from "../src/index.ts";
// `BrandOf` and `deepEquals` are internal to the package, so they come from the
// implementation module rather than the entry point.
import type { BrandOf } from "../src/val.ts";
import { deepEquals } from "../src/val.ts";

type User = Val<"app/User", { id: string; name: string; nickname?: string }>;

const User = Val.sealer<User>().impl({
  greet(u) {
    return `Hi, I'm ${u.name}.`;
  },
});

describe("basics", () => {
  test("the constructor returns an equal value, copied", () => {
    const raw = { id: "a", name: "bob" };
    const user = User(raw);
    expect(user).toEqual(raw);
    expect(user).not.toBe(raw);
    expect(user.name).toBe("bob");
  });

  test("companion methods are attached", () => {
    expect(User.greet(User({ id: "a", name: "bob" }))).toBe("Hi, I'm bob.");
  });

  test("Val.of copies too", () => {
    const raw = { id: "a", name: "alice" };
    const user = Val.of<User>(raw);
    expect(user).toEqual(raw);
    expect(user).not.toBe(raw);
  });

  test("Val.unwrap hands back a mutable copy", () => {
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

  test("Val.unwrap works on primitive and array payloads", () => {
    const IsoDate = Val.sealer<Val<"IsoDate", string>>();
    expect(Val.unwrap(IsoDate("2026-01-01"))).toBe("2026-01-01");

    const Tags = Val.sealer<Val<"Tags", readonly string[]>>();
    const tags = Tags(["a", "b"]);
    const raw = Val.unwrap(tags);
    expect(raw).toEqual(["a", "b"]);
    expect(raw).not.toBe(tags);
  });

  test("a nested Val survives unwrap as data", () => {
    type Money = Val<"Money", { amount: number; currency: string }>;
    type Order = Val<"Order", { id: string; total: Money }>;
    const Money = Val.sealer<Money>();
    const Order = Val.sealer<Order>();
    const order = Order({ id: "o", total: Money({ amount: 1, currency: "JPY" }) });

    const raw = Val.unwrap(order);
    expect(raw).toEqual({ id: "o", total: { amount: 1, currency: "JPY" } });
    expect(Money.equals(raw.total, Money({ amount: 1, currency: "JPY" }))).toBe(true);
  });

  test("the brand does not exist at runtime", () => {
    const user = User({ id: "a", name: "bob" });
    expect(Object.keys(user)).toEqual(["id", "name"]);
    expect(Reflect.ownKeys(user)).toEqual(["id", "name"]);
    expect(JSON.parse(JSON.stringify(user))).toEqual({ id: "a", name: "bob" });
    expect(structuredClone(user)).toEqual({ id: "a", name: "bob" });
  });

  test("values are not frozen", () => {
    expect(Object.isFrozen(User({ id: "a", name: "bob" }))).toBe(false);
  });
});

type IsoDate = Val<"IsoDate", string>;
type Tags = Val<"Tags", Readonly<Record<string, true>>>;
type Grid = Val<"Grid", ReadonlyArray<ReadonlyArray<number>>>;

describe("wrapping primitives and containers", () => {
  test("a primitive can be wrapped directly", () => {
    const IsoDate = Val.sealer<IsoDate>();
    const d = IsoDate("2026-09-02");
    expect(d).toBe("2026-09-02");
    expectTypeOf(d).toExtend<string>();
  });

  test("a Record works as a Set", () => {
    const Tags = Val.sealer<Tags>();
    const t = Tags({ a: true, b: true });
    expect(t.a).toBe(true);
    expect(t.c).toBeUndefined();
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
    const Email = Val.sealer<Email>().impl({
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    });
    expect(Email.equals(Email("A@b.com"), Email("a@B.com"))).toBe(true);
  });

  test("an override is handed the structural default as a third argument", () => {
    type Doc = Val<"Doc", { id: string; body: string }>;
    // Published docs are identified by id; drafts have no stable one, so they fall
    // back to the structural comparison.
    const Doc = Val.sealer<Doc>().impl({
      equals: (a, b, deep) => (a.id.startsWith("draft:") ? deep(a, b) : a.id === b.id),
    });

    expect(Doc.equals(Doc({ id: "1", body: "x" }), Doc({ id: "1", body: "edited" }))).toBe(true);
    expect(Doc.equals(Doc({ id: "1", body: "x" }), Doc({ id: "2", body: "x" }))).toBe(false);

    const draft = { id: "draft:1", body: "x" };
    expect(Doc.equals(Doc(draft), Doc({ ...draft }))).toBe(true);
    expect(Doc.equals(Doc(draft), Doc({ ...draft, body: "y" }))).toBe(false);
  });

  test("callers pass two arguments; the third is bound for the override", () => {
    type N = Val<"N", number>;
    // `deep` would be `undefined`, and throw when called, if the override were attached
    // raw instead of wrapped with the default bound to it.
    const N = Val.sealer<N>().impl({ equals: (a, b, deep) => deep(a, b) });

    expect(N.equals(N(1), N(1))).toBe(true);
    expect(N.equals(N(1), N(2))).toBe(false);
    expectTypeOf(N.equals).parameters.toEqualTypeOf<[N, N]>();
  });

  test("an override without the third parameter still works", () => {
    type S = Val<"S", string>;
    const S = Val.sealer<S>().impl({ equals: (a, b) => a.length === b.length });
    expect(S.equals(S("ab"), S("cd"))).toBe(true);
  });
});

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

type Age = Val<"Age", number>;

const Age = Val.companion<Age>().implSeal((n: number, seal): Result<Age> =>
  n >= 0 && Number.isInteger(n)
    ? { ok: true, value: seal(n) }
    : { ok: false, error: "age must be a non-negative integer" },
);

describe("smart constructor", () => {
  test("a companion has no constructor to bypass", () => {
    expect(typeof Age).not.toBe("function");
  });

  test("seal may return a Result (the library never inspects it)", () => {
    expect(Age.seal(30)).toEqual({ ok: true, value: 30 });
    expect(Age.seal(-1)).toEqual({ ok: false, error: "age must be a non-negative integer" });
  });

  test("construct in normal form", () => {
    type Email = Val<"Email", string>;
    const Email = Val.companion<Email>().implSeal((s: string, seal) =>
      seal(s.trim().toLowerCase()),
    );
    expect(Email.seal("  A@B.com ")).toBe("a@b.com");
    // normalised at construction, so a parent's structural comparison is correct
    expect(deepEquals(Email.seal(" a@b.com"), Email.seal("A@B.COM"))).toBe(true);
  });
});

describe("with", () => {
  test("omitting a key leaves it unchanged", () => {
    const u = User({ id: "a", name: "bob", nickname: "bo" });
    expect(User.with(u, { name: "sue" })).toEqual({
      id: "a",
      name: "sue",
      nickname: "bo",
    });
  });

  test("undefined deletes the key", () => {
    const u = User({ id: "a", name: "bob", nickname: "bo" });
    const next = User.with(u, { nickname: undefined });
    expect(Object.hasOwn(next, "nickname")).toBe(false);
    expect(next).toEqual({ id: "a", name: "bob" });
  });

  test("does not mutate the original value", () => {
    const u = User({ id: "a", name: "bob" });
    User.with(u, { name: "sue" });
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
    expect(Account.with(acc, { balance: 50 })).toEqual({
      ok: true,
      value: { id: "a", balance: 50 },
    });
    expect(Account.with(acc, { balance: -1 })).toEqual({
      ok: false,
      error: "balance must not be negative",
    });

    expectTypeOf(Account.with(acc, { balance: 1 })).toEqualTypeOf<Result<Account>>();
  });

  test("returns the Val itself when the seal is the default", () => {
    const u = User({ id: "a", name: "bob" });
    expectTypeOf(User.with(u, { name: "x" })).toEqualTypeOf<User>();
  });

  test("is not offered at all on a non-object Val", () => {
    const IsoDate = Val.sealer<IsoDate>();
    expectTypeOf(IsoDate).not.toHaveProperty("with");
  });

  test("still guards at runtime, for callers without types", () => {
    const IsoDate = Val.sealer<IsoDate>() as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(() => IsoDate.with("2026-09-02", {})).toThrow(/object-shaped/);
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

describe("types", () => {
  test("different brands are not assignable", () => {
    type A = Val<"A", string>;
    type B = Val<"B", string>;
    expectTypeOf<A>().not.toExtend<B>();
    expectTypeOf<A>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<A>();
  });

  test("DeepReadonly applies", () => {
    type Post = Val<"Post", { title: string; tags: string[] }>;
    const post = Val.of<Post>({ title: "t", tags: ["a"] });
    expectTypeOf(post.tags).toEqualTypeOf<readonly string[]>();
    // @ts-expect-error readonly, so it cannot be assigned
    post.title = "x";
    // @ts-expect-error a readonly array cannot be pushed to
    post.tags.push("b");
  });

  test("nested Vals keep their brand", () => {
    type Money = Val<"Money", { amount: number; currency: string }>;
    type Order = Val<"Order", { id: string; total: Money }>;
    const Order = Val.sealer<Order>();
    const order = Order({ id: "o", total: Val.of<Money>({ amount: 1, currency: "JPY" }) });
    expectTypeOf(order.total).toEqualTypeOf<Money>();
  });

  test("a Val with a smart constructor cannot be called directly", () => {
    // never evaluated: only the type check matters, and calling it would throw
    const neverRun = (): unknown => {
      // @ts-expect-error Age has a smart constructor
      return Age(30);
    };
    expect(typeof neverRun).toBe("function");
  });

  test("undefined on a required key is a type error", () => {
    const u = User({ id: "a", name: "bob" });
    // @ts-expect-error a required key cannot be deleted
    User.with(u, { name: undefined });
    // optional keys can be deleted
    User.with(u, { nickname: undefined });
  });

  test("an array Val is a branded ReadonlyArray", () => {
    const GridVal = Val.sealer<Grid>();
    const g = GridVal([[1]]);
    expectTypeOf(g).toExtend<readonly (readonly number[])[]>();
  });

  test("BrandOf / PayloadOf", () => {
    expectTypeOf<BrandOf<User>>().toEqualTypeOf<"app/User">();
    expectTypeOf<PayloadOf<IsoDate>>().toEqualTypeOf<string>();
  });
});

describe("validate", () => {
  test("undefined as a required key's value is rejected", () => {
    type Bad = Val<"Bad", { nickname: string | undefined }>;
    expectTypeOf<Bad>().not.toExtend<AnyVal>();
    const build = () =>
      // @ts-expect-error required property cannot be undefined
      Val.companion<Bad>();
    expect(typeof build).toBe("function");
  });

  test("functions are rejected", () => {
    type Bad = Val<"Bad", { run: () => void }>;
    expectTypeOf<Bad>().not.toExtend<AnyVal>();
  });

  test("number and symbol keys are rejected", () => {
    expectTypeOf<Val<"Bad", Readonly<Record<number, true>>>>().not.toExtend<AnyVal>();
    expectTypeOf<Val<"Bad", Readonly<Record<symbol, string>>>>().not.toExtend<AnyVal>();
    expectTypeOf<Val<"Bad", { readonly 1: string }>>().not.toExtend<AnyVal>();
  });

  test("optional keys are allowed", () => {
    type Ok = Val<"Ok", { nickname?: string }>;
    expectTypeOf<Ok>().toExtend<AnyVal>();
  });

  test("Vals, arrays, records and primitives are allowed", () => {
    expectTypeOf<Val<"A", string>>().toExtend<AnyVal>();
    expectTypeOf<Val<"B", bigint>>().toExtend<AnyVal>();
    expectTypeOf<Val<"C", readonly string[]>>().toExtend<AnyVal>();
    expectTypeOf<Val<"D", Readonly<Record<string, true>>>>().toExtend<AnyVal>();
    expectTypeOf<Val<"E", { at: Val<"A", string>; n: number | null }>>().toExtend<AnyVal>();
  });
});

describe("a seal cannot take a wire format", () => {
  type Age = Val<"Age", number>;
  type Email = Val<"Email", string>;

  test("a parameter wider than the payload is fine while it excludes strings", () => {
    const wide = Val.companion<User>().implSeal((u: object, seal) => seal(u as SeedOf<User>));
    const record = Val.companion<User>().implSeal((u: Record<string, unknown>, seal) =>
      seal(u as SeedOf<User>),
    );
    expect(typeof wide.seal).toBe("function");
    expect(typeof record.seal).toBe("function");
  });

  test("a parameter that also accepts a string is rejected", () => {
    const build = () => {
      // @ts-expect-error a seal takes the payload, not a wire format
      Val.companion<User>().implSeal((u: unknown, seal) => seal(u as SeedOf<User>));
      // @ts-expect-error `{}` accepts a string too
      Val.companion<User>().implSeal((u: {}, seal) => seal(u as SeedOf<User>));
      // @ts-expect-error a primitive payload has nothing to parse
      Val.companion<Age>().implSeal((n: unknown, seal) => seal(n as number));
      // @ts-expect-error widening to include a string is the same hole
      Val.companion<Age>().implSeal((n: number | string, seal) => seal(n as number));
    };
    expect(typeof build).toBe("function");
  });

  test("a payload that is a string is exempt", () => {
    const Email = Val.companion<Email>().implSeal((e: unknown, seal) => seal(e as string));
    expect(typeof Email.seal).toBe("function");
  });
});

describe("sealer", () => {
  test("a bare sealer is a complete companion", () => {
    const IsoDate = Val.sealer<IsoDate>();
    expect(typeof IsoDate).toBe("function");
    expect(IsoDate("2026-09-02")).toBe("2026-09-02");
    expect(IsoDate.equals(IsoDate("a"), IsoDate("a"))).toBe(true);
  });

  test("impl() keeps the constructor it was built from", () => {
    const seal = Val.sealer<User>();
    const withMethods = seal.impl({ shout: (u) => u.name.toUpperCase() });
    expect(typeof withMethods).toBe("function");
    expect(withMethods({ id: "a", name: "bob" })).toEqual({ id: "a", name: "bob" });
    expect(withMethods.shout(Val.of<User>({ id: "a", name: "bob" }))).toBe("BOB");
  });

  test("impl() does not mutate the sealer it was built from", () => {
    const seal = Val.sealer<User>();
    seal.impl({ shout: (u) => u.name });
    expect("shout" in seal).toBe(false);
  });

  test("a companion has no constructor to reach", () => {
    const Priv = Val.companion<Age>().implSeal((n: number, seal) => seal(n));
    expect(typeof Priv).not.toBe("function");
    // never evaluated: only the type check matters
    const neverRun = (): unknown =>
      // @ts-expect-error a companion is not callable
      Priv(1);
    expect(typeof neverRun).toBe("function");
  });

  test("with routes through the seal, whatever the seal returns", () => {
    type Box = Val<"Box", { n: number }>;
    const box = Val.sealer<Box>();
    const Box = Val.companion<Box>().implSeal((b: { n: number }) => ({ tagged: box(b) }));
    const out = Box.with(Val.of<Box>({ n: 1 }), { n: 2 });
    expectTypeOf(out).toEqualTypeOf<{ tagged: Box }>();
    expect(out).toEqual({ tagged: { n: 2 } });
  });

  test("a constructor that cannot take the payload is rejected where it is written", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const point = Val.sealer<Point>();
    Val.companion<Point>().implSeal(
      // @ts-expect-error a seal must accept the whole payload; this one takes two numbers
      (x: number, y: number) => point({ x, y }),
    );
  });

  test("create alone still rebuilds: the default seal is a payload function too", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const Point = Val.companion<Point>().implCreate((x: number, y: number) => ({ x, y }));

    const p = Point.create(1, 2);
    expect(p).toEqual({ x: 1, y: 2 });
    expectTypeOf(p).toEqualTypeOf<Point>();
    expect(Point.with(p, { x: 3 })).toEqual({ x: 3, y: 2 });
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
    type User = Val<"user/User", { id: string; name: string }>;
    type Fields = Omit<SeedOf<User>, "id">;

    let minted = 0;
    const User = Val.companion<User>()
      .implCreate((f: Fields): SeedOf<User> => {
        minted += 1;
        return { id: `id-${minted}`, ...f };
      })
      .implSeal((u: SeedOf<User>, seal) => seal(u));

    const u = User.create({ name: "bob" });
    expect(u).toEqual({ id: "id-1", name: "bob" });

    const v = User.with(u, { name: "sue" });
    expect(v).toEqual({ id: "id-1", name: "sue" });
    expect(minted).toBe(1);
    expectTypeOf(v).toEqualTypeOf<User>();
  });

  test("your own with still wins over the default rebuild", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const point = Val.sealer<Point>();
    const make = (x: number, y: number): Point => point({ x, y });

    const Point = Val.companion<Point>()
      .implCreate(make)
      .impl({
        with(p, patch: { x?: number; y?: number }): Point {
          return make(patch.x ?? p.x, patch.y ?? p.y);
        },
      });

    const p = Val.of<Point>({ x: 1, y: 2 });
    expectTypeOf(Point.with(p, { x: 3 })).toEqualTypeOf<Point>();
    expect(Point.with(p, { x: 3 })).toEqual({ x: 3, y: 2 });
  });

  test("an explicit with reaches even a primitive Val, which has none by default", () => {
    const IsoDate = Val.companion<IsoDate>().impl({
      with(d, days: number): IsoDate {
        return Val.of<IsoDate>(`${d}+${days}`);
      },
    });
    expect(IsoDate.with(Val.of<IsoDate>("2026-09-02"), 1)).toBe("2026-09-02+1");
  });
});

test("sealer > companion() mirrors sealer(), minus the constructor", () => {
  const bare = Val.companion<Age>();
  expect(typeof bare).not.toBe("function");
  expect(bare.equals(Val.of<Age>(1), Val.of<Age>(1))).toBe(true);

  const built = bare.impl({ label: (a) => `${a}` });
  expect(built.label(Val.of<Age>(7))).toBe("7");
  expect("label" in bare).toBe(false);
});

describe("constructors copy their argument", () => {
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
    type Grid = Val<"Grid", readonly (readonly number[])[]>;
    const Grid = Val.sealer<Grid>();
    const rows = [[1, 2], [3]];
    const grid = Grid(rows);
    rows[0]![0] = 99;
    expect(grid[0]![0]).toBe(1);
    expect(grid).toEqual([[1, 2], [3]]);
  });

  test("a patch handed to `with` is copied as well", () => {
    const total = { amount: 100, currency: "JPY" };
    const order = Order.with(Order({ id: "o", total: { amount: 1, currency: "JPY" } }), { total });
    total.amount = 999;
    expect(order.total.amount).toBe(100);
  });

  test("a `__proto__` key stays an own property", () => {
    type Tags = Val<"Tags", Readonly<Record<string, true>>>;
    const Tags = Val.sealer<Tags>();
    const tags = Tags(JSON.parse('{"a":true,"__proto__":{"isAdmin":true}}'));
    expect(Object.keys(tags)).toEqual(["a", "__proto__"]);
    expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);
    expect((tags as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    expect(JSON.parse(JSON.stringify(tags))).toEqual(JSON.parse(JSON.stringify(Val.unwrap(tags))));
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

  test("in a production build a non-plain object is kept rather than emptied", () => {
    class Wrapped {
      greet(): string {
        return "hi";
      }
    }
    type Holder = Val<"Holder", { readonly at: Readonly<Record<string, string>> }>;
    // The type rules this payload out, so the cast is how the runtime path is reached at all.
    const hold = (at: unknown) => Val.of<Holder>({ at } as unknown as SeedOf<Holder>).at;
    const at = new Date(0);
    const previous = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      // Copying a `Date` key by key would leave `{}`, so the original is handed back instead.
      expect(hold(at)).toBe(at);
      expect(hold(new Wrapped())).toBeInstanceOf(Wrapped);
      // A plain object with nothing in it is still copied, not shared.
      const empty = {};
      expect(hold(empty)).not.toBe(empty);
    } finally {
      process.env["NODE_ENV"] = previous;
    }
  });

  test("a null-prototype object is allowed, and comes back plain", () => {
    type Tags = Val<"Tags", Readonly<Record<string, true>>>;
    const source = Object.assign(Object.create(null) as Record<string, true>, { a: true });
    const tags = Val.of<Tags>(source);
    expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);
    expect(tags["a"]).toBe(true);
  });

  test("primitives pass through as-is", () => {
    const IsoDate = Val.sealer<IsoDate>();
    expect(IsoDate("2026-09-02")).toBe("2026-09-02");
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
    type Tags = Val<"Tags", string[]>;
    const Tags = Val.companion<Tags>().implSeal((t, seal) => seal(t.toSorted()));
    const raw = ["b", "a"];
    expect(Tags.seal(raw)).toEqual(["a", "b"]);
    expect(raw).toEqual(["b", "a"]);
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
});

describe("implSeal", () => {
  test("registers `seal` and routes with / update through it, without any impl", () => {
    type Score = Val<"Score", { points: number }>;
    const Score = Val.companion<Score>().implSeal((s: { points: number }, seal): Result<Score> =>
      s.points >= 0
        ? { ok: true, value: seal(s) }
        : { ok: false, error: "points must not be negative" },
    );

    const s = Val.of<Score>({ points: 3 });
    expectTypeOf(Score.with(s, { points: 1 })).toEqualTypeOf<Result<Score>>();
    expect(Score.with(s, { points: -1 })).toEqual({
      ok: false,
      error: "points must not be negative",
    });
    expect(Score.equals(s, Val.of<Score>({ points: 3 }))).toBe(true);
  });

  test("methods added afterwards keep the contextual type and the routing", () => {
    type Score = Val<"Score", { points: number }>;
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
    expectTypeOf(Score.with(s, { points: 1 })).toEqualTypeOf<Score>();
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

  test("a sealer has no implSeal: a second, checked seal beside the plain one is a hole", () => {
    expectTypeOf(Val.sealer<User>()).not.toHaveProperty("implSeal");
  });

  test("the default seal comes in as a second parameter, so Val.of is not needed", () => {
    type Email = Val<"Email", string>;
    const Email = Val.companion<Email>().implSeal((s: string, seal) => {
      expectTypeOf(seal).toEqualTypeOf<(value: string) => Email>();
      return seal(s.trim().toLowerCase());
    });

    const e = Email.seal("  A@B.com ");
    expectTypeOf(e).toEqualTypeOf<Email>();
    expect(e).toBe("a@b.com");
    // callers pass the payload only
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
    type Score = Val<"Score", { points: number }>;
    const Score = Val.companion<Score>().implSeal((s, seal) => seal(s));
    const s = Val.of<Score>({ points: 3 });
    expect(Score.seal(s)).toEqual({ points: 3 });
  });
});

describe("unpatchable", () => {
  type Account = Val<"app/Account", { id: string; owner: string; note: string }>;
  type Fields = Omit<SeedOf<Account>, "id">;

  let minted = 0;
  const Account = Val.companion<Account>()
    .implCreate((f: Fields): SeedOf<Account> => {
      minted += 1;
      return { id: `id-${minted}`, ...f };
    })
    .implSeal((a, seal) => seal({ ...a, owner: a.owner.trim().toLowerCase() }))
    .unpatchable<"id">();

  test("create mints the id; with and update preserve it", () => {
    const a = Account.create({ owner: "bob", note: "" });
    expect(a.id).toBe("id-1");

    const b = Account.with(a, { owner: " SUE " });
    expect(b).toEqual({ id: "id-1", owner: "sue", note: "" }); // normalised by the seal

    const c = Account.update(b, (v) => ({ owner: v.owner, note: "seen" }));
    expect(c).toEqual({ id: "id-1", owner: "sue", note: "seen" });
    expect(minted).toBe(1);
  });

  test("the id is not reachable through either update path", () => {
    const a = Account.create({ owner: "bob", note: "" });
    expectTypeOf(Account.with).parameters.toEqualTypeOf<[Account, Patch<Fields>]>();
    // @ts-expect-error id is not patchable
    Account.with(a, { id: "forged" });
    // @ts-expect-error the transform cannot return an id either
    Account.update(a, (v) => ({ ...v, id: "forged" }));
  });

  test("the callback returns only what is left, and the rest is merged back on", () => {
    const a = Account.create({ owner: "bob", note: "x" });
    expectTypeOf(
      Account.update(a, (v) => ({ owner: v.owner, note: "y" })),
    ).toEqualTypeOf<Account>();
    expect(Account.update(a, (v) => ({ owner: v.owner, note: "y" })).id).toBe(a.id);
  });

  test("keys must exist on the payload", () => {
    // @ts-expect-error there is no such field
    Val.companion<Account>().unpatchable<"nope">();
  });
});

describe("a hand-written with / update is handed the seal", () => {
  type Point = Val<"Point", { x: number; y: number }>;

  const Point = Val.companion<Point>()
    .implSeal((p, seal) => seal({ x: Math.trunc(p.x), y: Math.trunc(p.y) }))
    .impl({
      with(p, patch: { x?: number; y?: number }, seal) {
        return seal({ ...p, ...patch });
      },
    });

  test("the override rebuilds through the type's own seal", () => {
    const p = Point.seal({ x: 1, y: 2 });
    expect(Point.with(p, { x: 3.7 })).toEqual({ x: 3, y: 2 }); // truncated by the seal
  });

  test("callers still pass two arguments", () => {
    const p = Point.seal({ x: 1, y: 2 });
    expectTypeOf(Point.with).parameters.toEqualTypeOf<[Point, { x?: number; y?: number }]>();
    expectTypeOf(Point.with(p, { y: 9 })).toEqualTypeOf<Point>();
  });

  test("the two-parameter form still works", () => {
    const Plain = Val.companion<Point>().impl({
      with(p, patch: { x?: number }): Point {
        return Val.of<Point>({ ...p, ...patch });
      },
    });
    expect(Plain.with(Val.of<Point>({ x: 1, y: 2 }), { x: 5 })).toEqual({ x: 5, y: 2 });
  });
});
