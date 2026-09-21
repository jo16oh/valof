# Traits

<!-- prettier-ignore -->
> [!WARNING]
> Traits are experimental. They ship from `valof/experimental` so that an import says so, and
> the design is still changing.

> For the contract that a trait adds, see
> [TypeScript problems Valof addresses](typescript-problems.md#traits).

## Declare what Vals share

A trait declares the fields and the functions:

```ts
import { Trait, type Self } from "valof/experimental";

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
and they take the value first like any other member.

`Self` stands for the implementing Val. A member may take it, and may not return it: what returns a
`Self` is a constructor, and a trait has no brand to seal with.

## Implement it on a Val

A Val declares its traits in the third argument, and its companion implements them:

```ts
import { Val } from "valof";
import { Trait, type Self } from "valof/experimental";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
// ---cut---
type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.sealer<User>().implTrait<Greetable>({
  greet: (u) => `Hi, ${u.name}`,
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

User.greet(User({ id: "a", name: "alice" })); // "Hi, alice"
```

Naming the trait as the type argument asks `implTrait` for every member it declares.

Declaring the trait is what requires the payload to hold its fields: a `User` without `name` is a
type error at the declaration, not at `implTrait`.

The checker stops at the declaration. `Val<"User", …, Greetable>` typechecks with no `implTrait`
anywhere, so the `unimplemented-trait` rule in [valof-lint](linting.md) is what reports the Val that
declared a trait and never implemented it.

## A trait is a contract between Vals

A plain object that happens to hold the fields is not one of them:

```ts
// @errors: 2322
import { Trait, type Self } from "valof/experimental";
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
import { Val } from "valof";
import { Trait, type Self } from "valof/experimental";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
// ---cut---
const Greetable = Trait.companion<Greetable>().impl({ greet: (g) => `Hi, ${g.name}` });

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.sealer<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.sealer<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
  greet: (a) => `Sir ${a.name}`,
});

User.greet(User({ id: "a", name: "alice" })); // "Hi, alice"
Admin.greet(Admin({ name: "root", level: 9 })); // "Sir root"
```

A trait that implements something takes its companion as the first argument. The second is what the
trait left open, plus any default the Val replaces, as `Admin` replaced `greet`.

## Defaults no Val may replace

Mark one `Final`:

```ts
import { Val } from "valof";
import { Trait, type Final, type Self } from "valof/experimental";

// ---cut---
type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    shout: Final<(self: Self) => string>;
  }
>;

const Greetable = Trait.companion<Greetable>().impl({
  greet: (g) => `Hi, ${g.name}`, // a Val may replace this one
  shout: (g) => g.name.toUpperCase(), // declared Final: no Val may
});

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.sealer<User>().implTrait(Greetable);
```

The trait implements both, so `implTrait` needs no second argument. A Val may still pass `greet` to
replace it. Passing `shout` is an error.

Only `Final` members are exposed on the trait's own type: `Greetable.shout(user)` typechecks and
`Greetable.greet` does not.

A default calling a `Final` member references the trait and annotates its return type:

```ts
import { Trait, type Final, type Self } from "valof/experimental";

type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    shout: Final<(self: Self) => string>;
  }
>;
// ---cut---
const Greetable = Trait.companion<Greetable>().impl({
  shout: (g): string => g.name.toUpperCase(),
  // A member referencing `Greetable` itself annotates its return type, to avoid an implicit `any`.
  greet: (g): string => `Hi, ${Greetable.shout(g)}`,
});
```

A member a Val may replace is not on `Greetable`, because reading it off the trait would run the
default even for a Val that replaced it. Call it through that Val's companion, which dispatches.

## Implement Traits on an Enum

An [enum](enums.md) implements a trait once, over the union. What differs per variant is a `match`
inside the implementation:

```ts
import { Enum, Trait, type Self } from "valof/experimental";
// ---cut---
type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;
const Describable = Trait.companion<Describable>();

type Cmd = Enum<"Cmd", { Add: { n: number }; Del: { at: number } }, { id: string } & Describable>;
const Cmd = Enum.sealer<Cmd>().implTrait(Describable, {
  describe: (c): string => Cmd.match(c, { Add: (a) => `add ${a.n}`, Del: (d) => `del ${d.at}` }),
});

Cmd.describe(Cmd.Add({ id: "c1", n: 2 })); // "add 2"
```

An enum declares its shared fields and its traits in one argument: a trait brings the fields it
requires, so declaring them again is not needed. Variants cannot implement traits.

## Hold values of different types together

`dyn` pairs a value with one Val's implementation, so values of different types share an array. The
concrete type is gone; the trait is what is left. This is inspired by Rust's `Box<dyn Trait>`:

```ts
import { Val } from "valof";
import { Trait, type Dyn, type Self } from "valof/experimental";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;
const Greetable = Trait.companion<Greetable>().impl({ greet: (g) => `Hi, ${g.name}` });

type User = Val<"User", { id: string; name: string }, Greetable>;
const User = Val.sealer<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }, Greetable>;
const Admin = Val.sealer<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
  greet: (a) => `Sir ${a.name}`,
});
// ---cut---
const party: Dyn<Greetable>[] = [
  Greetable.dyn(User, User({ id: "a", name: "alice" })),
  Greetable.dyn(Admin, Admin({ name: "root", level: 9 })),
];

party.map((p) => p.greet()); // ["Hi, alice", "Sir root"]
party.map((p) => p.name); // ["alice", "root"]: a trait field, read from the box
```

A box binds the receiver, so its members take the remaining arguments alone. The trait's fields are
readable on it, and a function taking `Greetable` accepts one. The Val's own fields are not: `p.id`
is a type error, because `dyn` drops the concrete type.

A box is a proxy over its value, not a Val. It has its own identity, and it has no `patch`. A
payload cannot hold one.

The two arguments belong together: the companion has to match the value's own type, so another Val's
companion is rejected.

An enum boxes the same way, through its own companion:
`Describable.dyn(Cmd, Cmd.Add({ id: "c1", n: 2 }))`.

## Several traits on one Val

Intersect them in the declaration, and implement each in its own step:

```ts
import { Val } from "valof";
import { Trait, type Self } from "valof/experimental";

type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
const Greetable = Trait.companion<Greetable>().impl({ greet: (g) => `Hi, ${g.name}` });
// ---cut---
type Weighed = Trait<"Weighed", { kg: number }, { heavy: (self: Self) => boolean }>;
const Weighed = Trait.companion<Weighed>().impl({ heavy: (w) => w.kg > 10 });

type Crate = Val<"Crate", { name: string; kg: number }, Greetable & Weighed>;
const Crate = Val.sealer<Crate>().implTrait(Greetable).implTrait(Weighed);

const crate = Crate({ name: "box", kg: 20 });
Greetable.dyn(Crate, crate).greet(); // "Hi, box"
Weighed.dyn(Crate, crate).heavy(); // true
```

Write `&`, not `|`.

Each trait boxes on its own. No two traits on one Val may declare the same member name.

## Names a member may not take

A member name is rejected when a Val could not carry it:

- a field's name from the trait's own shape
- `patch`, `seal` or `create`, which the library defines
- anything under `__valof_` or starting with `impl`
- `dyn`, which the trait itself uses
- `then`, which would make the companion a thenable

Each is reported where the trait is declared.

A member may not take the name of a field the implementing Val holds. That includes a field another
trait on the same Val requires. The colliding name comes from the Val, so this one is reported at
`implTrait`.
