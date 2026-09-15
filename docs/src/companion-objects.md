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
namespace, where they are the companion's members. Every member takes its Val first, so Valof infers
that parameter as `User`. You only annotate the parameters that follow it.

The result remains callable and exposes the members:

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
// ---cut---
const user = User({ id: "a", name: "bob" });

User.displayName(user);
User.formatLabel(user, ": ");
```

## Patch object values

Without Valof, changing a deeply readonly `shop` means rebuilding every object on the path:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.sealer<City>();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.sealer<Shop>();

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

An object-shaped Val gets `patch`. The same update names only what changes:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.sealer<City>();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.sealer<Shop>();

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
const City = Val.sealer<City>();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.sealer<Shop>();

declare const shop: Shop;
// ---cut---
Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) });
```

Derive a nested Val with its own `patch`, so its own seal sees the change.

`patch` copies only the path to what changed. Untouched branches keep their reference identity:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.sealer<City>();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone?: string } }; city: City }
>;
const Shop = Val.sealer<Shop>();

declare const shop: Shop;
declare const changed: Shop;
// ---cut---
changed.city === shop.city; // true
Shop.patch(shop, {}) === shop; // true
```

Reference comparisons, such as React dependency arrays, can then skip work when their value did not
change. Primitive and array Vals have no `patch`, because they have nothing to merge.
