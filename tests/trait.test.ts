import { expect, test } from "vite-plus/test";
import { Val, Trait, type Self, type Dyn } from "../src/index.ts";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>().impl({
  greet: (g) => `Hi, ${g.name}`,
});

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
});

test("trait members reach the companion, shared ones stay on the trait", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  expect(User.toWire(u, ":")).toBe("a:alice");
  expect(Greetable.greet(u)).toBe("Hi, alice");
});

test("dyn boxes a value with one Val's implementation", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  const a = Val.of<Admin>({ name: "root", level: 9 });
  const party: Dyn<Greetable>[] = [Greetable.dyn(User, u), Greetable.dyn(Admin, a)];
  expect(party.map((p) => p.toWire("/"))).toEqual(["a/alice", "admin/root"]);
  expect(party.map((p) => Greetable.greet(p))).toEqual(["Hi, alice", "Hi, root"]);
});

test("equals still works next to a trait", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  expect(User.equals(u, Val.of<User>({ name: "alice", id: "a" }))).toBe(true);
});

// negative cases
type Bad = Val<"Bad", { id: string }, Greetable>;
const badly = Val.companion<Bad>().implTrait(
  // @ts-expect-error the payload does not hold what this trait requires
  Greetable,
  { toWire: (b, sep) => `${b.id}${sep}` },
);
void badly;

// @ts-expect-error a trait that leaves members open must implement them
const missing = Val.companion<User>().implTrait(Greetable);
void missing;

type Unsafe = Trait<"Unsafe", { n: number }, { grow: (self: Self) => Self }>;
// @ts-expect-error a trait member cannot return Self
const Unsafe = Trait.companion<Unsafe>().impl({});
void Unsafe;

// the two sets of names stay disjoint, so nothing can answer to the same name twice
type Clash = Trait<"Clash", { n: number }, { same: (self: Self) => number }>;
// @ts-expect-error a shared function cannot take the name of a member each Val implements
const Clash = Trait.companion<Clash>().impl({ same: (c: { n: number }) => c.n });

type Box = Val<"Box", { n: number }, Clash>;
const Box = Val.companion<Box>()
  .implTrait(Clash, { same: (b) => b.n * 2 })
  // @ts-expect-error a trait's member is already registered under this name
  .impl({ same: (b) => b.n * 3 });
void Box;

// a sealer implements a trait the same way, and stays callable
type Point = Val<"Point", { name: string; x: number }, Greetable>;
const Point = Val.sealer<Point>()
  .implTrait(Greetable, { toWire: (p, sep) => `${p.name}${sep}${p.x}` })
  .impl({ shifted: (p) => p.x + 1 });

test("a sealer keeps its constructor next to a trait", () => {
  const p = Point({ name: "o", x: 1 });
  expect([Point.toWire(p, ":"), Point.shifted(p), Greetable.greet(p)]).toEqual(["o:1", 2, "Hi, o"]);
  expect(Greetable.dyn(Point, p).toWire("/")).toBe("o/1");
});

// two traits on one Val may not register the same name
type Other = Trait<"Other", { name: string }, { toWire: (self: Self, sep: string) => number }>;
const Other = Trait.companion<Other>().impl({});
type Twice = Val<"Twice", { id: string; name: string }, Greetable & Other>;
const Twice = Val.companion<Twice>()
  .implTrait(Greetable, { toWire: (t, sep) => `${t.id}${sep}` })
  // @ts-expect-error another trait already registered a member under one of these names
  .implTrait(Other, { toWire: (t, sep) => t.id.length + sep.length });
void Twice;

// and a field two traits disagree on has no payload that fits
type Sized = Trait<"Sized", { name: number }>;
const Sized = Trait.companion<Sized>().impl({ half: (s) => s.name / 2 });
type Both = Val<"Both", { name: string }, Greetable & Sized>;
const Both = Val.companion<Both>().implTrait(
  // @ts-expect-error the payload does not hold what this trait requires
  Sized,
);
void Both;

test("a box reads the trait's fields off the value", () => {
  const u = Val.of<User>({ id: "a", name: "alice" });
  const boxed = Greetable.dyn(User, u);
  expect([boxed.name, boxed.toWire("/"), Greetable.greet(boxed)]).toEqual([
    "alice",
    "a/alice",
    "Hi, alice",
  ]);
});

// a primitive payload has nothing for a proxy to stand in front of
type Marker = Trait<"Marker", Record<never, never>, { wire: (self: Self) => string }>;
const Marker = Trait.companion<Marker>().impl({});
type Email = Val<"Email", string, Marker>;
const Email = Val.sealer<Email>().implTrait(Marker, { wire: (e) => e });
test("a primitive payload gets an empty target to stand behind", () => {
  const mail = Val.of<Email>("a@example.com");
  expect(Marker.dyn(Email, mail).wire()).toBe("a@example.com");
});
