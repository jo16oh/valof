# Adding Functions to the Companion

> For the limits of standalone functions and classes, see
> [TypeScript Problems Valof Addresses](typescript-problems.md#companion-objects).

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

`.impl(() => ({ ... }))` adds member functions to the companion. Every `.impl` member takes its Val
first, so Valof infers that parameter as `User`. You only annotate the parameters that follow it,
and the return type where a member references `User` itself.

The function passed to `.impl` receives `seal`, `create` where
[`.implCreate`](custom-constructors.md#generate-fields-with-create) registered one, and `patch` for
a Val that holds an object payload. A member calling them does not reference `User`, so its return
type needs no annotation.

The companion exposes `seal` and the members:

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

`.implAssoc` registers a function that does not take the Val as its first argument:

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
to `.impl`, so its members can build the Val. A member that builds the Val is a constructor. See
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
called either way too. Valof ships no `pipe`. Use the one from your favorite library.

A member cannot have an optional, a default or a rest parameter. Pass `undefined` where an argument
has no value.
