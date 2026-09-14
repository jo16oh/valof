# Derivation

```ts
User.patch(user, { name: "sue" });
User.update(user, (u) => ({ ...u, name: u.name.toUpperCase() }));
```

**Both go through the seal**, so they return what it returns.

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
Shop.update(shop, (s) => ({ ...s, owner: newOwner })); // `patch` merges, so it cannot shrink `owner`
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

`patch` and `update` mean the same thing on every type, which is what makes them worth reading. A
derivation with rules of its own gets a name of its own, in `.impl`, and seals inside it:

```ts
const Money = Val.companion<Money>()
  .implSeal((m, seal) => seal({ ...m, amount: Math.round(m.amount) }))
  .impl({
    scale: (m, by: number): Money => Money.seal({ ...m, amount: m.amount * by }),
  });
```

That is also the only route for a primitive Val, which carries no `patch`: it has nothing to merge.

`update` is always there. **Its callback cannot fail**: it takes the value and returns a payload,
never a `Result`, or a chain of them would nest. Run a fallible transform yourself and hand the
outcome to `patch`.

```ts
Age.update(age, (n) => n + 1); // Result<Age> — the seal's, not the callback's
```

## Fields the update path must not touch

An id generated inside the constructor, a `createdAt`, a version counter: `create` produces them,
the seal preserves them, and `.fixed` keeps the update path off them.

```ts
export type User = Val<"User", { id: string; name: string; email: string }>;

export const User = Val.companion<User>()
  .implCreate((f: Omit<SeedOf<User>, "id">) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .fixed<"id">();

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
User.update(user, (u) => ({ name: u.name, email: u.email })); // id survives
User.update(user, (u) => ({ ...u, id: "forged" })); // type error
```

With keys declared fixed, `update`'s callback returns only what is left and the rest is merged back
on, so deleting an optional key goes through `patch(v, { k: undefined })` instead.

The keys are a type argument, so they do not exist at runtime. This guarantees the update path, not
the value. `Val.of<User>({ id: "forged", … })` still builds one, and so does a patch typed `any`. No
ordinary update can move `id`, which is usually what you wanted. If it must be unforgeable, `id`
belongs outside the value.
