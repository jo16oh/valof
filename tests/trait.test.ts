import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { Trait, Val, type AnyTrait, type Dyn, type Final, type Self } from "../src/index.ts";
// `Wired` is not published from the entry point.
import type { Wired } from "../src/val.ts";

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

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
  greet: (a) => `Sir ${a.name}`,
});

const user = Val.of<User>({ id: "a", name: "alice" });
const admin = Val.of<Admin>({ name: "root", level: 9 });

describe("Trait", () => {
  describe("members", () => {
    test("Self resolves to the Val, with no annotation at the implementation", () => {
      expectTypeOf(User.toWire).toEqualTypeOf<(self: User, sep: string) => string>();
    });

    test("a member cannot return Self", () => {
      type Unsafe = Trait<"Unsafe", { n: number }, { grow: (self: Self) => Self }>;
      // @ts-expect-error a trait member cannot return Self
      Trait.companion<Unsafe>().impl({});
    });
  });

  // The shape answers to the payload rules, so a trait no payload could ever satisfy is caught
  // where it is written rather than at the first Val that tries to implement it.
  describe("the shape", () => {
    test("must be a payload a Val could hold", () => {
      type BadFn = Trait<"BadFn", { run: () => void }>;
      expectTypeOf<BadFn>().not.toExtend<AnyTrait>();
      // @ts-expect-error functions are not allowed
      Trait.companion<BadFn>();

      type BadUndefined = Trait<"BadUndefined", { nickname: string | undefined }>;
      expectTypeOf<BadUndefined>().not.toExtend<AnyTrait>();
      // @ts-expect-error required property cannot be undefined
      Trait.companion<BadUndefined>();

      type BadKey = Trait<"BadKey", Readonly<Record<symbol, string>>>;
      expectTypeOf<BadKey>().not.toExtend<AnyTrait>();
      // @ts-expect-error keys must be strings
      Trait.companion<BadKey>();
    });
  });

  describe("rejected names", () => {
    test("a member may not take a field's name from its own shape", () => {
      type SelfClash = Trait<"SelfClash", { size: number }, { size: (self: Self) => number }>;
      // @ts-expect-error a trait member cannot take a field's name
      Trait.companion<SelfClash>().impl({ size: (s: { size: number }) => s.size });
    });

    test("nor a name the library wires", () => {
      type Wiring = Trait<"Wiring", { n: number }, { equals: (self: Self) => boolean }>;
      // @ts-expect-error a trait member cannot take a name the library wires
      Trait.companion<Wiring>().impl({ equals: () => false });
    });

    test("nor one under `__valof_`", () => {
      type Sneaky = Trait<"Sneaky", { name: string }, { __valof_shared: (self: Self) => string }>;
      // @ts-expect-error a trait member cannot take a name the library wires
      Trait.companion<Sneaky>().impl({});
    });

    test("nor one under `impl`, which the steps have", () => {
      type Stepping = Trait<"Stepping", { name: string }, { implTrait: (self: Self) => string }>;
      // @ts-expect-error a trait member cannot take a name the library wires
      Trait.companion<Stepping>().impl({});
    });

    test("nor the name the trait itself uses", () => {
      type Boxed = Trait<"Boxed", { name: string }, { dyn: Final<(self: Self) => string> }>;
      // @ts-expect-error a trait member cannot take the name the trait itself uses
      Trait.companion<Boxed>().impl({});
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
        .impl({ defaults: (h) => h.name })
        .impl({ finals: (h) => h.name.toUpperCase() });
      type Note = Val<"Note", { name: string }, Held>;
      const Note = Val.companion<Note>().implTrait(Held);
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

    test("a box binds it like any other member", () => {
      expect(Greetable.dyn(Admin, admin).shout()).toBe("ROOT");
    });
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
    const Weighed = Trait.companion<Weighed>().impl({ heavy: (w) => w.name.length > 3 });
    type Crate = Val<"Crate", { name: string }, Weighed>;
    const Crate = Val.companion<Crate>().implTrait(Weighed);
    expect(() => {
      // @ts-expect-error `Crate` answers for no member of `Greetable`
      Greetable.dyn(Crate, user).greet();
    }).toThrow(TypeError);
  });

  test("the trait's fields read off the box", () => {
    expect(Greetable.dyn(User, user).name).toBe("alice");
  });

  test("a box stands in for its value", () => {
    const boxed = Greetable.dyn(User, user);
    expect(JSON.stringify(boxed)).toBe(JSON.stringify(user));
    expect(Object.keys(boxed)).toEqual(["id", "name"]);
  });

  test("each of a Val's traits boxes on its own", () => {
    type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
    const Weighed = Trait.companion<Weighed>().impl({ heavy: (w) => w.kg > 10 });
    type Crate = Val<"Crate", { name: string; kg: number }, Greetable & Weighed>;
    const Crate = Val.companion<Crate>()
      .implTrait(Greetable, { toWire: (c, sep) => `${c.name}${sep}${c.kg}` })
      .implTrait(Weighed);
    const c = Val.of<Crate>({ name: "box", kg: 20 });
    expect([Greetable.dyn(Crate, c).greet(), Weighed.dyn(Crate, c).heavy()]).toEqual([
      "Hi, box",
      true,
    ]);
  });

  describe("a primitive payload", () => {
    type Marker = Trait<"Marker", Record<never, never>, { wire: (self: Self) => string }>;
    const Marker = Trait.companion<Marker>().impl({ wire: () => "marked" });
    type Email = Val<"Email", string, Marker>;
    const Email = Val.sealer<Email>().implTrait(Marker);

    test("gets an empty target to stand behind", () => {
      const mail = Email("a@example.com");
      expect([Email.wire(mail), Marker.dyn(Email, mail).wire()]).toEqual(["marked", "marked"]);
    });

    test("is the one box that does not stand in for its value", () => {
      expect(JSON.stringify(Marker.dyn(Email, Email("a@example.com")))).toBe("{}");
    });
  });
});

describe("nesting", () => {
  type Team = Val<"Team", { id: string; name: string; lead: User }, Greetable>;
  const Team = Val.companion<Team>().implTrait(Greetable, {
    toWire: (t, sep) => `${t.id}${sep}${t.lead.name}`,
    greet: (t) => `Team ${t.name}`,
  });
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
    // trait, a box, and both forms of `implTrait`. None of them carries a check of its own.
    test("a broken declaration is caught at every gate", () => {
      type Wiring = Trait<"Wiring", { id: string }, { equals: (self: Self) => boolean }>;
      expectTypeOf<Wiring>().not.toExtend<AnyTrait>();
      // Naming `Wiring` is the error, so each directive is the assertion. The type resolves to
      // `any` from there, and an `expectTypeOf` on these lines would sit under the directive,
      // which swallows it whichever way the claim is written.
      // @ts-expect-error a trait member cannot take a name the library wires
      Trait.companion<Wiring>();
      // @ts-expect-error same, at a Val that declares it
      const cell = null as unknown as Val<"Cell", { id: string }, Wiring>;
      // @ts-expect-error same, at a box
      const box = null as unknown as Dyn<Wiring>;
      type Plain = Val<"Plain", { id: string }>;
      const wiring = {} as Wiring;
      // @ts-expect-error same, at the companion form of implTrait
      Val.companion<Plain>().implTrait(wiring, {});
      // @ts-expect-error same, at the type-argument form of implTrait
      Val.companion<Plain>().implTrait<Wiring>({});
      expect([cell, box]).toHaveLength(2);
    });
  });

  describe("impl", () => {
    test("a default must implement one of the members", () => {
      type Stray = Trait<"Stray", { n: number }, { half: (self: Self) => number }>;
      // @ts-expect-error a trait's default must implement one of its members
      Trait.companion<Stray>().impl({ double: (s: { n: number }) => s.n * 2 });
    });

    test("nor may a final name one that is not a member", () => {
      Trait.companion<Greetable>().impl({
        // @ts-expect-error a trait's own implementation must be one of its members
        whisper: (g: { name: string }) => g.name,
      });
    });

    test("takes a default and a final in either call", () => {
      const split = Trait.companion<Greetable>()
        .impl({ greet: (g) => `Hi, ${g.name}` })
        .impl({ shout: (g) => g.name.toUpperCase() });
      expect(split.shout(user)).toBe("ALICE");
    });

    test("but not the same member twice", () => {
      Trait.companion<Greetable>()
        .impl({ greet: (g) => g.name })
        // @ts-expect-error the trait already implements this member
        .impl({ greet: (g: { name: string }) => g.name });
    });
  });
});
