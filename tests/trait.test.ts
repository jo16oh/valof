import { expect, test } from "vite-plus/test";
import { Val, Trait, type Dyn, type Self } from "../src/index.ts";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>()
  .shared({ shout: (g) => g.name.toUpperCase() }) // 上書きできない。第 1 引数は注釈なし
  .impl({ greet: (g) => `Hi, ${g.name}` });

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
  greet: (a) => `Sir ${a.name}`,
});

test("a member without a default is the Val's own, one with a default is taken", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  expect([User.toWire(u, ":"), User.greet(u)]).toEqual(["a:alice", "Hi, alice"]);
});

test("implTrait overrides a default", () => {
  const a = Val.of<Admin>({ name: "root", level: 9 });
  expect(Admin.greet(a)).toBe("Sir root");
});

test("a box dispatches to the Val's own implementation", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  const a = Val.of<Admin>({ name: "root", level: 9 });
  const party: Dyn<Greetable>[] = [Greetable.dyn(User, u), Greetable.dyn(Admin, a)];
  expect(party.map((p) => p.greet())).toEqual(["Hi, alice", "Sir root"]);
  expect(party.map((p) => p.toWire("/"))).toEqual(["a/alice", "admin/root"]);
  expect(party.map((p) => p.name)).toEqual(["alice", "root"]);
});

test("equals still works next to a trait", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  expect(User.equals(u, Val.of<User>({ name: "alice", id: "a" }))).toBe(true);
});

// a sealer implements a trait the same way, and stays callable
type Point = Val<"Point", { name: string; x: number }, Greetable>;
const Point = Val.sealer<Point>()
  .implTrait(Greetable, { toWire: (p, sep) => `${p.name}${sep}${p.x}` })
  .impl({ shifted: (p) => p.x + 1 });

test("a sealer keeps its constructor next to a trait", () => {
  const p = Point({ name: "o", x: 1 });
  expect([Point.toWire(p, ":"), Point.shifted(p), Point.greet(p)]).toEqual(["o:1", 2, "Hi, o"]);
});

// a trait with every member defaulted takes no second argument
type Marker = Trait<"Marker", Record<never, never>, { wire: (self: Self) => string }>;
const Marker = Trait.companion<Marker>().impl({ wire: () => "marked" });
type Email = Val<"Email", string, Marker>;
const Email = Val.sealer<Email>().implTrait(Marker);

test("a primitive payload gets an empty target to stand behind", () => {
  const mail = Email("a@example.com");
  expect([Email.wire(mail), Marker.dyn(Email, mail).wire()]).toEqual(["marked", "marked"]);
});

// negative cases
type Bad = Val<"Bad", { id: string }, Greetable>;
const badly = Val.companion<Bad>().implTrait(
  // @ts-expect-error the payload does not hold what this trait requires
  Greetable,
  { toWire: (b, sep) => `${b.id}${sep}` },
);
void badly;

// @ts-expect-error a member without a default must be implemented
const missing = Val.companion<User>().implTrait(Greetable);
void missing;

type Unsafe = Trait<"Unsafe", { n: number }, { grow: (self: Self) => Self }>;
// @ts-expect-error a trait member cannot return Self
const Unsafe = Trait.companion<Unsafe>().impl({});
void Unsafe;

type Stray = Trait<"Stray", { n: number }, { half: (self: Self) => number }>;
// @ts-expect-error a trait's default must implement one of its members
const Stray = Trait.companion<Stray>().impl({ double: (s: { n: number }) => s.n * 2 });
void Stray;

// two traits on one Val may not answer to the same name
type Other = Trait<"Other", { name: string }, { toWire: (self: Self, sep: string) => number }>;
const Other = Trait.companion<Other>().impl({});
type Twice = Val<"Twice", { id: string; name: string }, Greetable & Other>;
const twice = Val.companion<Twice>()
  .implTrait(Greetable, { toWire: (t, sep) => `${t.id}${sep}` })
  // @ts-expect-error another trait already answers to one of these names
  .implTrait(Other, { toWire: (t, sep) => t.id.length + sep.length });
void twice;

// and a field two traits disagree on has no payload that fits
type Sized = Trait<"Sized", { name: number }, { half: (self: Self) => number }>;
const Sized = Trait.companion<Sized>().impl({ half: (s) => s.name / 2 });
type Both = Val<"Both", { name: string }, Greetable & Sized>;
const both = Val.companion<Both>().implTrait(
  // @ts-expect-error the payload does not hold what this trait requires
  Sized,
);
void both;

// a companion may not grow a function over a registered member
const shadowing = Val.companion<User>()
  .implTrait(Greetable, { toWire: (u, sep) => `${u.id}${sep}` })
  // @ts-expect-error a trait already answers to this name
  .impl({ greet: (u) => `yo ${u.name}` });
void shadowing;

test("a shared function takes a Val and a box alike", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  expect([Greetable.shout(u), Greetable.shout(Greetable.dyn(User, u))]).toEqual(["ALICE", "ALICE"]);
});

// a shared function may not take a member's name
const clashing = Trait.companion<Greetable>().shared({
  // @ts-expect-error a shared function cannot take a member's name
  greet: (g) => g.name,
});
void clashing;

// nor may a companion grow a function over one
const overShared = Val.companion<User>()
  .implTrait(Greetable, { toWire: (u, sep) => `${u.id}${sep}` })
  // @ts-expect-error a trait already answers to this name
  .impl({ shout: (u) => u.name });
void overShared;
