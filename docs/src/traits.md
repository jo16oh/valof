# Traits

<!-- prettier-ignore -->
> [!WARNING]
> Traits are experimental. They ship from `valof/experimental` so that an import says so, and
> the design is still changing.

## Why Traits?

### Share behaviour with a function

No class is needed. Write the function to take the fields it reads, and every type holding them
fits:

```ts
type User = { id: string; name: string };
type Admin = { name: string; level: number };

function greet(greetable: { name: string }): string {
  return `Hi, ${greetable.name}`;
}

declare const user: User;
declare const admin: Admin;

greet(user);
greet(admin);
```

Values stay plain, and the code works. What it never says is that `User` and `Admin` share anything.

### Why that is not a contract

The contract is the parameter, written again in every function that wants it, and two things follow
from that.

**The error lands away from the type that broke it.** Rename a field and `User` is still a valid
type and `greet` is still a valid function. Only a call fails:

```ts
// @errors: 2345
function greet(greetable: { name: string }): string {
  return `Hi, ${greetable.name}`;
}

type User = { id: string; nickname: string };

declare const user: User;
// ---cut---
greet(user); // type error: User has no `name` any more
```

**The behaviour collects nowhere.** `greet`, `toWire` and the rest each declare their own shape.
Nothing names the set, so the domain model has no place saying what this kind of value does.

A companion answers the second one. It collects a type's functions under the type's name, and it
belongs to that one Val:

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

User.greet(admin); // type error: greet belongs to User
```

`Admin` holds the `name` that `greet` reads, and `User.greet` rejects it all the same. Collecting
the behaviour and sharing it are still two different things.

A trait is an abstraction you write down. It names what Vals have in common, the fields and the
functions alike, and it names the Vals that implement it. That is an interface in the general sense,
written once, with the implementing types pointing at it. Rename a field and the Val that declared
the trait is what errors.

## Declare what Vals share

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

The third declares the functions. They become members of every companion that implements the trait,
and they take the value first like any other member.

`Self` stands for the implementing Val. A member may take it, and may not return it: what wants to
return a `Self` is a constructor, and a trait has no brand to seal with.

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

Declaring the trait is what makes the payload answer for its fields: a `User` without `name` is a
type error at the declaration, not at `implTrait`.

The checker stops at the declaration. `Val<"User", …, Greetable>` typechecks with no `implTrait`
anywhere, so the `unimplemented-trait` rule in [valof-lint](linting.md) is what reports the Val that
declared a trait and never implemented it.

## Give a default implementation

Every Val writing its own `greet` repeats the same line. A trait can implement a member itself, over
the shape alone, and that becomes the default for every Val that does not replace it:

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

Only `Final` members are named on the trait's own type: `Greetable.shout(user)` typechecks and
`Greetable.greet` does not.

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
// @errors: 2322
import { Trait, type Self } from "valof/experimental";
// ---cut---
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;

const duck: Greetable = { name: "duck" }; // type error: the brand is missing
```

A Val declaring the trait carries its brand, and that brand is what the trait type asks for. The
fields alone do not put it there, so only a Val that declared `Greetable` is assignable to it.

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

Each trait boxes on its own. No two traits on one Val may register the same member name.

## Names a member may not take

A member name is rejected when a Val could not carry it:

- a field's name from the trait's own shape
- `patch`, `seal` or `create`, which the library wires
- anything under `__valof_` or starting with `impl`
- `dyn`, which the trait itself uses

Each is reported where the trait is declared.
