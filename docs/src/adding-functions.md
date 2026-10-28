# Adding functions to the companion

> For the limits of standalone functions and classes, see
> [TypeScript problems Valof addresses](typescript-problems.md#companion-objects).

## Add functions that take the Val

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

## Add functions that do not take the Val

Register a function that does not take the Val as its first argument with `.implAssoc`:

```ts
import { Val } from "valof";

// ---cut---
type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User>()
  .implAssoc(() => ({
    names: (users: readonly User[]) => users.map((user) => user.name),
  }))
  .build();

User.names([User.seal({ id: "a", name: "bob" })]); // ["bob"]
```

The function passed to `.implAssoc` receives the same `seal`, `create` and `patch` as the one passed
to `.impl`, so its members can build the Val. Such a member is a constructor. See
[Define other constructors with `implAssoc`](custom-constructors.md#define-other-constructors-with-implassoc).

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
called either way too. An `.implAssoc` member taking more than one argument can be called with its
first argument last. Valof ships no `pipe`. Use the one from your favorite library.

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
