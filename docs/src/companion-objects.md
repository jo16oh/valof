# Companion objects

A type disappears at runtime, so its constructor and functions need their own declarations. Valof
collects them under a value with the same name:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string; nickname?: string }>;

const User = Val.sealer<User>().impl({
  greet(user) {
    return `Hi, I'm ${user.name}.`;
  },
  label(user, separator: string) {
    return user.id + separator + user.name;
  },
});
```

`Val.sealer<User>()` creates the constructor. `.impl({ ... })` adds functions to it. Every function
takes its Val first, so Valof infers that parameter as `User`. You only annotate the parameters that
follow it.

The result remains callable and exposes the functions:

```ts
const user = User({ id: "a", name: "bob" });

User.greet(user);
User.label(user, ": ");
```

A sealer also provides [`equals`](equality.md). Object-shaped Vals get [`patch`](derivation.md) too.
Later chapters introduce them one at a time.
