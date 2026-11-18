# The Default Companion

`Val.companion<V>().build()` returns the default companion: [`seal`](val.md#construct-values), and
`patch` for a Val that holds an object payload.

The steps between `Val.companion` and `.build()` replace `seal` or add functions to the companion.
Write `.implSeal` first, then `.implCreate`. `.impl`, `.implTrait` and `.implAssoc` come next, in
any order. `.impl` is written once.

- [Adding Functions to the Companion](adding-functions.md) covers `.impl` and `.implAssoc`.
- [Custom Constructors and Invariants](custom-constructors.md) covers `.implSeal` and `.implCreate`.
- [Traits](traits.md) covers `.implTrait`.

## Derive a changed value with `patch`

Without Valof, changing a deeply readonly `shop` means rebuilding every object on the path:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone: string | undefined } }; city: City }
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

With `patch`, the same update assigns only what changes:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone: string | undefined } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
// ---cut---
const changed = Shop.patch(shop, (s) => {
  s.owner.contact.email = "e@example.com";
});
```

`patch` passes a draft of the payload to the recipe, the function it takes. An assignment changes
that field, and every other field stays as it was. A plain object field is a draft too, so an
assignment can change a field inside it, as `s.owner.contact.email` does. Each assignment must match
the field's type.

A nested Val and an array are read-only in the draft, so assign a new value to their field. Derive a
nested Val with its own `patch`, so its own seal checks the change:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone: string | undefined } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
// ---cut---
Shop.patch(shop, (s) => {
  s.city = City.patch(s.city, (c) => {
    c.name = "Osaka";
  });
});
```

The recipe runs synchronously. Once it returns, reading or writing the draft throws. An async recipe
is a type error. So is a recipe whose parameter type makes writable a key the draft keeps read-only,
such as `(d: { id: string }) => …` where `id` is
[`Unpatchable`](custom-constructors.md#restrict-the-companion-with-options). Leave the parameter
type to inference.

Like [`seal`](immutability.md#vals-are-immutable), `patch` reuses what is already inside the Val. It
copies only the path to what changed, and untouched branches keep their reference identity:

```ts
import { Val } from "valof";

type City = Val<"City", { name: string }>;
const City = Val.companion<City>().build();
type Shop = Val<
  "Shop",
  { owner: { name: string; contact: { email: string; phone: string | undefined } }; city: City }
>;
const Shop = Val.companion<Shop>().build();

declare const shop: Shop;
declare const changed: Shop;
// ---cut---
changed.city === shop.city; // true
Shop.patch(shop, () => {}) === shop; // true
```

Reference comparisons, such as React dependency arrays, can then skip work when their value did not
change.
