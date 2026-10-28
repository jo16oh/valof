# The Default Companion

`Val.companion<V>().build()` returns the default companion: [`seal`](val.md#construct-values), and
`patch` for a Val that holds an object payload.

The steps between `Val.companion` and `.build()` replace `seal` or add functions to the companion.
Write `.implSeal` first, then `.implCreate`. `.impl`, `.implTrait` and `.implAssoc` come next, in
any order. `.impl` is written once.

- [Adding Functions to the Companion](adding-functions.md) covers `.impl` and `.implAssoc`.
- [Custom Constructors and Invariants](custom-constructors.md) covers `.implSeal` and `.implCreate`.
- [Traits](traits.md) covers `.implTrait`.

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

With `patch`, the same update lists only what changes:

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

Like [`seal`](immutability.md#vals-are-immutable), `patch` reuses what is already inside the Val. It
copies only the path to what changed, and untouched branches keep their reference identity:

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
change.
