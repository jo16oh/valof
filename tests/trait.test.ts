import { expect, test } from "vite-plus/test";
import { Val, Trait, type Self, type Dyn } from "../src/index.ts";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>("Greetable").impl({
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
  expect(party.map((p) => Greetable.greet(p.value))).toEqual(["Hi, alice", "Hi, root"]);
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
const Unsafe = Trait.companion<Unsafe>("Unsafe").impl({});
void Unsafe;
