# Companion objects

> For the limits of standalone functions and classes, see
> [TypeScript problems Valof addresses](typescript-problems.md#companion-objects).

## Collect related functions in a companion object

Valof collects the constructor and functions under a value with the same name as the type:

```ts
import { Val } from "valof";

// ---cut---
type User = Val<"User", { id: string; name: string; nickname?: string }>;

const User = Val.companion<User>()
  .impl(() => ({
    displayName(user) {
      return user.nickname ?? user.name;
    },
    // A member calling another member annotates its return type, to avoid an implicit `any`.
    formatLabel(user, separator: string): string {
      return user.id + separator + User.displayName(user);
    },
  }))
  .build();
```

`Val.companion<User>()` starts the chain. `.impl(() => ({ ... }))` adds member functions to the
companion. `.build()` ends the chain and returns the companion. Every `.impl` member takes its Val
first, so Valof infers that parameter as `User`. You only annotate the parameters that follow it,
and the return type where a member references `User` itself.

The function passed to `.impl` receives `seal`, `create` where `.implCreate` registered one, and
`patch` for a Val that holds an object payload. A member calling them does not reference `User`, so
its return type needs no annotation.

A function that does not take the Val as its first argument, such as one that parses it from a
string or aggregates an array of Vals into one, is registered with `.implAssoc`. See
[Custom constructors](custom-constructors.md#define-other-constructors-with-implassoc).

The result exposes `seal` and the members:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string; nickname?: string }>;
const User = Val.companion<User>()
  .impl(() => ({
    displayName(user) {
      return user.nickname ?? user.name;
    },
    formatLabel(user, separator: string): string {
      return user.id + separator + User.displayName(user);
    },
  }))
  .build();
// ---cut---
const user = User.seal({ id: "a", name: "bob" });

User.displayName(user);
User.formatLabel(user, ": ");
```

## Call a member with the value last

Vals are plain data, so their members cannot be chained like methods. Instead, a member taking more
than one argument can be called with the value last, which is the form a pipeline expects. A member
taking only the value is passed as it is:

```ts
import { Val } from "valof";

declare function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
type User = Val<"User", { id: string; name: string; nickname?: string }>;
const User = Val.companion<User>()
  .impl(() => ({
    displayName(user) {
      return user.nickname ?? user.name;
    },
    formatLabel(user, separator: string): string {
      return user.id + separator + User.displayName(user);
    },
  }))
  .build();
const user = User.seal({ id: "a", name: "bob" });
// ---cut---
User.formatLabel(user, ": "); // "a: bob"
User.formatLabel(": ")(user); // "a: bob"

pipe(user, User.patch({ nickname: "b" }), User.displayName); // "b"
```

`patch`, a trait's member taking more than one argument, an enum's `match` and `[Tag].match` can be
called either way too. Valof ships no `pipe`. Use the one from your favorite library.

A member cannot have an optional, a default or a rest parameter. Pass `undefined` explicitly where
an argument has no value:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;
// ---cut---
const User = Val.companion<User>()
  .impl(() => ({
    greet: (user, greeting: string | undefined) => `${greeting ?? "Hi"}, ${user.name}`,
  }))
  .build();

User.greet(User.seal({ id: "a", name: "bob" }), undefined); // "Hi, bob"
```

Valof checks the parameters that a member's type shows, not the ones in its implementation. A type
annotation can hide a default or a rest parameter. The member is then accepted, but a call with the
value last fails:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;
// ---cut---
const toWire: (user: User, sep: string) => string = (user, sep = "/") => user.id + sep + user.name;
const User = Val.companion<User>()
  .impl(() => ({ toWire }))
  .build();

User.toWire("-")(User.seal({ id: "a", name: "bob" })); // throws: `User.toWire("-")` returned a string
```

Do not use a default or a rest parameter in the implementation either.

Called with the value last, a generic member loses its type parameters. Each becomes its constraint,
or `unknown` where none is declared. To keep them, wrap the member in a function that calls it with
the value first:

```ts
import { Val } from "valof";

declare function pipe<A, B>(a: A, ab: (a: A) => B): B;
type User = Val<"User", { name: string; age: number }>;
// ---cut---
const User = Val.companion<User>()
  .impl(() => ({
    pick: <K extends keyof User>(user: User, key: K) => user[key],
  }))
  .build();
const user = User.seal({ name: "bob", age: 30 });

pipe(user, User.pick("age")); // string | number
pipe(user, (u) => User.pick(u, "age")); // number
```

## Patch object values

Without Valof, changing a deeply readonly `shop` means rebuilding every object on the path:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
// ---cut---
const changed = {
  ...shop,
  owner: {
    ...shop.owner,
    contact: {
      ...shop.owner.contact,
      email: "e@example.com",
    },
  },
};
```

An object-shaped Val gets `patch`. The same update lists only what changes:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
// ---cut---
const changed = Shop.patch(shop, {
  owner: { contact: { email: "e@example.com" } },
});
```

A patch expresses three operations:

- Omit a key to leave it unchanged.
- Pass `{ k: undefined }` to delete it.
- Pass `{ k: value }` to set it.

With `exactOptionalPropertyTypes`, `{ k: undefined }` is accepted only for optional keys. Without
it, TypeScript also accepts it for required keys, and `patch` deletes them at runtime.

A patch reaches through nested plain objects, but replaces a nested Val, an array or a primitive
whole:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
// ---cut---
Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) });
```

Derive a nested Val with its own `patch`, so its own seal checks the change.

`patch` copies only the path to what changed. Untouched branches keep their reference identity:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
declare const changed: Shop;
// ---cut---
changed.city === shop.city; // true
Shop.patch(shop, {}) === shop; // true
```

Reference comparisons, such as React dependency arrays, can then skip work when their value did not
change. Primitive and array Vals have no `patch`, because they have nothing to merge.

## Restrict the companion with options

Options in the second type argument of `Val.companion` restrict what the companion offers callers.
Any of them can be combined.

### Hide `seal` and `create`

[`create`](custom-constructors.md#generate-fields-with-create) can generate an id. `PrivateSeal`
removes `seal` from the companion, so a caller cannot pass an id of their own.

`PrivateCreate` removes `create` from the companion. Use it when callers should build the type
through `seal` or other functions, not `create`. It protects no field, because the payload `create`
returns passes the seal.

The function passed to `.impl`, [`.implTrait`](traits.md#implement-it-on-a-val) and `.implAssoc`
still receives `seal` and `create`, so the companion's own members can build the type.

### Exclude keys from `patch`

`Unpatchable` excludes keys from `patch`, so an id keeps the value `create` generated.

### Examples

```ts
// @errors: 2339 2353
import { Val, type PrivateSeal, type Unpatchable } from "valof";

declare const user: User;
// ---cut---
type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User, [PrivateSeal, Unpatchable<"id">]>()
  .implCreate((name: string) => ({ id: crypto.randomUUID(), name }))
  .build();

User.create("sue"); // User
User.seal({ id: "forged", name: "sue" }); // type error
User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
```
