# 8. Idioms

These need no extra implementation in the library. The docs only show them.

## 8.1 Map / Set

```ts
// Set
type Tags = Val<"Tags", Readonly<Record<string, true>>>;

// Map
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>;
```

Prefer `Record<K, true>` to `Record<K, null>` (Go's `map[K]struct{}` style). With `null`, the type does not distinguish "the value is null" from "the key is absent", and the check becomes the roundabout `s[key] !== undefined`. With `true`, `if (s[key])` is the membership check.

With the Record representation, **structural equality is set equality** (with an array, `[1,2]` and `[2,1]` differ, and `equals` needs an override). It works as long as the default equals in §5 ignores key order.

Caveats for the README.

- **Number keys become strings through a JSON round trip.** For a set of numeric IDs, recommend `ReadonlyArray<number>`
- **Key order.** By the object spec, number-like string keys come first, in ascending order. That does no harm for a Set, but a default equals that depends on key order breaks
- **Prototype-pollution keys** (`"__proto__"` / `"constructor"`). When user input becomes a key, check with `Object.hasOwn`. The natural place for that helper is the companion
- **`Object.entries` picks up the phantom key.** A Val is an intersection with its brand, so the value type of `Object.entries(table)` is the union `"PriceTable" | Record<...> | Money`. The key does not exist at run time, so only the type is wrong. Writing the value type, as `Object.entries<Money>(table)`, removes it (`Object.keys` returns `string[]`, so it is unaffected)

## 8.2 Dates

```ts
export type IsoDate = Val<"IsoDate", string>;

export const IsoDate = Val.companion<IsoDate>()
  .implSeal((s: string, seal) => {
    /* validate */
  })
  .impl({
    toTemporal(d) {
      return Temporal.Instant.from(d);
    },
  });
```

This demonstrates the core feature, a brand plus a smart constructor. The README uses it as its main example.

## 8.3 Using a schema library alongside

With validation in the seal, both the update path (`patch`) and the creation path (`create`) go through it (§6.2 / §6.8). The seal may take anything up to `object`. `SealImpl<V>` only requires that the seal **can accept** the payload. `unknown` fails, because it also accepts `string` (§6.7).

```ts
export const User = Val.companion<User>()
  .implSeal((input: object, seal): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(seal(r.data)) : err(r.error.message);
  })
  .impl({ greet(u) { … } });
```

This is where valof differs from zod's `.brand()`. zod checks once, at parse time, and a value derived from the result, such as `{ ...user, name: "" }`, keeps the branded type without being checked again. valof's `patch` goes through the seal again. **The README does not spell out this comparison.** It goes too far into detail, so the README gets one line ("the schema runs on every derived value"), and the comparison goes to a promotional article.

**Decoding the wire format does not go in the seal.** `CheckedSeal` rejects `seal(json: string)` (§6.7). Parse the format in a separate function before the seal.

```ts
export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

A type whose values always arrive already validated registers no custom seal, and lifts the value with `Val.of` at the boundary (§6.5). Its `patch` then rebuilds by copying and validates nothing again.

**Only a path whose two ends ship in the same deployment can be trusted**: RSC / Server Functions, JSON-RPC between processes of the same app, and Electron's IPC between chromium and node. What separates trusted from untrusted is not the owner but **time**.

**Do not trust database rows. Corrected 2026-09-09.** This used to list "decoders, database rows". Even a row your own app wrote may have been written by an older version. Rows outlive code, so the persistence layer always validates.

## 8.4 Fields to keep out of the update path

An ID generated in the constructor, `createdAt`, a version number. `create` generates them, the seal seals them, and `Unpatchable` (§6.12) excludes them from the update path.

```ts
type Fields = Omit<SeedOf<User>, "id">;

export const User = Val.companion<User, [Unpatchable<"id">]>()
  .implSeal((u, seal) => seal(normalize(u)))
  .implCreate((f: Fields): SeedOf<User> => ({ id: crypto.randomUUID(), ...f }));

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
```

`seal` takes the whole payload, so the caller can write the `id` themselves. Adding `PrivateSeal` removes `seal` from the type (§6.12), and `create` becomes the only way to build a `User`.

**This is still not private.** `user.id` is readable, `readonly` disappears at run time, and `Val.of<User>({ id: "forged", … })` forges a value. All this buys is that the normal update path cannot change `id`. To prevent forgery too, keep `id` outside the value.

## 8.5 Framework state containers, measured 2026-09-09

**Conclusion: React / Solid can hold a plain value as is. Svelte / Vue need a shallow container (`$state.raw` /
`shallowRef`).** The table is in README §Framework state.

The danger is not the deep proxy itself but that **dev does not reproduce it**. The dev freeze (§7.1) changes the behavior.

Measured with svelte 5.57.0 / vue 3.5.42 / solid-js 1.9.15 (`dist/index.mjs`, under both `NODE_ENV` values).

|                               | dev (with freeze)                                 | production (no freeze)                       |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------- |
| Vue `ref(v)`                  | **no proxy**. `ref.value === v`                   | deep proxy. `ref.value !== v`                |
| Vue write through `ref`       | `TypeError`                                       | succeeds. **The original value changes**     |
| Svelte `$state`               | proxies the top level only, skips frozen children | proxies every node                           |
| Svelte write through `$state` | `TypeError` (proxy invariant)                     | succeeds. The original value is intact       |
| Solid `createSignal`          | the value as is                                   | the value as is                              |
| Solid `createStore` children  | proxy                                             | proxy                                        |
| Solid `setStore` / `produce`  | **no exception**, the original value is intact    | **no exception**. The original value changes |

- Vue does not make a frozen object reactive, so in dev `ref` looks the same as `shallowRef`.
  Tests and development both pass, and the deep proxy appears only in the production build
- Solid's store throws in neither build. It breaks most silently of the three. The initial
  assumption that `produce` would fail under the dev freeze was wrong
- Passing a value taken out of `$state` back to `patch` loses structural sharing in production (the proxy
  returns a different object, not a node valof owns, so valof copies it again). In dev the frozen children are skipped,
  so their identity survives. Here too dev and production disagree

**A trap when measuring.** Node resolves the `node` condition of `solid-js`, so a bare import
measures the non-reactive SSR build (no proxies, and writes pass straight through). It needs `node --conditions=browser`.
`--conditions=development` selects Solid's build. It is independent of `NODE_ENV`, which decides valof's freeze.

## 8.6 Integers beyond 2^53

This replaces bigint, which §7.8 removed. As in §8.2, wrap a string and enforce its form in the seal.

```ts
export type BigInteger = Val<"BigInteger", string>;

export const BigInteger = Val.companion<BigInteger>()
  .implSeal((n: string | bigint, seal) => {
    const s = String(n);
    if (!/^(0|-?[1-9]\d*)$/.test(s)) throw new RangeError(`not an integer: ${s}`);
    return seal(s);
  })
  .impl(() => ({
    add(a, b: BigInteger): BigInteger {
      return BigInteger.seal(BigInt(a) + BigInt(b));
    },
    compare(a, b: BigInteger): -1 | 0 | 1 {
      const x = BigInt(a);
      const y = BigInt(b);
      return x < y ? -1 : x > y ? 1 : 0;
    },
  }))
  .build();

BigInteger.add(BigInteger.seal(1n), BigInteger.seal("9007199254740993"));
```

- A regular expression checks the canonical form. `BigInt("010")` returns 10, so passing the string to `BigInt()` cannot reject `"010"`
- Compare with `compare`. The string `<` makes `"10" < "9"` true
- Widening the seal's argument to `string | bigint` lets a member pass the result of an operation straight to the seal. The payload is `string`, so the upper limit in §6.7 does not apply
