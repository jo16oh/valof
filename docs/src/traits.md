# Traits

<!-- prettier-ignore -->
> [!WARNING]
> Traits are provisional. They ship from `valof/experimental` so that an import says so, and the
> design is still changing.

A companion's functions belong to one Val. `User.greet` takes a `User`, and a value of another type
is rejected even when it holds the same fields:

```ts
// @errors: 2345
import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;
const User = Val.sealer<User>().impl({
  greet: (u) => `Hi, ${u.name}`,
});

type Admin = Val<"Admin", { name: string; level: number }>;
const Admin = Val.sealer<Admin>();
// ---cut---
const admin = Admin({ name: "root", level: 9 });

User.greet(admin);
```

Writing `greet` a second time on `Admin` duplicates it. Writing a standalone
`greet(value: { name: string })` shares it, but nothing records that the two types share anything:
the agreement lives in TypeScript's structural typing, where no declaration names it.

## Declare what several Vals share

A trait names the fields and the functions:

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

The second argument is the shape: the fields every implementing Val holds. It answers to the same
rules as a payload, so a shape no Val could ever hold is an error where it is written.

The third declares the functions. `Self` stands for the implementing Val. A member may take it, and
may not return it: what wants to return a `Self` is a constructor, and a trait has no brand to seal
with.

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
const Greetable = Trait.companion<Greetable>().impl({ greet: (g) => `Hi, ${g.name}` });
// ---cut---
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

Declaring the trait is what makes the payload answer for its fields: a `User` without `name` is a
type error at the declaration, not at `implTrait`.

`Self` resolves to the Val, so the members need no annotation. `User.toWire` is
`(self: User, sep: string) => string`, and the trait's members sit on the companion beside its own
functions.

## Defaults, and the ones a Val may not replace

`Trait.companion<Greetable>().impl({ ... })` implements a member over the shape. A Val may replace
one, as `Admin` replaced `greet` above. Mark a member `Final` to keep it the trait's:

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

`implTrait` takes the members the trait left open. Passing one it already implements replaces it,
and passing a `Final` one is an error.

Only `Final` members are named on the trait itself: `Greetable.shout(user)` works, `Greetable.greet`
does not exist. A namespace that could call a default would look like it dispatched, and it cannot.
Every other call goes through the Val's companion, which is where the Val's own version lives.

A trait that implements nothing of its own has no companion to pass. Name it as the type argument
instead:

```ts
import { Val } from "valof";
import { type Self, type Trait } from "valof/experimental";

type Wire = Trait<"Wire", { id: string }, { toWire: (self: Self, sep: string) => string }>;
// ---cut---
type Row = Val<"Row", { id: string; n: number }, Wire>;
const Row = Val.sealer<Row>().implTrait<Wire>({
  toWire: (r, sep) => `${r.id}${sep}${r.n}`,
});
```

## Hold values of different types together

`dyn` pairs a value with one Val's implementation, so values of different types share an array. The
concrete type is gone; the trait is what is left:

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
party.map((p) => p.name); // ["alice", "root"]
```

A box binds the receiver, so its members take the remaining arguments alone. The trait's fields read
straight off it, and a function taking `Greetable` accepts one.

A box is a proxy over its value, not a Val. It has its own identity, and it has no `patch`. A
payload cannot hold one.

The two arguments belong together: the companion has to answer for the value's own type, so another
Val's companion is rejected.

## A trait is a contract between Vals

A plain object that happens to hold the fields is not one of them:

```ts
// @errors: 2345
import { Val } from "valof";
import { Trait, type Final, type Self } from "valof/experimental";

type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; shout: Final<(self: Self) => string> }
>;
const Greetable = Trait.companion<Greetable>().impl({
  greet: (g) => `Hi, ${g.name}`,
  shout: (g) => g.name.toUpperCase(),
});
// ---cut---
Greetable.shout({ name: "duck" });
```

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

Write `&`, not `|`. A union asks the payload for only the fields its members share, which is not a
contract, so the declaration rejects it.

Each trait boxes on its own. No two traits on one Val may register the same member name.

## Names a member may not take

A member name is rejected when a Val could not carry it:

- a field's name from the trait's own shape
- `patch`, `seal` or `create`, which the library wires
- anything under `__valof_` or starting with `impl`
- `dyn`, which the trait itself uses

Each is reported where the trait is declared.
