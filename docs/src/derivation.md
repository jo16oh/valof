# Derivation

```ts
User.patch(user, { name: "sue" });
```

`patch` goes through the seal, so it returns what the seal returns.

| patch              | meaning         |
| ------------------ | --------------- |
| key omitted        | leave unchanged |
| `{ k: undefined }` | **delete**      |
| `{ k: value }`     | set             |

`undefined` on a required key is a type error with `exactOptionalPropertyTypes` on. With it off, a
patch that breaks the invariant is caught by the seal instead.

A patch reaches any depth, and only the keys it names change:

```ts
type City = Val<"City", { name: string; zip: string }>;
type Shop = Val<"Shop", { owner: { name: string; email: string }; city: City }>;

Shop.patch(shop, { owner: { email: "e@example.com" } }); // the owner's name stays
Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) }); // a Val is replaced, not patched
Shop({ ...shop, owner: newOwner }); // call the constructor to replace rather than merge `owner`
```

A nested Val, an array and a primitive are replaced whole: a patch reaching inside a Val would build
a payload its own seal never saw. Derive it with its own `patch`, which goes through that seal and
keeps the parts it did not touch.

## Structural sharing

A derivation copies only the path to what changed. Untouched branches keep their reference identity:

```ts
const renamed = Shop.patch(shop, { owner: { name: "sue" } });

renamed.city === shop.city; // true
Shop.patch(shop, {}) === shop; // true
```

This lets reference comparisons, such as React dependency arrays, skip work when their value did not
change.

`patch` means the same thing on every object-shaped Val. A derivation with rules of its own gets a
name of its own, in `.impl`, and seals inside it:

```ts
const Money = Val.companion<Money>()
  .implSeal((m, seal) => seal({ ...m, amount: Math.round(m.amount) }))
  .impl({
    scale: (m, by: number): Money => Money.seal({ ...m, amount: m.amount * by }),
  });
```

That is also the only route for a primitive Val, which carries no `patch`: it has nothing to merge.

## Fixed fields

An id generated inside the constructor, a `createdAt`, a version counter: `create` produces them,
the seal preserves them, and `.fixed` keeps `patch` off them.

```ts
export type User = Val<"User", { id: string; name: string; email: string }>;

export const User = Val.companion<User>()
  .implCreate((f: Omit<SeedOf<User>, "id">) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .fixed<"id">();

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
```

The keys are a type argument, so they do not exist at runtime. This constrains `patch`, not the
value. `Val.of<User>({ id: "forged", … })` still builds one, and so does a patch typed `any`. If
`id` must be unforgeable, it belongs outside the value.
