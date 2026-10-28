# Caveats

## Generic object utilities can bypass readonly and sealing

`Object.assign` accepts a readonly object as its target, so this passes the type checker:

```ts
import { Val } from "valof";

type User = Val<"User", { name: string }>;

declare const user: User;
// ---cut---
Object.assign(user, { name: "mallory" });
```

`Object.defineProperty` has the same problem. Valof freezes values in development, so both calls
throw there. Production skips the freeze, and they mutate the Val.

Other utilities return a new object but preserve the input type. Immer, for example, makes a
readonly input writable inside a callback:

```ts
import { Val, type PayloadOf } from "valof";

type User = Val<"User", { name: string }>;

declare const user: User;
declare function produce<T>(value: T, recipe: (draft: PayloadOf<User>) => void): T;
// ---cut---
const changed = produce(user, (draft) => {
  draft.name = "mallory";
}); // User
```

The result is still typed as `User`, although its seal never checked the change. Use `User.patch` to
derive a value instead:

```ts
import { Val } from "valof";

type User = Val<"User", { name: string }>;
const User = Val.companion<User>().build();

declare const user: User;
// ---cut---
const changed = User.patch(user, { name: "mallory" });
```

When an API mutates its input, pass it `Val.unwrap(user)`. When it returns a new payload, pass that
payload to `User.seal`.

## A `__proto__` key survives sealing

Sealing keeps a `__proto__` key as an own property, because it is a legal JSON key. That is inert
inside a value, but not in code that merges a payload with `Object.assign` or a recursive merge.
There, assigning the key sets a prototype instead of copying it. Sanitize untrusted input yourself.

## Deeply nested payloads can overflow the stack

Copying and comparing are both recursive, so a payload a few thousand levels deep, or a cyclic one,
throws a `RangeError`. Handle that error when sealing or comparing values from untrusted input.
