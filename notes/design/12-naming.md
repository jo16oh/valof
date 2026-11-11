# 12. Naming

## 12.1 Package name: `valof`

**Why it was adopted:**

- **The association with `valueOf` is accurate.** Java/Kotlin's `Integer.valueOf()` is the idiom for building a value from a raw representation, nearly a synonym for smart constructor
- **It fits FP's `of` too.** `Array.of` / the applicative `of` lift a raw value into a type. That is exactly `Val.of`
- **The package name appears in the API.** `import { Val } from "valof"` → `Val.of(...)`
- **One pronunciation.** It can only be read as "val-of". `valob` / `valobe` had no settled reading and were hard to say aloud

**Known weaknesses:**

- Search engines auto-correct it to `valueOf`. This was judged acceptable, since clicking "search instead for" avoids it
- One typo away from `valor` (already taken on npm). With one letter different, a different package installs without warning
- The naming centres on `Val.companion`, but `valof` comes from `Val.of`. Read as the general idea "value of", it is consistent

**Trademark search** (based on web searches, not a formal clearance):

- No exact match for "VALOF" found
- Near: **VALOFE Co., Ltd.** (a Korean game developer and publisher in Seoul, 364 employees, founded 2007. It filed and registered VFUN in the US in 2019, and runs `forums.valofe.com`). One letter different and in software, so the trademark classes may overlap
- The audiences are entirely different, and **free OSS hardly counts as commercial use**, so the practical risk was judged low
- The other near words (VALOU = jewellery, VALOIE = cosmetics, VALO = game controllers, VALUT = vodka, VALFLEUR = wine) are all in unrelated classes
- **Revisit before commercializing or incorporating**

**Rejected candidates:** `valob` / `valobe` (no settled reading), `valcase` (clear but sounds weak), `valeur` (an everyday French word, hard to search for), `valcom` (how it sounds), the scoped `@user/val` (hard to discover)

## 12.2 Type name: `Val`

**Kept.** It is short, so the declaration `Val<"User", {...}>` adds no noise. Using one name for both the type and the namespace (the `Val` type + `Val.of` / `Val.companion`) is also idiomatic TypeScript.

The concern that "Kotlin/Scala's `val` means immutability of the binding (TypeScript's `const`), not of the value, so the analogy is off" was rejected. TypeScript programmers know that `const` means no reassignment, so there is little room for confusion. Even a confused reader stops at "why do I need a library when I have `const`?", so the README's opening clears up the misunderstanding by itself. A note about it would give the reader a concern they did not have.

A known weakness is that `Val` is a common three-letter word, so it easily collides with local identifiers. Until it is as well known as `_` (lodash) or `z` (zod), some users may have to work around it with `import { Val as V }`.

**Rejected candidates:** `Value` (accurate, but long, and collides worse), `Vo` (cryptic), `Nominal` (does not feel like a value object), `Data` (clashes with Effect)
