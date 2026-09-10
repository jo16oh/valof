import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { Trait, Val, type Dyn, type Final, type Self } from "../src/index.ts";

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

describe("implementing", () => {
  test("a member without a default is the Val's own", () => {
    expect(User.toWire(user, ":")).toBe("a:alice");
  });

  test("a member with a default is taken unless implTrait passes one", () => {
    expect([User.greet(user), Admin.greet(admin)]).toEqual(["Hi, alice", "Sir root"]);
  });

  test("a member without a default must be implemented", () => {
    // @ts-expect-error a member without a default must be implemented
    Val.companion<User>().implTrait(Greetable);
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
    Val.companion<Bad>().implTrait(
      // @ts-expect-error the payload does not hold what this trait requires
      Greetable,
      { toWire: (b, sep) => `${b.id}${sep}` },
    );
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
    expect(User.equals(user, Val.of<User>({ name: "alice", id: "a" }))).toBe(true);
  });
});

describe("declaring", () => {
  test("a member cannot return Self", () => {
    type Unsafe = Trait<"Unsafe", { n: number }, { grow: (self: Self) => Self }>;
    // @ts-expect-error a trait member cannot return Self
    Trait.companion<Unsafe>().impl({});
  });

  test("a default must implement one of the members", () => {
    type Stray = Trait<"Stray", { n: number }, { half: (self: Self) => number }>;
    // @ts-expect-error a trait's default must implement one of its members
    Trait.companion<Stray>().impl({ double: (s: { n: number }) => s.n * 2 });
  });

  test("Self resolves to the Val, with no annotation at the implementation", () => {
    expectTypeOf(User.toWire).toEqualTypeOf<(self: User, sep: string) => string>();
  });
});

describe("a Final member", () => {
  test("takes a Val and a box alike", () => {
    expect([Greetable.shout(user), Greetable.shout(Greetable.dyn(User, user))]).toEqual([
      "ALICE",
      "ALICE",
    ]);
  });

  test("every implementing companion answers to it, with the trait's own function", () => {
    expect([User.shout(user), Admin.shout(admin)]).toEqual(["ALICE", "ROOT"]);
    expect(User.shout).toBe(Greetable.shout);
  });

  test("a Val cannot override it", () => {
    Val.companion<User>().implTrait(Greetable, {
      toWire: (u, sep) => `${u.id}${sep}`,
      // @ts-expect-error a Final member is not the Val's to implement
      shout: (u) => u.name,
    });
  });

  test("nor through a payload the excess property check does not read", () => {
    const carried = {
      toWire: (u: User, sep: string) => `${u.id}${sep}`,
      shout: (u: User) => u.name,
    };
    // @ts-expect-error a Final member is declared `never`, so a variable carries no override in
    Val.companion<User>().implTrait(Greetable, carried);
  });

  test("a box binds it like any other member", () => {
    expect(Greetable.dyn(Admin, admin).shout()).toBe("ROOT");
  });

  test("only a Final member is named on the trait", () => {
    expectTypeOf(Greetable).toHaveProperty("shout");
    expectTypeOf(Greetable).not.toHaveProperty("greet");
  });

  test("a companion that skipped one cannot be implemented", () => {
    Val.companion<User>().implTrait(
      // @ts-expect-error this trait's companion has not implemented every member declared Final
      Trait.companion<Greetable>().impl({ greet: (g) => g.name }),
      { toWire: (u, sep) => `${u.id}${sep}` },
    );
  });

  test("impl takes the two in either call", () => {
    const split = Trait.companion<Greetable>()
      .impl({ greet: (g) => `Hi, ${g.name}` })
      .impl({ shout: (g) => g.name.toUpperCase() });
    expect(split.shout(user)).toBe("ALICE");
  });

  test("but not the same member twice", () => {
    Trait.companion<Greetable>()
      .impl({ greet: (g) => g.name })
      // @ts-expect-error the trait already implements this member
      .impl({ greet: (g) => g.name });
  });
});

describe("a trait that implements nothing of its own", () => {
  type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
  type Row = Val<"Row", { id: string; n: number }, Wired>;
  const Row = Val.companion<Row>().implTrait<Wired>({ toWire: (r, sep) => `${r.id}${sep}${r.n}` });

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

    type Thin = Val<"Thin", { n: number }, Wired>;
    const thin = { toWire: (t: Thin, sep: string) => `${t.n}${sep}` };
    // @ts-expect-error the payload does not hold what this trait requires
    Val.companion<Thin>().implTrait<Wired>(thin);
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
    // @ts-expect-error `Crate` answers for no member of `Greetable`: this threw at run time
    Greetable.dyn(Crate, user);
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

describe("names", () => {
  test("a companion may not grow a function over a member", () => {
    Val.companion<User>()
      .implTrait(Greetable, { toWire: (u, sep) => `${u.id}${sep}` })
      // @ts-expect-error a trait already answers to this name
      .impl({ greet: (u) => `yo ${u.name}` });
  });

  test("nor over a final function", () => {
    Val.companion<User>()
      .implTrait(Greetable, { toWire: (u, sep) => `${u.id}${sep}` })
      // @ts-expect-error a trait already answers to this name
      .impl({ shout: (u) => u.name });
  });

  test("a final must be one of the trait's members", () => {
    Trait.companion<Greetable>().impl({
      // @ts-expect-error a trait's own implementation must be one of its members
      whisper: (g: { name: string }) => g.name,
    });
  });

  test("nor the name the trait itself uses", () => {
    type Boxed = Trait<"Boxed", { name: string }, { dyn: Final<(self: Self) => string> }>;
    // @ts-expect-error a trait member cannot take the name the trait itself uses
    Trait.companion<Boxed>().impl({});
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

  test("a member cannot take a name under `__valof_`", () => {
    type Sneaky = Trait<"Sneaky", { name: string }, { __valof_shared: (self: Self) => string }>;
    // @ts-expect-error a trait member cannot take a name the library wires
    Trait.companion<Sneaky>().impl({});
  });

  test("nor one under `impl`, which the steps have", () => {
    type Stepping = Trait<"Stepping", { name: string }, { implTrait: (self: Self) => string }>;
    // @ts-expect-error a trait member cannot take a name the library wires
    Trait.companion<Stepping>().impl({});
  });

  test("nor may a companion grow one over the record `dyn` reads", () => {
    Val.companion<User>()
      .implTrait(Greetable, { toWire: (u, sep) => `${u.id}${sep}` })
      .impl({
        // @ts-expect-error the library keeps this one: a function here would leave `dyn` unbound
        __valof_traits: (u) => u.name,
      });
  });

  test("nor may it grow one over a step's name", () => {
    Val.companion<User>().impl({
      // @ts-expect-error the `impl` prefix is the library's
      implTrait: (u) => u.name,
    });
  });

  test("two traits on one Val may not answer to the same final", () => {
    type Yelling = Trait<"Yelling", { name: string }, { shout: Final<(self: Self) => string> }>;
    const Yelling = Trait.companion<Yelling>().impl({ shout: (y) => y.name });
    type Crier = Val<"Crier", { id: string; name: string }, Greetable & Yelling>;
    Val.companion<Crier>()
      .implTrait(Greetable, { toWire: (c, sep) => `${c.id}${sep}` })
      // @ts-expect-error another trait already answers to one of these names
      .implTrait(Yelling);
  });

  test("a member may not take a name the library wires", () => {
    type Wiring = Trait<"Wiring", { n: number }, { equals: (self: Self) => boolean }>;
    // @ts-expect-error a trait member cannot take a name the library wires
    Trait.companion<Wiring>().impl({ equals: () => false });
  });

  test("a member may not take a field's name from its own shape", () => {
    type SelfClash = Trait<"SelfClash", { size: number }, { size: (self: Self) => number }>;
    // @ts-expect-error a trait member cannot take a field's name
    Trait.companion<SelfClash>().impl({ size: (s) => s.size });
  });

  test("nor one the payload holds", () => {
    type Loud = Trait<"Loud", { name: string }, { greet: (self: Self) => string }>;
    const Loud = Trait.companion<Loud>().impl({ greet: (l) => l.name });
    type Sign = Val<"Sign", { name: string; greet: string }, Loud>;
    Val.companion<Sign>().implTrait(
      // @ts-expect-error a member cannot take the name of a field the payload holds
      Loud,
    );
  });

  test("two traits on one Val may not answer to the same name", () => {
    type Other = Trait<"Other", { name: string }, { toWire: (self: Self, sep: string) => number }>;
    const Other = Trait.companion<Other>().impl({});
    type Twice = Val<"Twice", { id: string; name: string }, Greetable & Other>;
    Val.companion<Twice>()
      .implTrait(Greetable, { toWire: (t, sep) => `${t.id}${sep}` })
      // @ts-expect-error another trait already answers to one of these names
      .implTrait(Other, { toWire: (t, sep) => t.id.length + sep.length });
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
    const Sized = Trait.companion<Sized>().impl({ half: (s) => s.name / 2 });
    type Both = Val<"Both", { name: string }, Greetable & Sized>;
    Val.companion<Both>().implTrait(
      // @ts-expect-error the payload does not hold what this trait requires
      Sized,
    );
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

  test("patch replaces a nested Val whole, and keeps the untouched subtree", () => {
    const next = Team.patch(team, { lead: Val.of<User>({ id: "b", name: "bob" }) });
    expect([next.lead.name, User.greet(next.lead)]).toEqual(["bob", "Hi, bob"]);
    expect(Team.patch(team, { name: "edge" }).lead).toBe(team.lead);
  });

  test("equality stays structural through the nesting", () => {
    expect(Team.equals(team, Val.of<Team>({ id: "t", name: "core", lead: user }))).toBe(true);
  });
});
