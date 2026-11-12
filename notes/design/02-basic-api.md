# 2. Basic API

```ts
export type User = Val<
  "app/User",
  {
    id: string;
    name: string;
  }
>;

export const User = Val.companion<User>().impl({
  greet(u: User) {
    console.log(`Hi, I'm ${u.name}.`);
  },
});

const user = User.seal({ id: "a", name: "bob" });
User.greet(user);
```

`Val.companion<V>()` is the companion. `.seal` is the only entry point for creating a value, and `.impl({...})` attaches behavior (§6.12). It takes two steps because TS has no partial inference of type arguments (§13.1).

## 2.1 Brand

**2026-10-26: the keys are now symbols (see "Back to symbol keys" below).** The rest is the record from that time.

The library holds a fixed phantom string key internally, and its value is a string literal.

```ts
type Val<K extends string, T> = DeepReadonly<T> & {
  readonly __valof_internal_phantom_brand: K;
  readonly __valof_internal_phantom_payload: T;
};
```

`__valof_internal_phantom_payload` exists only to recover the payload type `T`. Without it, a Val that wraps a primitive, such as `Val<"IsoDate", string>`, gives no way to derive the constructor's argument type (`Omit` does not work on primitives). Neither key exists at runtime.

- The discriminant is a string literal, so no type needs its own `declare const XxxBrand: unique symbol`
- Collisions happen only between identical strings. **The brand matches the type name** (valof-lint checks it, §14.12). Only when one name is needed in two places, as with `Id` in a monorepo, add a namespace, as in `"billing/Id"`

Rejected: letting the user choose between symbol and string. It only grows the API surface, and the hybrid above already has the advantages of both.

### Why `unique symbol` was dropped

The key was originally a private `unique symbol`. It had a fatal flaw. **A library that uses valof cannot build with `declaration: true`**.

```
error TS4023: Exported variable 'User' has or is using name '__brand'
from external module ".../valof/dist/index" but cannot be named.
```

It happens in exactly the intended use: re-exporting `export const User = Val.sealer<User>().impl({...})`. Exporting the symbol does not fix it. TypeScript requires the name to be in scope in the file that emits the declaration, so the user ends up writing `import { __brand, __payload }`.

The brand does not exist at runtime anyway, so collision resistance comes from **the length of the name**, not from being a symbol. Nobody uses a property name that starts with `__valof_internal_phantom_`. The name contains `phantom` so that someone who meets this key in a hover or an error message does not go looking for it at runtime.

The cost is that the string key shows up in `keyof Val<...>`. Where only the payload keys are wanted, use `PayloadOf<V>` / `SeedOf<V>` (`patch` already goes through them).

### 2026-10-26: back to symbol keys

**Every library key is now a symbol.** String keys show up in editor completion. The keys, except `Tag`, live in
`src/keys.ts`, and the entry does not export them. `Tag` lives in `enum.ts` and is exported from `valof`
(from `valof/experimental` until 2026-10-27).

- `Tag`, `Traits` and `Shared`, which the runtime reads, are `Symbol()`
- The keys that exist only in types (those held by `Rec`, `Unsealed` and `CallBuildFirst`) and the keys of phantom class members are
  `declare const …: unique symbol`. A private phantom key does not show up in completion even as a string (confirmed in the TS 5.9
  language service). They became symbols anyway so that, once the reservation is lifted, they cannot
  collide with users' field names
- Dropped the reserved `__valof_` prefix in three places: the `.impl` type, Variant names and valof-lint

**The TS4023 from "Why `unique symbol` was dropped" does not occur where a type is emitted by name.** Back then,
the type of the companion that `Val.sealer().impl()` returns was emitted expanded. Now it is emitted by name, as `Companion<…>` or
`EnumCompanion<…>`, and the expansion does not reach the keys. Phantom keys are private / protected class
members, so they are emitted under the class name.

- Writing a symbol key directly in an anonymous type makes that type emit expanded, which gives TS4023. It happened in the Variant slot
  (`Shape.Circle`), so `[Traits]` is wrapped in `TraitHost`. A ts-compatibility fixture checks it
- When a user passes a companion through `Omit` or a mapped type, it expands and gives TS4023. `Tag` works with a type-only import
  (`import { type Tag } from "valof"`). `Traits` is not exported, so there is no way to
  write it
- `IsRec` now excludes symbol index signatures. With symbol keys, a symbol index
  signature accepts every `unique symbol` key, so `Record<symbol, string>` would be misdetected as `Rec`

**Rejected: drop the phantom class and write symbol keys directly in an anonymous type.** TS drops private members on spread
but keeps symbol keys. `const c: User = { ...u }` compiles, which creates a Val without going through seal.
Exporting `(u) => ({ ...u, extra: 1 })` gives TS4023.

**Rejected: `Symbol.for("valof.traits")`.** With it, two copies of valof could read each other's records. Where the copies are different versions, they should not be able to. The shape of the records that `Traits` and `Shared` hold is not a contract between versions. The keys are not the only thing
that splits on duplication, either. Each copy has its own `owned` WeakSet, and passing a Val that the other copy created to `patch`
merges instead of replacing (§6.2). `Symbol()` gets no description string either. That would spend
bytes only for debug output.

Cost against main: Val production gzip 857 → 855 B, enum instantiations 32,956 → 32,988, `index.d.ts`
78.22 → 78.73 kB.

### Which boundary needs `declaration: true`

This is separate from "don't build a library" in the README Caveats. That one has a **runtime** reason. Companions are not tree-shaken and inflate the bundle, so it discourages using valof's companion machinery to implement a package distributed externally. The boundary here is **whether a Val type crosses a compilation unit that emits `.d.ts`**, regardless of whether anything is published to npm. It also happens with imports between packages inside a monorepo (the README's `billing/Id` example is exactly that).

Without the crossing, it does not occur. A setup that sees every package from source as one TS program, or one that only type-checks with `tsc --noEmit` and lets the bundler transpile, writes no `.d.ts`, so it gets no TS4023.

The deciding factor is whether you use TS Project References (`composite: true`). `composite: true` requires `declaration: true`, and tsc enforces it (confirmed).

```
tsconfig.json: error TS6304: Composite projects may not disable declaration emit.
```

Project References is the officially recommended TS pattern for faster incremental builds in a monorepo, and the more packages there are, the stronger the reason to adopt it. The deciding factor is not "it's a monorepo, so it's safe" but **whether that monorepo distributes types per package**.

### Rejected: make the value type non-serializable, 2026-09-09

After the rejection of `unique symbol`, the idea came back: "keep the key a string, but make the **value type** a function, so a boundary strips it?"
It works. It needs no `declare`, so it does not hit the declaration-emit wall in §2 either.

```ts
// When a boundary type transform drops function-valued properties, as superjson / tRPC do
{ readonly __brand: "User" }              // Survives the transform. A value that crossed the boundary is assignable as is
{ readonly __brand: (k: "User") => void } // Dropped. The assignment fails with TS2322
```

**Still not adopted. It works at few boundaries, and everyone pays the cost.**

| Boundary                   | Caught by types                       | Caught at runtime |
| -------------------------- | ------------------------------------- | ----------------- |
| Receiving `JSON.parse` raw | Yes, since it needs `any` / `as`      | No                |
| tRPC / superjson           | Yes, with a function type             | No                |
| Hono `hc`                  | **No, not even with a function type** | No                |
| `atomWithStorage<User>`    | No                                    | No                |
| RSC props                  | No                                    | No                |

It only works with libraries that apply a type transform. **RSC props get no transform on the type side** (the declared props type
flows through as is), so it does not work there, and the flight serializer at runtime cannot find a brand that does not exist at runtime.
The runtime column follows from the brand being phantom. It was not measured on real RSC.

**And "applies a transform" is not enough.** Measured with `hc` in hono 4.13.7, a string brand survives
as is, and a function-typed brand **keeps its key, with the value turned into `never`**. `never` is assignable to anything, so the assignment
still compiles with a function type. Only a transform that "drops the key entirely" works. The path that generates a typed client is, if anything,
the one most likely to let the brand through.

valof-lint cannot catch it either. It uses only oxc's parser and has no type information (§14.5), so it cannot see whether a generated client's return type is a Val.

**The fix is on the server's return type, not at the call site.** Declare the handler's response as `PayloadOf<V>`, and the generated
client carries no brand, so the receiving side cannot use the value without going through seal. A Val is the intersection of its payload and the brand,
so assigning it to a variable of the payload type drops the brand. No `as` is needed, the object stays the same, and nothing is copied.

```ts
const body: PayloadOf<User> = user; // drops only the type
return c.json(body);
```

Measured with hono 4.13.7. Returning the Val as is lets `const a: User = leaked` on the receiving side compile, and returning it as `PayloadOf<User>`
gives TS2322. **It does not depend on the framework's type transform**, so it no longer matters that Hono collapses the value to `never`, whether tRPC drops
the key, or that RSC applies no transform. Documented in README §Crossing a serialization boundary.

This is deliberately not `Val.unwrap`. That one also strips `readonly` and returns a mutable copy. Passing data to an API needs no
mutability. What was wanted was "a type-only unwrap that does not copy", and that already exists as `PayloadOf`.

**Brands of nested Vals are dropped too.** `PayloadOf` used to stop at nested Vals. The `total` of `PayloadOf<Order>`
reached the generated client still as `Money`, and `const m: Money = res.total` on the receiving side compiled.
Now nested Vals and `Rec` both open to their payloads.

The remaining hole is that forgetting the annotation on the server leaks the brand. Still, the discipline shrinks from "every call site of every framework" to
"one line per endpoint", and that line goes on the side where the seal is defined.

The costs:

- Hovers and errors change from `"User"` to `(k: "User") => void`. That runs against the intent of putting `phantom` in the key name (so nobody goes looking for it
  at runtime)
- A function type appears in the union of phantom keys that leaks into `Object.entries` in §8.1, right next to a type
  that says "a Val cannot hold functions"
- `BrandOf` has to go through `infer`

The gain is probabilistic, and the cost is certain. The trade-off comes out the same way it did for symbol.

**The axis is version, not trust.** What `seal` guarantees is "this value passed the checks of this code as it is now",
not "this input is not malicious". The line cannot be drawn as "trust the server, distrust the client". RSC is exempt
not because it comes from the server, but because the same code in the same deployment sealed it just before. An API server from a different deployment
is not an enemy, but its release cycle differs, so it belongs with localStorage. Conversely, `seal` is not a security boundary
either. It is only as strong as the checks written in it, and re-running it does not remove the `__proto__` and depth-limit issues.

**Beyond that, the reason to re-run `seal` at a boundary differs by boundary.** Responses from RSC or a server were sealed upstream,
and the payload survives the JSON round-trip, so re-sealing only restores ownership (§4.1: the next `patch` need not
re-copy the top node), and re-checking the invariants effectively finds nothing. Persistent data in localStorage or written by another version
is different. The writer does not know the current seal, so that data really does come in unchecked.

## Type naming conventions

`-Of` means "something projected out of a Val". `PayloadOf<V>` / `SeedOf<V>` take a Val. `Patch<T>` takes a payload type, so it has no suffix. The difference is deliberate. It is what lets a custom `patch` take a patch over a subset of the fields (to exclude a generated `id` from patching).

`Sealer` / `Sealed` / `Companion` / `CompanionBuilder` also take a Val, but they are shapes of the companion machinery, not something taken out of a value, so they have no suffix.

The brand is a phantom type and **does not exist at runtime**. This fact is the basis for the constraints in §5 and §7.6.

## 2.2 `Val.of`

**The default seal, called with an explicit type.** Branding and deep-copying appear in three places. They differ only in where the type comes from.

|                                | Where the type comes from               |
| ------------------------------ | --------------------------------------- |
| The `Val.sealer<V>()` callable | The sealer holds it                     |
| `implSeal`'s second argument   | Bound to the registered type (§6.8)     |
| `Val.of<V>(x)`                 | The caller writes it as a type argument |

```ts
Val.of<User>({ id: "a", name: "alice" });
```

So `Val.of` is not "a function that bypasses seal". For a type without a custom seal, it is the proper constructor, and lifting a value at a boundary (§8.3) is the intended design too. Only on a type with a custom seal does it end up "sealing with the default seal instead of the type's own", that is, skipping the checks. **It is an escape hatch, but being one is not what defines it.**

This framing matters for the package name too. `valof` refers not to an escape hatch but to "the operation that creates a value" itself. Renaming it to `Val.lift` or similar would only lose the advantage §12 lists, "the package name shows up in the API", so it keeps its name.
