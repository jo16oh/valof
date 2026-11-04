import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import {
  Trait,
  Val,
  type AnyTrait,
  type Dyn,
  type Final,
  type Impl,
  type Payload,
  type Self,
} from "../src/index.ts";
// `Wired` is not published from the entry point.
import type { CallBuildFirst, Invalid, Wired } from "../src/val.ts";
import type { VerdictOf } from "../src/trait.ts";
import { Shared } from "../src/keys.ts";

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

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.companion<User>()
  .implTrait(Greetable, () => ({
    toWire: (u, sep) => `${u.id}${sep}${u.name}`,
  }))
  .build();

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.companion<Admin>()
  .implTrait(Greetable, () => ({
    toWire: (a, sep) => `admin${sep}${a.name}`,
    greet: (a) => `Sir ${a.name}`,
  }))
  .build();

const user = Val.of<User>({ id: "a", name: "alice" });
const admin = Val.of<Admin>({ name: "root", level: 9 });

describe("Trait", () => {
  describe("members", () => {
    test("Self resolves to the Val, with no annotation at the implementation", () => {
      // `Parameters` reads the last signature, which is the data-first one.
      expectTypeOf<Parameters<typeof User.toWire>>().toEqualTypeOf<[self: User, sep: string]>();
      expectTypeOf<ReturnType<typeof User.toWire>>().toEqualTypeOf<string>();
    });

    test("a member has no `this`", () => {
      Trait.companion<Greetable>()
        .impl(() => ({
          shout(g) {
            expectTypeOf(this).toEqualTypeOf<undefined>();
            return g.name.toUpperCase();
          },
        }))
        .build();
    });

    test("a member cannot return Self", () => {
      type Unsafe = Trait<"Unsafe", { n: number }, { grow: (self: Self) => Self }>;
      // @ts-expect-error a trait member cannot return Self
      Trait.companion<Unsafe>()
        .impl(() => ({}))
        .build();
    });

    test("Self is a member's first parameter alone", () => {
      type Same = Trait<"Same", { n: number }, { same: (self: Self, other: Self) => boolean }>;
      // @ts-expect-error a box would let `other` be another Val
      Trait.companion<Same>()
        .impl(() => ({}))
        .build();

      type Among = Trait<
        "Among",
        { n: number },
        { among: (self: Self, others: readonly Self[]) => boolean }
      >;
      // @ts-expect-error an array cannot hide Self
      Trait.companion<Among>()
        .impl(() => ({}))
        .build();

      type Visit = Trait<
        "Visit",
        { n: number },
        { visit: (self: Self, f: (others: readonly Self[]) => void) => void }
      >;
      // @ts-expect-error a callback's parameter cannot hide Self
      Trait.companion<Visit>()
        .impl(() => ({}))
        .build();
    });

    test("another parameter reads the fields through Payload", () => {
      type Same = Trait<
        "Same",
        { n: number },
        { same: (self: Self, other: Payload<{ n: number }>) => boolean }
      >;
      const Same = Trait.companion<Same>()
        .impl(() => ({ same: (s, other) => s.n === other.n }))
        .build();
      type Meter = Val<"Meter", { n: number }, Same>;
      const Meter = Val.companion<Meter>().implTrait(Same).build();
      type Gauge = Val<"Gauge", { n: number; unit: string }, Same>;
      const Gauge = Val.companion<Gauge>().implTrait(Same).build();
      const meter = Val.of<Meter>({ n: 1 });
      const gauge = Val.of<Gauge>({ n: 1, unit: "kg" });
      expect([
        Meter.same(meter, gauge),
        Meter.same(meter, { n: 2 }),
        Same.dyn(Gauge, gauge).same(meter),
      ]).toEqual([true, false, true]);
    });

    test("a later parameter takes a Val implementing the trait through Impl", () => {
      type Same = Trait<
        "Same",
        { n: number },
        { same: (self: Self, other: Impl<Same>) => boolean }
      >;
      const Same = Trait.companion<Same>()
        .impl(() => ({ same: (s, other) => s.n === other.n }))
        .build();
      type Meter = Val<"Meter", { n: number }, Same>;
      const Meter = Val.companion<Meter>().implTrait(Same).build();
      type Gauge = Val<"Gauge", { n: number; unit: string }, Same>;
      const Gauge = Val.companion<Gauge>().implTrait(Same).build();
      const meter = Val.of<Meter>({ n: 1 });
      const gauge = Val.of<Gauge>({ n: 1, unit: "kg" });
      expectTypeOf<Parameters<typeof Meter.same>>().toEqualTypeOf<
        [self: Meter, other: Impl<Same>]
      >();
      expect([
        Meter.same(meter, gauge),
        Meter.same(meter, Same.dyn(Gauge, gauge)),
        Same.dyn(Gauge, gauge).same(meter),
      ]).toEqual([true, true, true]);

      type Plain = Val<"Plain", { n: number }>;
      // @ts-expect-error an object that merely holds the fields
      Meter.same(meter, { n: 1 });
      // @ts-expect-error a Val that does not declare the trait
      Meter.same(meter, Val.of<Plain>({ n: 1 }));
      // @ts-expect-error same through a box
      Same.dyn(Gauge, gauge).same({ n: 1 });
    });

    test("Impl may appear anywhere in a member, and name another trait", () => {
      type Ping = Trait<
        "Ping",
        { n: number },
        { ping: (self: Self, all: readonly Impl<Ping>[], f: (p: Impl<Pong>) => void) => Impl<Ping> }
      >;
      type Pong = Trait<"Pong", { n: number }, { pong: (self: Self, p: Impl<Ping>) => Impl<Pong> }>;
      const Ping = Trait.companion<Ping>()
        .impl(() => ({ ping: (_p, all) => all[0]! }))
        .build();
      const Pong = Trait.companion<Pong>()
        .impl(() => ({ pong: (p) => p }))
        .build();
      type Ball = Val<"Ball", { n: number }, Ping & Pong>;
      const Ball = Val.companion<Ball>().implTrait(Ping).implTrait(Pong).build();
      const ball = Val.of<Ball>({ n: 1 });
      expect([Ball.ping(ball, [ball], () => {}), Ball.pong(ball, ball)]).toEqual([ball, ball]);
    });

    test("Self cannot hide inside a member's return type", () => {
      type Union = Trait<"Union", { n: number }, { grow: (self: Self) => Self | null }>;
      // @ts-expect-error a union member cannot hide Self
      Trait.companion<Union>()
        .impl(() => ({}))
        .build();

      type Closure = Trait<"Closure", { n: number }, { grow: (self: Self) => () => Self }>;
      // @ts-expect-error a returned function cannot hide Self
      Trait.companion<Closure>()
        .impl(() => ({}))
        .build();

      type Sink = Trait<"Sink", { n: number }, { sink: (self: Self) => (other: Self) => void }>;
      // @ts-expect-error a returned function's parameter cannot hide Self
      Trait.companion<Sink>()
        .impl(() => ({}))
        .build();

      type Tuple = Trait<"Tuple", { n: number }, { grow: (self: Self) => readonly [Self, number] }>;
      // @ts-expect-error a tuple cannot hide Self
      Trait.companion<Tuple>()
        .impl(() => ({}))
        .build();

      type Wrapped = Trait<"Wrapped", { n: number }, { grow: (self: Self) => { next: Self } }>;
      // @ts-expect-error an object cannot hide Self
      Trait.companion<Wrapped>()
        .impl(() => ({}))
        .build();

      type Later = Trait<"Later", { n: number }, { grow: (self: Self) => Promise<Self> }>;
      // @ts-expect-error a promise cannot hide Self
      Trait.companion<Later>()
        .impl(() => ({}))
        .build();

      type Safe = Trait<"Safe", { n: number }, { read: (self: Self) => (() => string) | null }>;
      const Safe = Trait.companion<Safe>()
        .impl(() => ({ read: (s) => () => String(s.n) }))
        .build();
      type Meter = Val<"Meter", { n: number }, Safe>;
      const Meter = Val.companion<Meter>().implTrait(Safe).build();
      expect(Meter.read(Val.of<Meter>({ n: 1 }))?.()).toBe("1");
    });

    test("the search for Self stops after four nested types", () => {
      type Four = Trait<
        "Four",
        { n: number },
        { grow: (self: Self) => Promise<{ a: [{ b: Self }] }> }
      >;
      // @ts-expect-error Self inside four nested types is still caught
      Trait.companion<Four>()
        .impl(() => ({}))
        .build();

      type Five = Trait<
        "Five",
        { n: number },
        { grow: (self: Self) => Promise<{ a: [{ b: { c: Self } }] }> }
      >;
      // Self inside five nested types is missed
      Trait.companion<Five>()
        .impl(() => ({}))
        .build();
    });

    test("a member may return a type that refers to itself", async () => {
      type Chain = { readonly value: number; next: () => Chain };
      type Thunk = () => Thunk;
      type Async = Trait<
        "Async",
        { n: number },
        {
          load: (self: Self) => Promise<string>;
          chain: (self: Self) => Chain;
          thunk: Final<(self: Self) => Thunk>;
          // `thisArg` of `Map`'s `forEach` is an optional `any`, and `any` is not Self
          index: Final<(self: Self) => Map<string, number>>;
        }
      >;
      const Async = Trait.companion<Async>()
        .impl(() => ({
          load: async (s) => String(s.n),
          thunk: (_self) => {
            const thunk: Thunk = () => thunk;
            return thunk;
          },
          index: (s) => new Map([["n", s.n]]),
        }))
        .build();
      type Counter = Val<"Counter", { n: number }, Async>;
      const Counter = Val.companion<Counter>()
        .implTrait(Async, () => ({
          chain: (c) => {
            const from = (value: number): Chain => ({ value, next: () => from(value + 1) });
            return from(c.n);
          },
        }))
        .build();
      const counter = Val.of<Counter>({ n: 1 });
      expect(await Counter.load(counter)).toBe("1");
      expect(Counter.chain(counter).next().value).toBe(2);
    });
  });

  // The shape answers to the payload rules, so a trait no payload could ever satisfy is caught
  // where it is written rather than at the first Val that tries to implement it.
  describe("the shape", () => {
    test("must be a payload a Val could hold", () => {
      type BadFn = Trait<"BadFn", { run: () => void }>;
      expectTypeOf<BadFn>().not.toExtend<AnyTrait>();
      // @ts-expect-error functions are not allowed
      Trait.companion<BadFn>().build();

      type BadUndefined = Trait<"BadUndefined", { nickname: string | undefined }>;
      expectTypeOf<BadUndefined>().not.toExtend<AnyTrait>();
      // @ts-expect-error required property cannot be undefined
      Trait.companion<BadUndefined>().build();

      type BadKey = Trait<"BadKey", Readonly<Record<symbol, string>>>;
      expectTypeOf<BadKey>().not.toExtend<AnyTrait>();
      // @ts-expect-error keys must be strings
      Trait.companion<BadKey>().build();
    });
  });

  describe("build", () => {
    test("closes the chain: the companion has no step left", () => {
      for (const step of ["impl", "implAssoc", "build"] as const) {
        expectTypeOf(Greetable).not.toHaveProperty(step);
        expect(step in Greetable).toBe(false);
      }
    });

    test("a builder holds the steps alone", () => {
      const bare = Trait.companion<Greetable>();
      const builder = bare.impl(() => ({ shout: (g) => g.name.toUpperCase() }));
      expectTypeOf(builder).not.toHaveProperty("shout");
      for (const name of ["shout", "dyn", Shared])
        expect([name in bare, name in builder]).toEqual([false, false]);
    });

    test("a builder used as the companion says to call `.build()`", () => {
      const builder = Trait.companion<Greetable>().impl(() => ({
        shout: (g) => g.name.toUpperCase(),
      }));
      expectTypeOf(builder.dyn).toEqualTypeOf<CallBuildFirst>();
      type Named = Val<"Named", { name: string }, Greetable>;
      Val.companion<Named>().implTrait(
        // @ts-expect-error pass the trait's companion, then the members it leaves open
        builder,
        () => ({ toWire: (n: Named) => n.name }),
      );
    });
  });

  describe("rejected names", () => {
    test("a member may not take a field's name from its own shape", () => {
      type SelfClash = Trait<"SelfClash", { size: number }, { size: (self: Self) => number }>;
      // @ts-expect-error a trait member cannot take a field's name
      Trait.companion<SelfClash>().build();
    });

    test("but may take a step's name: no companion holds a step", () => {
      type Stepping = Trait<
        "Stepping",
        { name: string },
        { impl: (self: Self) => string; build: Final<(self: Self) => string> }
      >;
      const Stepping = Trait.companion<Stepping>()
        .impl(() => ({ build: (s) => s.name }))
        .build();
      type Step = Val<"Step", { name: string }, Stepping>;
      const Step = Val.companion<Step>()
        .implTrait(Stepping, () => ({ impl: (s) => s.name.toUpperCase() }))
        .build();
      const step = Step.seal({ name: "up" });
      expect([Step.impl(step), Step.build(step), Stepping.build(step)]).toEqual(["UP", "up", "up"]);
    });

    test("and any string the library once kept", () => {
      type Kept = Trait<
        "Kept",
        { name: string },
        { __valof_shared: Final<(self: Self) => string>; greet: (self: Self) => string }
      >;
      const Kept = Trait.companion<Kept>()
        .impl(() => ({ __valof_shared: (k) => k.name, greet: (k) => `Hi, ${k.name}` }))
        .build();
      type Keeper = Val<"Keeper", { name: string }, Kept>;
      const Keeper = Val.companion<Keeper>().implTrait(Kept).build();
      const keeper = Keeper.seal({ name: "kay" });
      expect([
        Kept.__valof_shared(keeper),
        Keeper.__valof_shared(keeper),
        Kept.dyn(Keeper, keeper).greet(),
      ]).toEqual(["kay", "kay", "Hi, kay"]);
    });

    test("nor the name the trait itself uses", () => {
      type Boxed = Trait<"Boxed", { name: string }, { dyn: Final<(self: Self) => string> }>;
      // @ts-expect-error a trait member cannot take the name the trait itself uses
      Trait.companion<Boxed>()
        .impl(() => ({}))
        .build();
    });

    test("but may take `then`", () => {
      type Awaited = Trait<"Awaited", { name: string }, { then: (self: Self) => string }>;
      Trait.companion<Awaited>()
        .impl(() => ({}))
        .build();
    });

    // The tests above name one wired member each. This one fails if `Wired` grows a name
    // `Declarable` still accepts. `"greet"` is the control: without it the conditional could
    // answer `never` for every name and the test would pass on nothing.
    test("no name in `Wired` is accepted", () => {
      type Named<K extends string> = Trait<
        "Named",
        { id: string },
        Record<K, (self: Self) => string>
      >;
      type Accepted<K> = K extends string ? (Named<K> extends AnyTrait ? K : never) : never;
      expectTypeOf<Accepted<Wired>>().toEqualTypeOf<never>();
      expectTypeOf<Accepted<"greet">>().toEqualTypeOf<"greet">();
    });

    test("the wiring the two steps register is not a name at all", () => {
      type Held = Trait<
        "Held",
        { name: string },
        { defaults: (self: Self) => string; finals: Final<(self: Self) => string> }
      >;
      const Held = Trait.companion<Held>()
        .impl(() => ({
          defaults: (h) => h.name,
          finals: (h) => h.name.toUpperCase(),
        }))
        .build();
      type Note = Val<"Note", { name: string }, Held>;
      const Note = Val.companion<Note>().implTrait(Held).build();
      const n = Val.of<Note>({ name: "n" });
      expect([Note.defaults(n), Note.finals(n), Held.finals(n)]).toEqual(["n", "N", "N"]);
    });
  });

  describe("a Final member", () => {
    test("only a Final member is named on the trait", () => {
      expectTypeOf(Greetable).toHaveProperty("shout");
      expectTypeOf(Greetable).not.toHaveProperty("greet");
    });

    test("takes a Val and a box alike", () => {
      expect([Greetable.shout(user), Greetable.shout(Greetable.dyn(User, user))]).toEqual([
        "ALICE",
        "ALICE",
      ]);
    });
  });

  describe("Impl", () => {
    test("is the type of any value implementing the trait", () => {
      const greeters: Impl<Greetable>[] = [user, admin, Greetable.dyn(User, user)];
      expect(greeters.map((g) => g.name)).toEqual(["alice", "root", "alice"]);
    });

    test("the trait itself only declares, and is no value's type", () => {
      // @ts-expect-error write `Impl<Greetable>`
      const greeter: Greetable = user;
      expect(greeter).toBe(user);
    });

    test("takes several traits as one intersection", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      type Crate = Val<"Crate", { name: string; kg: number }, Greetable & Weighed>;
      expectTypeOf<Crate>().toExtend<Impl<Greetable & Weighed>>();
      expectTypeOf<Impl<Greetable & Weighed>>().toExtend<Impl<Greetable> & Impl<Weighed>>();
      expectTypeOf<Impl<Greetable> & Impl<Weighed>>().toExtend<Impl<Greetable & Weighed>>();
      expectTypeOf<User>().not.toExtend<Impl<Greetable & Weighed>>();
    });

    test("takes no union: one is written as a union of Impl", () => {
      type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
      // @ts-expect-error write `Impl<A> | Impl<B>` for either trait
      const either: Impl<Greetable | Weighed> = user;
      const written: Impl<Greetable> | Impl<Weighed> = user;
      expect([either, written]).toEqual([user, user]);
    });
  });

  test("the brand stays out of `keyof` and of a spread", () => {
    expectTypeOf<keyof User>().toEqualTypeOf<"id" | "name">();
    expectTypeOf({ ...user }).toEqualTypeOf<{ id: string; name: string }>();
  });
});

describe("dyn", () => {
  test("dispatches to the Val's own implementation", () => {
    const party: Dyn<Greetable>[] = [Greetable.dyn(User, user), Greetable.dyn(Admin, admin)];
    expect(party.map((p) => p.greet())).toEqual(["Hi, alice", "Sir root"]);
    expect(party.map((p) => p.toWire("/"))).toEqual(["a/alice", "admin/root"]);
    expect(party.map((p) => p.shout())).toEqual(["ALICE", "ROOT"]);
  });

  test("a value that merely holds the fields is not one of the trait's", () => {
    const loose = { name: "duck" };
    // @ts-expect-error a trait is a contract between Vals, and this is not one of them
    Greetable.shout(loose);
    // @ts-expect-error the same for the value a box stands in for
    Greetable.dyn(User, loose);
  });

  test("nor may the box take another Val's companion", () => {
    type Weighed = Trait<"Weighed", { name: string }, { heavy: (self: Self) => boolean }>;
    const Weighed = Trait.companion<Weighed>()
      .impl(() => ({ heavy: (w) => w.name.length > 3 }))
      .build();
    type Crate = Val<"Crate", { name: string }, Weighed>;
    const Crate = Val.companion<Crate>().implTrait(Weighed).build();
    expect(() => {
      // @ts-expect-error `Crate` answers for no member of `Greetable`
      Greetable.dyn(Crate, user).greet();
    }).toThrow(TypeError);
  });

  test("a box stands in for its value, and types the trait's fields alone", () => {
    const boxed = Greetable.dyn(User, user);
    expect(JSON.stringify(boxed)).toBe(JSON.stringify(user));
    expect(Object.keys(boxed)).toEqual(["id", "name"]);
    expectTypeOf(boxed.name).toEqualTypeOf<string>();
    expectTypeOf(boxed).not.toHaveProperty("id");
  });

  test("each of a Val's traits boxes on its own", () => {
    type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
    const Weighed = Trait.companion<Weighed>()
      .impl(() => ({ heavy: (w) => w.kg > 10 }))
      .build();
    type Crate = Val<"Crate", { name: string; kg: number }, Greetable & Weighed>;
    const Crate = Val.companion<Crate>()
      .implTrait(Greetable, () => ({ toWire: (c, sep) => `${c.name}${sep}${c.kg}` }))
      .implTrait(Weighed)
      .build();
    const c = Val.of<Crate>({ name: "box", kg: 20 });
    expect([Greetable.dyn(Crate, c).greet(), Weighed.dyn(Crate, c).heavy()]).toEqual([
      "Hi, box",
      true,
    ]);
  });

  describe("a primitive payload", () => {
    type Marker = Trait<"Marker", Record<never, never>, { wire: (self: Self) => string }>;
    const Marker = Trait.companion<Marker>()
      .impl(() => ({ wire: (_m) => "marked" }))
      .build();
    type Email = Val<"Email", string, Marker>;
    const Email = Val.companion<Email>().implTrait(Marker).build();

    test("gets an empty target to stand behind", () => {
      const mail = Email.seal("a@example.com");
      expect([Email.wire(mail), Marker.dyn(Email, mail).wire()]).toEqual(["marked", "marked"]);
    });

    test("is the one box that does not stand in for its value", () => {
      expect(JSON.stringify(Marker.dyn(Email, Email.seal("a@example.com")))).toBe("{}");
    });
  });
});

describe("data-first and data-last", () => {
  const pipe = <A, B>(a: A, f: (a: A) => B): B => f(a);

  test("a trait's member takes the value first, or last, on the Val's companion", () => {
    expectTypeOf(User.toWire("/")).toEqualTypeOf<(self: User) => string>();
    expect([User.toWire(user, "/"), User.toWire("/")(user)]).toEqual(["a/alice", "a/alice"]);
  });

  test("one taking only the value has no form taking it last", () => {
    expectTypeOf(User.shout).toEqualTypeOf<(self: User) => string>();
    expect(pipe(user, User.shout)).toBe("ALICE");
  });

  test("nor does a Final member on the trait's own companion", () => {
    expectTypeOf(Greetable.shout).toEqualTypeOf<(self: Impl<Greetable>) => string>();
    expect(pipe(admin, Greetable.shout)).toBe("ROOT");
  });

  test("a member declared with arguments that can be left out is rejected", () => {
    type Optional = Trait<"Optional", { n: number }, { at: (self: Self, i?: number) => number }>;
    // @ts-expect-error a parameter that can be left out
    Trait.companion<Optional>()
      .impl(() => ({}))
      .build();

    type Rest = Trait<"Rest", { n: number }, { sum: (self: Self, ...ns: number[]) => number }>;
    // @ts-expect-error a parameter that can be left out
    Trait.companion<Rest>()
      .impl(() => ({}))
      .build();
  });

  test("so is an implementation leaving out a parameter the declaration requires", () => {
    type Named = Val<"Named", { id: string; name: string }, Greetable>;
    expect(() =>
      Val.companion<Named>()
        .implTrait(Greetable, () => ({
          // @ts-expect-error a parameter that can be left out
          toWire: (n: Named, sep = "/") => n.id + sep,
        }))
        .build(),
    ).toThrow(/default or a rest parameter/);
    expect(() =>
      Val.companion<Named>()
        .implTrait(Greetable, () => ({
          // @ts-expect-error a parameter that can be left out
          toWire: (n: Named, ...seps: string[]) => n.id + seps.join(),
        }))
        .build(),
    ).toThrow(/default or a rest parameter/);
  });

  test("so is an implementation taking no parameter", () => {
    expect(() =>
      Trait.companion<Greetable>()
        .impl(() => ({
          // @ts-expect-error the first parameter must be the Val
          shout: () => "HI",
        }))
        .build(),
    ).toThrow(/first parameter/);
    type Named = Val<"Named", { id: string; name: string }, Greetable>;
    expect(() =>
      Val.companion<Named>()
        .implTrait(Greetable, () => ({
          // @ts-expect-error the first parameter must be the Val
          toWire: () => "named",
        }))
        .build(),
    ).toThrow(/first parameter/);
  });

  test("an implementation hiding a default or a rest parameter throws in development", () => {
    // oxlint-disable-next-line typescript/no-useless-default-assignment -- the annotation hides it on purpose
    const shout: (g: { name: string }) => string = (g = { name: "x" }) => g.name;
    expect(() =>
      Trait.companion<Greetable>()
        .impl(() => ({ shout }))
        .build(),
    ).toThrow(/default or a rest parameter/);
  });
});

describe("nesting", () => {
  type Team = Val<"Team", { id: string; name: string; lead: User }, Greetable>;
  const Team = Val.companion<Team>()
    .implTrait(Greetable, () => ({
      toWire: (t, sep) => `${t.id}${sep}${t.lead.name}`,
      greet: (t) => `Team ${t.name}`,
    }))
    .build();
  const team = Val.of<Team>({ id: "t", name: "core", lead: user });

  test("a Val with a trait nests as a payload field", () => {
    expect([Team.greet(team), Team.toWire(team, "/"), User.greet(team.lead)]).toEqual([
      "Team core",
      "t/alice",
      "Hi, alice",
    ]);
  });

  test("the nested one boxes on its own", () => {
    expect(Greetable.dyn(User, team.lead).greet()).toBe("Hi, alice");
    expect(Greetable.dyn(Team, team).greet()).toBe("Team core");
  });
});

describe("building", () => {
  describe("companion", () => {
    // Every gate takes an `AnyTrait`, so one check covers the companion, a Val declaring the
    // trait and a box. None of them carries a check of its own.
    test("a broken declaration is caught at every gate", () => {
      type Wiring = Trait<"Wiring", { id: string }, { patch: (self: Self) => boolean }>;
      expectTypeOf<VerdictOf<Wiring>>().toEqualTypeOf<{
        readonly Wiring: {
          patch: Invalid<"a trait member cannot take a name the library reserves">;
        };
      }>();
      expectTypeOf<Wiring>().not.toExtend<AnyTrait>();
      // Naming `Wiring` is the error, so each directive is the assertion. The type resolves to
      // `any` from there, and an `expectTypeOf` on these lines would sit under the directive,
      // which swallows it whichever way the claim is written.
      // @ts-expect-error a trait member cannot take a name the library reserves
      Trait.companion<Wiring>().build();
      // @ts-expect-error same, at a Val that declares it
      const cell = null as unknown as Val<"Cell", { id: string }, Wiring>;
      // @ts-expect-error same, at a box
      const box = null as unknown as Dyn<Wiring>;
      expect([cell, box]).toHaveLength(2);
    });

    test("a shape written with a rejected Payload is caught", () => {
      // @ts-expect-error functions are not allowed
      type Broken = Trait<"Broken", Payload<{ run: () => void }>>;
      expectTypeOf<Broken>().not.toExtend<AnyTrait>();
    });
  });

  describe("impl", () => {
    test("a default must implement one of the members", () => {
      type Stray = Trait<"Stray", { n: number }, { half: (self: Self) => number }>;
      Trait.companion<Stray>()
        // @ts-expect-error a trait's default must implement one of its members
        .impl(() => ({ double: (s: { n: number }) => s.n * 2 }))
        .build();
    });

    test("nor may a final name one that is not a member", () => {
      Trait.companion<Greetable>()
        .impl(() => ({
          // @ts-expect-error a trait's own implementation must be one of its members
          whisper: (g: { name: string }) => g.name,
        }))
        .build();
    });

    test("is written once", () => {
      const once = Trait.companion<Greetable>().impl(() => ({ greet: (g) => `Hi, ${g.name}` }));
      expectTypeOf(once).not.toHaveProperty("impl");
    });

    test("a member calling a final names the companion and annotates its return", () => {
      const Loud = Trait.companion<Greetable>()
        .impl(() => ({
          shout: (g): string => g.name.toUpperCase(),
          greet: (g): string => `Hi, ${Loud.shout(g)}`,
        }))
        .build();

      type Plain = Val<"Plain", { name: string }, Greetable>;
      const Plain = Val.companion<Plain>()
        .implTrait(Loud, () => ({
          toWire: (p, sep) => `plain${sep}${p.name}`,
        }))
        .build();
      expect(Plain.greet(Val.of<Plain>({ name: "alice" }))).toBe("Hi, ALICE");
    });
  });

  describe("implAssoc", () => {
    test("collects members that do not take the trait, such as one over boxes", () => {
      const Greeting = Trait.companion<Greetable>()
        .implAssoc(() => ({
          greetAll: (boxes: readonly Dyn<Greetable>[]) => boxes.map((b) => b.greet()),
          joined: (sep: string, boxes: readonly Dyn<Greetable>[]) =>
            boxes.map((b) => b.name).join(sep),
          none: () => [],
        }))
        .build();
      const boxes = [Greeting.dyn(User, user), Greeting.dyn(Admin, admin)];
      expectTypeOf(Greeting.greetAll(boxes)).toEqualTypeOf<string[]>();
      expect([
        Greeting.greetAll(boxes),
        Greeting.joined("/", boxes),
        Greeting.joined(boxes)("/"),
        Greeting.none(),
      ]).toEqual([["Hi, alice", "Sir root"], "alice/root", "alice/root", []]);
    });

    test("its function receives nothing", () => {
      Trait.companion<Greetable>()
        // @ts-expect-error the function takes no parameter
        .implAssoc((supplied: { dyn: unknown }) => ({ boxed: () => supplied.dyn }))
        .build();
    });

    test("stays on the trait's companion, off every Val that implements it", () => {
      const Greeting = Trait.companion<Greetable>()
        .impl(() => ({ shout: (g) => g.name.toUpperCase() }))
        .implAssoc(() => ({ VERSION: 1 }))
        .build();
      type Guest = Val<"AssocGuest", { name: string }, Greetable>;
      const Guest = Val.companion<Guest>()
        .implTrait(Greeting, () => ({
          greet: (g) => g.name,
          toWire: (g, sep) => `guest${sep}${g.name}`,
        }))
        .build();
      const guest = Guest.seal({ name: "g" });
      expectTypeOf(Guest).not.toHaveProperty("VERSION");
      expect(["VERSION" in Guest, Reflect.get(Greeting.dyn(Guest, guest), "VERSION")]).toEqual([
        false,
        undefined,
      ]);
      expect(Greeting.VERSION).toBe(1);
    });

    test("is written any number of times, before and after `impl`", () => {
      const Greeting = Trait.companion<Greetable>()
        .implAssoc(() => ({ PREFIX: "Hi" }))
        .impl(() => ({ shout: (g) => g.name.toUpperCase() }))
        // A member reaching the companion names it and annotates its return type, as in `impl`.
        .implAssoc(() => ({
          shoutAll: (gs: readonly Impl<Greetable>[]): string[] => gs.map((g) => Greeting.shout(g)),
        }))
        .build();
      expectTypeOf(Greeting.PREFIX).toEqualTypeOf<string>();
      expect([Greeting.PREFIX, Greeting.shoutAll([user])]).toEqual(["Hi", ["ALICE"]]);
    });

    test("a name is taken once, and the trait's members, `dyn` and the library's are reserved", () => {
      const assoc = Trait.companion<Greetable>().implAssoc(() => ({ total: 1 }));
      // @ts-expect-error this name is already taken
      assoc.implAssoc(() => ({ total: 2 }));
      // @ts-expect-error a member the trait declares, Final or not
      Trait.companion<Greetable>().implAssoc(() => ({ greet: 1 }));
      // @ts-expect-error a member the trait declares, Final or not
      Trait.companion<Greetable>().implAssoc(() => ({ shout: 1 }));
      // @ts-expect-error the name the trait itself uses
      Trait.companion<Greetable>().implAssoc(() => ({ dyn: 1 }));
      // @ts-expect-error a name the library reserves
      Trait.companion<Greetable>().implAssoc(() => ({ seal: 1 }));
    });

    test("a member whose arguments can be left out is rejected", () => {
      Trait.companion<Greetable>().implAssoc(() => ({
        // @ts-expect-error a parameter that can be left out
        names: (gs: readonly Impl<Greetable>[], sep?: string) => gs.map((g) => g.name).join(sep),
      }));
    });
  });
});
