import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { Trait, Val, type Dyn, type Self } from "../src/index.ts";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>()
  .impl({ greet: (g) => `Hi, ${g.name}` })
  .final({ shout: (g) => g.name.toUpperCase() });

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

describe("final", () => {
  test("takes a Val and a box alike", () => {
    expect([Greetable.shout(user), Greetable.shout(Greetable.dyn(User, user))]).toEqual([
      "ALICE",
      "ALICE",
    ]);
  });

  test("the two steps take either order", () => {
    const flipped = Trait.companion<Greetable>()
      .impl({ greet: (g) => `Hi, ${g.name}` })
      .final({ shout: (g) => g.name.toUpperCase() });
    expect(flipped.shout(user)).toBe("ALICE");
  });
});

describe("dyn", () => {
  test("dispatches to the Val's own implementation", () => {
    const party: Dyn<Greetable>[] = [Greetable.dyn(User, user), Greetable.dyn(Admin, admin)];
    expect(party.map((p) => p.greet())).toEqual(["Hi, alice", "Sir root"]);
    expect(party.map((p) => p.toWire("/"))).toEqual(["a/alice", "admin/root"]);
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

  test("a final function may not take a member's name", () => {
    Trait.companion<Greetable>().final({
      // @ts-expect-error a final function cannot take a member's name
      greet: (g) => g.name,
    });
  });

  test("nor a name the trait itself uses", () => {
    Trait.companion<Greetable>().final({
      // @ts-expect-error a final function cannot take a name the trait itself uses
      dyn: (g) => g.name,
    });
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
