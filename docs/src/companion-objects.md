# Companion objects

> For the limits of standalone functions and classes, see
> [TypeScript problems Valof addresses](typescript-problems.md#companion-objects).

## Collect related functions in a companion object

Valof collects the constructor and functions under a value with the same name as the type:

```ts
import { Val } from "valof";

// ---cut---
type User = Val<"User", { id: string; name: string; nickname?: string }>;

const User = Val.sealer<User>().impl({
  displayName(user) {
    return user.nickname ?? user.name;
  },
  // A member calling another member annotates its return type, to avoid an implicit `any`.
  formatLabel(user, separator: string): string {
    return user.id + separator + User.displayName(user);
  },
});
```

`Val.sealer<User>()` creates the constructor. `.impl({ ... })` adds functions under the `User`
namespace, where they are the companion's members, in one call that ends the chain. Every member
takes its Val first, so Valof infers that parameter as `User`. You only annotate the parameters that
follow it, and the return type where a member references `User` itself.

The result remains callable and exposes the members:

```ts
import { Val } from "valof";

type User = Val<"User", { id: string; name: string; nickname?: string }>;
const User = Val.sealer<User>().impl({
  displayName(user) {
    return user.nickname ?? user.name;
  },
  formatLabel(user, separator: string): string {
    return user.id + separator + User.displayName(user);
  },
});
// ---cut---
const user = User({ id: "a", name: "bob" });

User.displayName(user);
User.formatLabel(user, ": ");
```

Vals are plain data, so member functions can't be chained like class instances. Combine Valof with
any pipe library you like to avoid nesting or to reduce temporal variables.

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

An object-shaped Val gets `patch`. The same update lists only what changes:

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
