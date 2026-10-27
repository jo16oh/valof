# Traits

> For the contract that a trait adds, see
> [TypeScript problems Valof addresses](typescript-problems.md#traits).

## Declare what Vals share

A trait declares the fields and the functions:

```ts
import { Trait, type Self } from "valof";

type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    toWire: (self: Self, sep: string) => string;
  }
>;
```

The second argument is the shape: the fields every implementing Val holds. It follows the same rules
as a payload, so a shape no Val could ever hold is an error where it is written.

The third declares the functions. They become members of every companion that implements the trait,
and they take the value first.

`Self` stands for the implementing Val. A member may take it, and may not return it. What returns a
`Self` is a constructor, and a trait has no brand to seal with.

## Implement it on a Val

A Val declares its traits in the third argument, and its companion implements them:

```ts
import { Trait, Val, type Self } from "valof";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
// ---cut---
const Greetable = Trait.companion<Greetable>().build();

type User = Val<"User", { id: string }, Greetable>;
const User = Val.companion<User>()
  .implTrait(Greetable, () => ({
    greet: (u) => `Hi, ${u.name}`,
    toWire: (u, sep) => `${u.id}${sep}${u.name}`,
  }))
  .build();

User.greet(User.seal({ id: "a", name: "alice" })); // "Hi, alice"
```

`Trait.companion<Greetable>().build()` creates the trait's companion, even for a trait that
implements nothing itself. `implTrait` takes it as the first argument, and a function returning the
trait's members as the second.

A trait adds the fields it requires to the payload, so the `User` payload includes `name` without
listing it. A payload may list one of them again with the same or a narrower type. A conflicting
type is a type error.

The checker stops at the declaration. `Val<"User", …, Greetable>` is accepted with no `implTrait`
anywhere, so the `unimplemented-trait` rule in [valof-lint](linting.md) is what reports the Val that
declared a trait and never implemented it.

## A trait is a contract between Vals

A plain object that happens to hold the fields is not one of them:

```ts
// @errors: 2322
import { Trait, type Self } from "valof";
// ---cut---
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;

const duck: Greetable = { name: "duck" }; // type error: the brand is missing
```

A Val declaring the trait carries its brand, and that brand is what the trait type asks for. The
fields alone do not put it there, so only a Val that declared `Greetable` is assignable to it.

## Give a default implementation

Every Val writing its own `greet` repeats the same line. A trait can implement a member itself,
reading the shape alone, and that becomes the default for every Val that does not replace it:

```ts
import { Trait, Val, type Self } from "valof";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
// ---cut---
const Greetable = Trait.companion<Greetable>()
  .impl(() => ({ greet: (g) => `Hi, ${g.name}` }))
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

User.greet(User.seal({ id: "a", name: "alice" })); // "Hi, alice"
Admin.greet(Admin.seal({ name: "root", level: 9 })); // "Sir root"
```

The function returns the members the trait does not implement, as both Vals return `toWire`, and any
default the Val replaces, as `Admin` replaces `greet`.

## Defaults no Val may replace

Mark one `Final`:

```ts
import { Trait, Val, type Final, type Self } from "valof";

// ---cut---
type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
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
const User = Val.companion<User>().implTrait(Greetable).build();
```

The trait implements both, so `implTrait` needs no second argument. A Val may still return `greet`
from the function to replace it. Returning `shout` is an error.

The trait's companion exposes its `Final` members, but not its defaults. `Greetable.shout(user)` can
be called, and `Greetable.greet` is a type error, because calling a default through the trait would
run it even for a Val that replaced it. Call a default through the Val's companion, which
dispatches.

A default calling a `Final` member references the trait and annotates its return type:

```ts
import { Trait, type Final, type Self } from "valof";

type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    shout: Final<(self: Self) => string>;
  }
>;
// ---cut---
const Greetable = Trait.companion<Greetable>()
  .impl(() => ({
    shout: (g): string => g.name.toUpperCase(),
    // A member referencing `Greetable` itself annotates its return type, to avoid an implicit `any`.
    greet: (g): string => `Hi, ${Greetable.shout(g)}`,
  }))
  .build();
```

## Implement Traits on an Enum

An [enum](enums.md) implements a trait it declares in one `implTrait`, over the union. What differs
per variant is a `match` inside the implementation:

```ts
import { Enum, Trait, type Self } from "valof";
// ---cut---
type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;
const Describable = Trait.companion<Describable>().build();

type Cmd = Enum<"Cmd", { Add: { n: number }; Del: { at: number } }, Describable>;
const Cmd = Enum.companion<Cmd>()
  .implTrait(Describable, () => ({
    describe: (c): string => Cmd.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
  }))
  .build();

Cmd.describe(Cmd.Add.create({ id: "c1", n: 2 })); // "add 2"
```

A trait's fields become fields every variant shares. `id` comes from `Describable`, and `Cmd.Add`
requires it. A trait on one variant alone is declared in that variant's payload, as
[A trait on one variant](enums.md#a-trait-on-one-variant) shows.

## Hold values of different types together

`dyn` pairs a value with one Val's implementation, so values of different types share an array. The
concrete type is gone; the trait is what is left. This is inspired by Rust's `Box<dyn Trait>`:

```ts
import { Trait, Val, type Dyn, type Self } from "valof";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>()
  .impl(() => ({ greet: (g) => `Hi, ${g.name}` }))
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
// ---cut---
const party: Dyn<Greetable>[] = [
  Greetable.dyn(User, User.seal({ id: "a", name: "alice" })),
  Greetable.dyn(Admin, Admin.seal({ name: "root", level: 9 })),
];

party.map((p) => p.greet()); // ["Hi, alice", "Sir root"]
party.map((p) => p.name); // ["alice", "root"]: a trait field, read from the box
```

A box already holds the value, so its members take only the arguments after it. The trait's fields
are readable on it, and a function taking `Greetable` accepts one. The Val's own fields are not.
`p.id` is a type error, because `dyn` drops the concrete type.

A box is a proxy over its value, not a Val. It has its own identity, and it has no `patch`. A
payload cannot hold one.

The two arguments belong together. The companion has to match the value's own type, so another Val's
companion is rejected.

An enum boxes the same way, through its own companion:
`Describable.dyn(Cmd, Cmd.Add.create({ id: "c1", n: 2 }))`.

A function over boxes is registered on the trait's companion, with `.implAssoc`. `implTrait` does
not copy it onto a Val.

## Several traits on one Val

Intersect them in the declaration, and implement each in its own step:

```ts
import { Trait, Val, type Self } from "valof";

type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
const Greetable = Trait.companion<Greetable>()
  .impl(() => ({ greet: (g) => `Hi, ${g.name}` }))
  .build();
// ---cut---
type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
const Weighed = Trait.companion<Weighed>()
  .impl(() => ({ heavy: (w) => w.kg > 10 }))
  .build();

type Crate = Val<"Crate", { name: string; kg: number }, Greetable & Weighed>;
const Crate = Val.companion<Crate>().implTrait(Greetable).implTrait(Weighed).build();

const crate = Crate.seal({ name: "box", kg: 20 });
Greetable.dyn(Crate, crate).greet(); // "Hi, box"
Weighed.dyn(Crate, crate).heavy(); // true
```

Write `&`, not `|`.

Each trait boxes on its own. No two traits on one Val may declare the same member name.

## Names a member may not take

A member name is rejected when a Val could not carry it:

- a field's name from the trait's own shape
- `patch`, `seal` or `create`, which the library defines
- `dyn`, which the trait itself uses

Each is reported where the trait is declared.

A member may not take the name of a field the implementing Val holds. That includes a field another
trait on the same Val requires. The colliding name comes from the Val, so this one is reported at
`implTrait`.
