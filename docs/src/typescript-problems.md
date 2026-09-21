# TypeScript problems Valof addresses

This chapter explains the TypeScript problems behind individual Valof features. Use the sidebar for
how to use the library.

## Branding

Two values can have the same representation but different meanings:

```ts
type UserId = string;
type OrderId = string;

declare const userId: UserId;
let orderId: OrderId;

orderId = userId; // allowed: both types are string
```

A [brand](basics.md) lets TypeScript distinguish them without changing their runtime representation.
A branded type normally needs a constructor that contains a type assertion. This keeps assertions
out of callers, but every branded type still needs the same constructor boilerplate, including an
`as` cast. `Val.sealer` supplies the constructor. Declare the type and its constructor together;
[branding](basics.md#define-branded-types) covers names, construction and the rules that keep the
brand intact:

```ts
import { Val } from "valof";

// ---cut---
type UserId = Val<"UserId", string>;
const UserId = Val.sealer<UserId>();

const id = UserId("u1");
```

## Immutability

`Readonly<T>` is shallow. TypeScript has no built-in `DeepReadonly`, and a mutable original
reference can still change a readonly view. A recursive `DeepReadonly` type protects nested fields,
but updating one immutably still means rebuilding each object on the path.

Valof makes these conventions the default. `Val` applies `DeepReadonly`, its constructor copies the
input to remove mutable aliases, `patch` rebuilds only the paths it changes, and `.nocopy` is the
explicit escape hatch for a payload that already has no mutable aliases;
[immutability](immutability.md) shows the copy and `.nocopy` contracts:

```ts
import { Val } from "valof";

// ---cut---
type Profile = Val<"Profile", { name: string; address: { city: string } }>;
const Profile = Val.sealer<Profile>();

const profile = Profile({ name: "alice", address: { city: "Osaka" } });
const changed = Profile.patch(profile, { address: { city: "Tokyo" } });
```

## Companion objects

A TypeScript type does not create a value namespace. Its functions are usually standalone:

```ts
type User = { id: string; name: string; nickname?: string };

function getUserDisplayName(user: User) {
  return user.nickname ?? user.name;
}

function formatUserLabel(user: User, separator: string) {
  return user.id + separator + getUserDisplayName(user);
}
```

The type name appears in each function name to keep related functions recognizable. Each function
also repeats the type annotation for its first parameter.

A class provides a namespace for its functions, but also turns each value into a class instance.
Keeping its instances immutable requires `readonly` on every field and nested property. Its JSON
shape depends on property enumerability unless you write and maintain a `toJSON` mapping.

A [companion object](companion-objects.md) collects the constructor and functions under the type's
name while values remain plain data. `Val.sealer<V>().impl({ ... })` creates it. The result stays
callable and exposes the registered members; the chapter also explains `patch`:

```ts
import { Val } from "valof";

// ---cut---
type User = Val<"User", { name: string }>;
const User = Val.sealer<User>().impl({ greeting: (user) => `Hi, ${user.name}` });

User.greeting(User({ name: "alice" }));
```

## Parse, don't validate

Valof makes parsing a convention. A companion has one `seal`, and `seal`, `create` and `patch` pass
their payloads through it. A custom seal returns a validated, normalized Val or its failure, so the
result type records that parsing succeeded.

Start with `Val.companion<V>()` and register the parser with `.implSeal`. The resulting `.seal`
returns the value or the parser's failure; [custom constructors](custom-constructors.md) explains
schemas, normalization and generated fields:

```ts
import { Val } from "valof";

// ---cut---
type Age = Val<"Age", number>;
const Age = Val.companion<Age>().implSeal((value, seal) =>
  value >= 0 ? seal(value) : new Error("age must not be negative"),
);

const age = Age.seal(30); // Age | Error
```

## Enums

An [enum](enums.md) keeps a closed set of variants in one declaration and requires a handler for
every variant.

### A hand-written union scatters the set

TypeScript already models a closed set as a discriminated union, and a base type for the fields
every variant holds:

```ts
type Base = { id: string };
type Circle = Base & { _tag: "Circle"; r: number };
type Square = Base & { _tag: "Square"; side: number };
type Shape = Circle | Square;
```

Adding `Triangle` is three edits: a new type, a new arm on the union, and `& Base` again. Forget the
last one and the declaration still compiles. TypeScript reports it at the first `shape.id`, not at
the variant missing `& Base`.

### A new variant breaks a `switch` silently

A `switch` on the tag narrows, and a missing case is an error where the return type is annotated and
every arm returns. A `switch` that runs side effects has neither, so adding `Triangle` compiles:

```ts
type Circle = { _tag: "Circle"; r: number };
type Square = { _tag: "Square"; side: number };
declare function drawCircle(c: Circle): void;
declare function drawSquare(s: Square): void;
// ---cut---
type Triangle = { _tag: "Triangle"; base: number; height: number };
type Shape = Circle | Square | Triangle;

function draw(shape: Shape) {
  switch (shape._tag) {
    case "Circle":
      drawCircle(shape);
      break;
    case "Square":
      drawSquare(shape);
      break;
  }
}
```

A triangle draws nothing, and no type says so. You write the check yourself: `assertNever(shape)`
under a `default`, and a `break` closing every case. `strict` reports neither a missing case nor a
missing `break`. `noFallthroughCasesInSwitch` catches the second, and the lint rule
`typescript/switch-exhaustiveness-check` catches the first, once you enable both.

Declare variants in `Enum<...>` and create their companion with `Enum.sealer<E>()`.
`companion.match(value, handlers)` requires a handler for every variant;
[enums](enums.md#declare-the-variants) covers shared fields, custom seals and tags:

```ts
import { Enum } from "valof/experimental";

// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.sealer<Shape>();

const area = Shape.match(Shape.Circle({ r: 2 }), {
  Circle: (circle) => Math.PI * circle.r * circle.r,
  Square: (square) => square.side * square.side,
});
```

## Traits

A [trait](traits.md) declares the fields and functions that several Vals share.

### A function does not declare a contract

A function can accept the fields it reads, and every type holding them fits:

```ts
type User = { id: string; name: string };
type Admin = { name: string; level: number };

function greet(greetable: { name: string }): string {
  return `Hi, ${greetable.name}`;
}
```

The parameter is the contract, written again in every function that wants it. Rename a field and the
type remains valid. The function remains valid. Only a call fails.

The error lands away from the type that broke it:

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

A companion collects one Val's functions, but does not declare behavior shared by other Vals. A
trait declares shared fields and functions once. Each implementing Val points to that declaration,
so a renamed field fails at the Val that broke the contract.

```ts
// @errors: 2345
import { Val } from "valof";

// ---cut---
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
behavior and sharing it are still two different things.

Declare a `Trait`, add it to a Val's third type argument, then register its members with
`.implTrait`; [traits](traits.md#declare-what-vals-share) covers defaults, enums and `dyn`:

```ts
import { Val } from "valof";
import { Trait, type Self } from "valof/experimental";

// ---cut---
type Describable = Trait<"Describable", { name: string }, { describe: (self: Self) => string }>;
const Describable = Trait.companion<Describable>();

type User = Val<"User", { name: string }, Describable>;
const User = Val.sealer<User>().implTrait(Describable, { describe: (user) => user.name });
```
