# Caveats

## Return payloads across serialization boundaries

**Return the payload, not the value.** A generated client derives its response type from the
handler, so a Val there arrives on the other side already typed as one, without having passed
through the seal.

```ts
import { Val, type PayloadOf } from "valof";

type User = Val<"User", { name: string }>;

declare const user: User;
declare const app: {
  get(path: string, handler: (c: { json(body: unknown): Response }) => Response): void;
};
// ---cut---
app.get("/user/:id", (c) => {
  const body: PayloadOf<User> = user; // the brand drops, the object is the same one
  return c.json(body);
});
```

Now the other side cannot use what arrives until it seals it:

```ts
// @errors: 2322
import { Val, type PayloadOf } from "valof";

type User = Val<"User", { name: string }>;
const User = Val.sealer<User>();

declare const res: { json(): Promise<PayloadOf<User>> };
// ---cut---
const plain = await res.json(); // the generated client types this as PayloadOf<User>
const bad: User = plain; // type error: the brand is missing
const user = User(plain); // sealed, and now it is one
```

`PayloadOf<V>` removes the brand from the type, not from the value, so it costs nothing at run time.
`Val.unwrap` copies and drops `readonly` too, which a request body does not need.

Persistence helpers can create the same hole.
[Jotai's `atomWithStorage`](https://jotai.org/docs/utilities/storage), for example, parses stored
JSON and returns it as the type inferred from its initial value. Store a `PayloadOf<User>`, then
seal it after reading.

Seal at the boundary, because the two sides deploy separately. The value was sealed by whichever
build the server is running, and that seal may be older than yours.

## Generic object utilities can bypass readonly and sealing

`Object.assign` accepts a readonly object as its target, so this passes the type checker:

```ts
import { Val } from "valof";

type User = Val<"User", { name: string }>;

declare const user: User;
// ---cut---
Object.assign(user, { name: "mallory" });
```

`Object.defineProperty` and `Reflect.set` have the same problem. Valof freezes values in
development, so these calls throw there. Production skips the freeze, and they mutate the Val.

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

The result is still typed as `User`, although its seal never saw the change. Use `User.patch` to
derive a value instead:

```ts
import { Val } from "valof";

type User = Val<"User", { name: string }>;
const User = Val.sealer<User>();

declare const user: User;
// ---cut---
const changed = User.patch(user, { name: "mallory" });
```

When an API mutates its input, pass it `Val.unwrap(user)`. When it returns a new payload, pass that
payload to `User` or `User.seal`.

## A `__proto__` key survives sealing

A `__proto__` key survives. It is a legal JSON key, and round-tripping JSON takes priority, so
sealing keeps it as an own property rather than dropping data. That is inert inside a value, but not
in code that merges a payload with `Object.assign` or a recursive merge. There, assigning the key
sets a prototype instead of copying it. Sanitize untrusted input yourself.

## Deeply nested payloads can overflow the stack

Copying and comparing are both recursive, so a payload a few thousand levels deep, or a cyclic one,
throws a `RangeError`. Handle that error when sealing or comparing values from untrusted input.
