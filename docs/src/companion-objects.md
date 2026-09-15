# Companion objects

A TypeScript type does not create a value namespace. Its functions are usually standalone:

```ts
type User = { id: string; name: string; nickname?: string };

function getUserDisplayName(user: User) {
  return user.nickname ?? user.name;
}

function formatUserLabel(user: User, separator: string) {
  return user.id + separator + user.name;
}
```

The type name appears in each function name to keep related functions recognizable. Each function
also repeats the type annotation for its first parameter.

A class provides a namespace for its functions, but also turns each value into a class instance.
Keeping its instances immutable requires `readonly` on every field and nested property. Its JSON
shape depends on property enumerability unless you write and maintain a `toJSON` mapping.

## Collect related functions in a companion object

Valof collects the constructor and functions under a value with the same name as the type:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string; nickname?: string }>;

const User = Val.sealer<User>().impl({
  displayName(user) {
    return user.nickname ?? user.name;
  },
  formatLabel(user, separator: string) {
    return user.id + separator + user.name;
  },
});
```

`Val.sealer<User>()` creates the constructor. `.impl({ ... })` adds functions under the `User`
namespace. Every function takes its Val first, so Valof infers that parameter as `User`. You only
annotate the parameters that follow it.

The result remains callable and exposes the functions:

```ts
const user = User({ id: "a", name: "bob" });

User.displayName(user);
User.formatLabel(user, ": ");
```

A sealer also provides [`equals`](equality.md). Object-shaped Vals get [`patch`](derivation.md) too.
Later chapters introduce them one at a time.
