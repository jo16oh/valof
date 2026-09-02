import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type { AnyVal, BrandOf, Input, Patch, PayloadOf } from "../src/index.ts";
import { deepEquals, Val } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

type User = Val<"app/User", { id: string; name: string; nickname?: string }>;

const User = Val.sealer<User>().impl({
  greet(u: User) {
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

// ---------------------------------------------------------------------------
// Wrapping primitives, arrays and records
// ---------------------------------------------------------------------------

type IsoDate = Val<"IsoDate", string>;
type Tags = Val<"Tags", Readonly<Record<string, true>>>;
type Grid = Val<"Grid", readonly (readonly number[])[]>;

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

// ---------------------------------------------------------------------------
// Equality (design §5)
// ---------------------------------------------------------------------------

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
      equals: (a: Email, b: Email) => a.toLowerCase() === b.toLowerCase(),
    });
    expect(Email.equals(Email("A@b.com"), Email("a@B.com"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Smart constructors (design §6.1)
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

type Age = Val<"Age", number>;

const Age = Val.companion<Age>().implFrom((n: number): Result<Age> =>
  n >= 0 && Number.isInteger(n)
    ? { ok: true, value: Val.of<Age>(n) }
    : { ok: false, error: "age must be a non-negative integer" },
);

describe("smart constructor", () => {
  test("a companion has no constructor to bypass", () => {
    // Nothing is gated: the plain constructor was never created in the first place.
    expect(typeof Age).not.toBe("function");
  });

  test("from may return a Result (the library never inspects it)", () => {
    expect(Age.from(30)).toEqual({ ok: true, value: 30 });
    expect(Age.from(-1)).toEqual({ ok: false, error: "age must be a non-negative integer" });
  });

  test("construct in normal form", () => {
    type Email = Val<"Email", string>;
    const Email = Val.companion<Email>().implFrom((s: string) =>
      Val.of<Email>(s.trim().toLowerCase()),
    );
    expect(Email.from("  A@B.com ")).toBe("a@b.com");
    // Normalised at construction, so a structural comparison from a parent is correct
    expect(deepEquals(Email.from(" a@b.com"), Email.from("A@B.COM"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// with / update（§6.2 / §6.4）
// ---------------------------------------------------------------------------

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

  test("goes through from when from is defined", () => {
    type Account = Val<"Account", { id: string; balance: number }>;
    const Account = Val.companion<Account>().implFrom(
      (a: { id: string; balance: number }): Result<Account> =>
        a.balance >= 0
          ? { ok: true, value: Val.of<Account>(a) }
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

  test("returns the Val itself when there is no from", () => {
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

  test("goes through from when from is defined", () => {
    expect(Age.update(Val.of<Age>(30), (n) => n + 1)).toEqual({ ok: true, value: 31 });
    expect(Age.update(Val.of<Age>(0), (n) => n - 1)).toEqual({
      ok: false,
      error: "age must be a non-negative integer",
    });
  });
});

// ---------------------------------------------------------------------------
// Type level
// ---------------------------------------------------------------------------

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
    // Calling it throws, so keep it in a block that is never evaluated — we only want the type check.
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

// ---------------------------------------------------------------------------
// Allowed-type validation (design §3)
// ---------------------------------------------------------------------------

describe("validate", () => {
  test("undefined as a required key's value is rejected", () => {
    type Bad = Val<"Bad", { nickname: string | undefined }>;
    // Contains Invalid<...>, so it does not satisfy AnyVal
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

describe("sealer", () => {
  test("a bare sealer is a complete companion", () => {
    const IsoDate = Val.sealer<IsoDate>();
    expect(typeof IsoDate).toBe("function");
    expect(IsoDate("2026-09-02")).toBe("2026-09-02");
    expect(IsoDate.equals(IsoDate("a"), IsoDate("a"))).toBe(true);
  });

  test("impl() keeps the constructor it was built from", () => {
    const seal = Val.sealer<User>();
    const withMethods = seal.impl({ shout: (u: User) => u.name.toUpperCase() });
    expect(typeof withMethods).toBe("function");
    expect(withMethods({ id: "a", name: "bob" })).toEqual({ id: "a", name: "bob" });
    expect(withMethods.shout(Val.of<User>({ id: "a", name: "bob" }))).toBe("BOB");
  });

  test("impl() does not mutate the sealer it was built from", () => {
    const seal = Val.sealer<User>();
    seal.impl({ shout: (u: User) => u.name });
    expect("shout" in seal).toBe(false);
  });

  test("a companion has no constructor to reach", () => {
    const Priv = Val.companion<Age>().implFrom((n: number) => Val.of<Age>(n));
    expect(typeof Priv).not.toBe("function");
    // Calling it throws, so keep it in a block that is never evaluated.
    const neverRun = (): unknown =>
      // @ts-expect-error a companion is not callable
      Priv(1);
    expect(typeof neverRun).toBe("function");
  });

  test("with routes through from, whatever from returns", () => {
    type Box = Val<"Box", { n: number }>;
    const seal = Val.sealer<Box>();
    const Box = Val.companion<Box>().implFrom((b: { n: number }) => ({ tagged: seal(b) }));
    const out = Box.with(Val.of<Box>({ n: 1 }), { n: 2 });
    expectTypeOf(out).toEqualTypeOf<{ tagged: Box }>();
    expect(out).toEqual({ tagged: { n: 2 } });
  });

  test("a constructor that cannot take the payload is rejected where it is written", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const seal = Val.sealer<Point>();
    Val.companion<Point>().implFrom(
      // @ts-expect-error a from must accept the whole payload; this one takes two numbers
      (x: number, y: number) => seal({ x, y }),
    );
  });

  test("create alone leaves with / update out: there is nothing to rebuild through", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const seal = Val.sealer<Point>();
    const Point = Val.companion<Point>().implCreate((x: number, y: number) => seal({ x, y }));

    expect(Point.create(1, 2)).toEqual({ x: 1, y: 2 });
    expectTypeOf(Point).not.toHaveProperty("with");
    expectTypeOf(Point).not.toHaveProperty("update");

    const loose = Point as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(() => loose.with(Val.of<Point>({ x: 1, y: 2 }), { x: 3 })).toThrow(/needs a `from`/);
    expect(() => loose.update(Val.of<Point>({ x: 1, y: 2 }), (v: unknown) => v)).toThrow(
      /needs a `from`/,
    );
  });

  test("create and from compose: with routes through from, never re-running create", () => {
    type User = Val<"user/User", { id: string; name: string }>;
    type Fields = Omit<Input<User>, "id">;

    let minted = 0;
    const User = Val.companion<User>()
      .implCreate((f: Fields): User => {
        minted += 1;
        return Val.of<User>({ id: `id-${minted}`, ...f });
      })
      .implFrom((u: Input<User>): User => Val.of<User>(u));

    const u = User.create({ name: "bob" });
    expect(u).toEqual({ id: "id-1", name: "bob" });

    const v = User.with(u, { name: "sue" });
    expect(v).toEqual({ id: "id-1", name: "sue" });
    expect(minted).toBe(1);
    expectTypeOf(v).toEqualTypeOf<User>();
  });

  test("your own with still wins over a create-only companion's absence", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const seal = Val.sealer<Point>();
    const make = (x: number, y: number): Point => seal({ x, y });

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
  // the bare head already carries the defaults, exactly as a sealer does
  expect(bare.equals(Val.of<Age>(1), Val.of<Age>(1))).toBe(true);

  const built = bare.impl({ label: (a: Age) => `${a}` });
  expect(built.label(Val.of<Age>(7))).toBe("7");
  expect("label" in bare).toBe(false);
});

// ---------------------------------------------------------------------------
// Ownership: constructors copy their argument
// ---------------------------------------------------------------------------

describe("ownership", () => {
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

  test("primitives pass through as-is", () => {
    const IsoDate = Val.sealer<IsoDate>();
    expect(IsoDate("2026-09-02")).toBe("2026-09-02");
  });

  test("`from` owns the copy, and Val.of is how it gets one", () => {
    type Point = Val<"Point", { x: number; y: number }>;
    const Point = Val.companion<Point>().implFrom((p: { x: number; y: number }) =>
      Val.of<Point>(p),
    );
    const raw = { x: 1, y: 2 };
    const p = Point.from(raw);
    raw.x = 99;
    expect(p.x).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// impl / implFrom（§6.5）
// ---------------------------------------------------------------------------

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

  test("`from` cannot be smuggled in as an ordinary method", () => {
    Val.companion<Age>().impl({
      // @ts-expect-error `from` belongs to .implFrom(), not to .impl()
      from: (n: number) => Val.of<Age>(n),
    });
  });
});

describe("implFrom", () => {
  test("registers `from` and routes with / update through it, without any impl", () => {
    type Score = Val<"Score", { points: number }>;
    const Score = Val.companion<Score>().implFrom((s: { points: number }): Result<Score> =>
      s.points >= 0
        ? { ok: true, value: Val.of<Score>(s) }
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
      .implFrom((s: { points: number }) => Val.of<Score>(s))
      .impl({
        double(v) {
          expectTypeOf(v).toEqualTypeOf<Score>();
          return v.points * 2;
        },
      });

    const s = Score.from({ points: 3 });
    expect(Score.double(s)).toBe(6);
    expectTypeOf(Score.with(s, { points: 1 })).toEqualTypeOf<Score>();
  });

  test("is optional: a companion with no from is a behaviour bundle over Val.of", () => {
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
    expectTypeOf(UserId).not.toHaveProperty("from");
  });

  test("a sealer has no implFrom: a smart constructor beside a plain one is a hole", () => {
    expectTypeOf(Val.sealer<User>()).not.toHaveProperty("implFrom");
  });
});

// ---------------------------------------------------------------------------
// 慣用パターン（§8）
// ---------------------------------------------------------------------------

describe("fields the update path must not touch", () => {
  type Account = Val<"app/Account", { id: string; owner: string; note: string }>;
  type Fields = Omit<Input<Account>, "id">;
  type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

  let minted = 0;
  const Account = Val.companion<Account>()
    .implCreate((f: Fields): Account => {
      minted += 1;
      return Val.of<Account>({ id: `id-${minted}`, ...f });
    })
    .implFrom((a: Input<Account>): Account => Val.of<Account>(a))
    .impl({
      with(a, patch: Patch<Fields>): Account {
        return Val.of<Account>({ ...a, ...patch });
      },
      update<T extends Fields>(a: Account, fn: (value: Account) => NoExtra<T, Fields>): Account {
        return Val.of<Account>({ ...a, ...fn(a) });
      },
    });

  test("create mints the id; with and update preserve it", () => {
    const a = Account.create({ owner: "bob", note: "" });
    expect(a.id).toBe("id-1");

    const b = Account.with(a, { owner: "sue" });
    expect(b).toEqual({ id: "id-1", owner: "sue", note: "" });

    const c = Account.update(b, (v) => ({ owner: v.owner, note: "seen" }));
    expect(c).toEqual({ id: "id-1", owner: "sue", note: "seen" });
  });

  test("the id is not reachable through either update path", () => {
    const a = Account.create({ owner: "bob", note: "" });
    // @ts-expect-error id is not patchable
    Account.with(a, { id: "forged" });
    // @ts-expect-error the transform cannot return an id either
    Account.update(a, (v) => ({ ...v, id: "forged" }));
  });
});
