# Utilities

## `equals`

`equals` compares two Vals of the same type structurally and deeply:

```ts
import { equals, Val } from "valof";

type User = Val<"User", { id: string; profile: { name: string } }>;
const User = Val.sealer<User>();

const a = User({ id: "a", profile: { name: "alice" } });
const b = User({ id: "a", profile: { name: "alice" } });

a === b; // false
equals(a, b); // true
```

The comparison:

- compares array elements in order
- is independent of object key order
- ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

The first argument fixes the Val type accepted by the second, so comparing values with different
brands is a type error.

`equals` always compares the stored structure. When different inputs mean the same value, normalize
them in the [seal](custom-constructors.md#normalize-in-the-seal). When the comparison means
something other than value equality, give it a name in the companion.

## `Val.of`

Brands a payload with the type named explicitly.

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;
// ---cut---
Val.of<User>({ id: "a", name: "alice" });
```

If the type has a `seal` of its own, use that instead. **`Val.of` skips the checks as an escape
hatch**. [Linting](linting.md) reports misuse of it, such as calling `Val.of` on a type that has a
companion or specifying no type.

## `Val.unwrap`

A plain, mutable deep copy of the payload, to pass to code that does not know about `readonly`. It
strips the brand at every depth.

```ts
// @errors: 2339
import { Val } from "valof";

type Post = Val<"Post", { title: string; tags: string[] }>;
const Post = Val.sealer<Post>();
// ---cut---
const post = Post({ title: "t", tags: ["a"] });

post.tags.sort(); // ✗ readonly string[] has no sort
Val.unwrap(post).tags.sort(); // ✓
```

It returns the payload as the type declares it, so a `readonly` written there survives the unwrap.
Write the payload plain. See [Allowed types](allowed-types.md).
