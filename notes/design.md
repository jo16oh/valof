# valof Design Memo

The design record of a value object library for TypeScript.

- **Package name**: `valof`
- **Main export**: `Val` (type + namespace)

```ts
import { Val } from "valof";
```

## Contents

Each section reads on its own. Open only the ones you need.

- **§1 Design philosophy** "Values are plain data. Behavior lives outside them." The basis for every other decision. The per-call cost of making members dual
- **§2 Basic API** `Val.companion` / `.seal` / `.impl`. 2.1 why the brand is a phantom string (the record of rejecting symbol and a function type that a boundary strips; the key went back to symbol on 2026-10-26), 2.2 `Val.of` is not an escape hatch
- **§3 Allowed types** Primitive / Val / ReadonlyArray / Record only. Why a payload does not use `readonly`, 3.5 why `undefined` is forbidden as a value, and the EOPT wall, 3.6 why unions of objects are forbidden, 3.7 self-reference with `Rec`
- **§4 DeepReadonly**
  - **4.1** Why the constructor copies its argument by default, and the explicit `.nocopy`. Neither types nor lint can close the gap (no linear types), ownership tracking (WeakSet, registering every node), the rejected symbol-key mark, diamonds and GC, the friction of `unwrap`, the type-checking speed benchmark
  - **4.2** Keep tuples. Optional elements and `Required<T>`, the limit of rest elements
  - **4.3** Open `Rec`. Detection by key, `undefined` on optional keys, why array detection moved to `keyof`
- **§5 Equality** A named `equals` that compares structure only. The principle of constructing in canonical form. The record of the withdrawn companion `equals`, `implEquals` and spec
- **§6 Smart constructors and updates**
  - **6.1** A constructor is determined by its origin / **6.2** `patch`, `undefined` in a patch, patch at any depth, merging only into nodes that already exist / **6.3** independent of Result / **6.4** remove `update`
  - **6.5** contextual typing that fixes `.impl`'s first parameter to the Val / **6.6** do not let `patch` be overridden
  - **6.7** separate seal (idempotent) from create (construction); seal returns synchronously / **6.8** make seal the only gate. Copies per path
  - **6.9** how the name became `seal` / **6.10** `fixed` (moved to the `Unpatchable` type argument on 2026-10-22, §6.12) and the excess property check / **6.11** make members dual, data-first / data-last. Telling the forms apart by argument count, forbidding optional parameters, in development, reading the source for the defaults and rest parameters that type annotations hide (2026-10-28), the wrapper for rest versions, why `dyn` is not wrapped, why data-last loses type arguments, the rejected `annotate`, the rejected namespace and placeholder
  - **6.12** unify the entry point on `.seal`. Dropping `sealer`, why no step hides seal, the type argument list (`PrivateSeal` and `Unpatchable`, a tuple rather than an intersection), the first and second halves of the chain, `impl` does not close the chain, `.build()` closes the chain (overturning §13.6), keeping the Proxy. The order of Enum steps is in §15.2
  - **6.13** `implAssoc`: members that do not take the Val. Why it is a separate step, what it is given, making it dual (overturning §6.11), why checking the arguments needs a return type annotation, the check that reads the source of length-0 functions (moved into §6.11's check on 2026-10-28), Trait associated functions kept out of `[Shared]`, adding `& A` to `build` breaks declaration emit, the remaining hole (write the check in `from*`), rejected ideas
- **§7 Deferred** freeze (adopted in dev only), Map/Set, Date/Temporal, TaggedEnum, Result, dispatching equals, putting the wiring target on `.impl`, bigint (removed on 2026-10-28, the rejected "keep it" option, the JSON round-trip hole that is not guaranteed)
- **§8 Idioms** Set/Map via Record, dates, using a schema library alongside, fields excluded from the update path, framework state containers (§8.5, not reproduced in dev), integers above 2^53 (§8.6, decimal integer strings)
- **§9 Open / to verify** The next work is here
- **§10 v1 scope** 10.1 supported TypeScript (the last release of each line onward, checking `dist` installed the way npm installs it, through `exports`, declaration round-trips)
- **§11 Where to surface type errors** The parameter position (A) and the verdict position (B, `Verdict`). A check that reads only type arguments goes in B; a check that reads the call site's state goes in A. Three bugs that placed the check in neither
- **§12 Naming** The package name `valof`, the type name `Val`, the trademark search
- **§13 Deciding the API shape** Six rejected designs before two-step currying (the builder in §13.6 was adopted on 2026-10-23)
- **§14 valof-lint** Companion members are invisible to static analysis. Choosing the parser, the decision to bundle it, the rejected ts-morph (§14.5), the rule for children with a custom equals (§14.7, withdrawn), how rules are expressed and organized (§14.8), editor integration (§14.9, implemented up to the overlay), the holes in the tests (§14.10), where the tests live (§14.11), a brand that does not match the type name (§14.12), a second name for a Val / Trait (§14.25), the rejected rule for a `Rec` that is not self-referencing (§14.26), `unused-member` and the names the types reject (§14.27, lint names tied to the types, the dropped `impl` prefix match), a companion that does not match the type name (§14.21), a companion in a different file from its type (§14.22), `Val.of` on a type with a companion (§14.23), `Val.of` without a type argument (§14.24), the spelling of `Val` (§14.13), missing disable comments (§14.14), ineffective disable comments (§14.15), file-wide disable (§14.16), rules that do not accept `--no-` (§14.17), how rules about directives are presented (§14.18), the oxlint version and the canonical config, the `no-unsafe-*` rules not added (§14.19), host integration tests over LSP (§14.20, withdrawn), syntactic tracking of Trait declarations, implementations and `dyn` (§15.1)
- **§15 v2 candidates**
  - **15.1 `Trait`** The `Final<F>` marker and a one-step `impl`, intersecting trait brands and a `|` removed by type arguments alone (the rejected tuple), the `Self` marker and the ban on returning it, `Self` only as the first parameter (2026-11-03, the dropped "report `Payload` in a member's parameters through the trait"), `Impl` (2026-11-04, separating the declaration's type from the value's type, the rejected marker interface), `dyn` (the equivalent of `Box<dyn Trait>`), the rejected WeakMap dispatch, demand and the rejected shape that lets `dyn` be dropped, the experimental subpath (the rejected per-feature subpath, removed on 2026-10-27), the callback form of `impl` (its argument is only the implemented finals, the rejected implementer-side companion), removing the form that passes a Trait as a type argument, Vals bring a shape too (the conflict check, stripping `readonly`, the declaration bundler and backticks)
  - **15.2 `Enum`** Revisiting §7.4. Declaring Variants in a record and deriving the union, deriving the brand, a custom tag name and `tag-mismatch`, `match` on the companion, the line between `match` and ts-pattern, the record of verifying the types (common fields, `match`'s type arguments, how `VariantOf` displays, the rejected return type argument, free-function `match` and record of Vals, implementing Traits, passing the tag name as `Tag<…>`, a top-level conditional type breaks declaration emit), what the implementation taught (where Fault lives, forbidding a single Variant, removing `then` in three places, CI for declaration emit, variance measurement and type cost), the per-Variant seal and the union's `seal` (splitting into two entry points (merged into one on 2026-10-21, §6.12), passing the builder as a callback, closing the chain with `impl`, the rejected value shape), making `seal`'s arguments exclusive, `[Tag].match` and `[Tag].key`, which branch on the tag alone (why the key is a string (a symbol since 2026-10-26, §2.1), rejected names), making `implVariant` a per-Variant chain, making Variant steps a frame, rejecting four ways to change how the tag name is passed, the form that does not pass the companion (sharing val.ts's gate, distributing `PayloadKeys`, tests for both entry points), `.impl` cannot take a Trait member's name (the rejected per-Variant override), `_` in `match` (a conditional type rather than a union, the rejected key name `default`, third argument and overloads), building with a single chain (2026-10-24, removing `implVariant` and the seal layer, the enum's `implSeal` and `implCreate` as entry points to `Shape.seal`, why the enum's steps come last, why the tag is not checked at runtime, per-variant traits, the `VariantOptions` type argument, the `.tag` step, reserved names), dropping reserved names (2026-10-26, callable slots, `Otherwise`, revisiting where `match` lives, not guarding `__proto__` either)
  - **15.3 `path`** Composing patches across seals. The decision to put `abort` on the composing side, why the handler is the last step (HKT), `glue`'s `open` / `close`, `each` / `where`, the rejected `deepPatch`
  - **15.4 Callback form of `.impl`** Referencing its own companion breaks inference (TS7022). Measuring that contextual typing works through a callback, `implTrait` takes a callback too, budgets, the rejected currying of members and the idea of blocking downstream `.impl` with types. **The chain closed on 2026-09-18** (`impl` stopped closing it on 2026-10-21, §6.12) (only once, siblings called through annotations, naming the receiver of a Trait implementation `Tr`, the rejected type-level guidance and lint rule). **On 2026-10-26, every step argument became a function** (the annotation tax does not change)
- **§16 Budget responsibilities** Splitting bundle and type budgets into separate scripts. Moving declaration bytes to type-perf, why the budget went up to 64 kB, 16.1 measuring the bundle increment from the measured core, 16.2 the production check compares sizes, 16.3 trimming Enum's production gzip (shared steps, the rejected +512 B budget)
- **§17 Effect v4 investigation** The typeclass and HKT layers Effect dropped (the basis for §15.3), placing equality inside the value, the hole that structural comparison of classes opens, what Effect has and valof does not
- **§18 Distribution shape** Making `Val` / `Enum` / `Trait` namespaces so tree shaking drops unused members. Exporting under the same name as the type, why tsc emits the runtime entry file by file (Rolldown's `__exportAll` and type names in `.d.ts`), the bundle-size base, raising the declaration budget to 96 kB. The rejected `.ts` distribution and `.d.ts` minification. 18.4 the `internal/*` that consumers' declaration emit references (the rejected export from the entry, `PrivateSeal` / `PrivateCreate` made into classes), 18.5 keeping declaration emit from cutting types to `any` (builders printed by name, the decision to keep TypeScript 7.1 out of the ts-compatibility lines)
- **§19 Pinning the valof the scripts use** Pointing `#valof` at a commit's build. How a match is detected, requiring a match only on the release PR, ts-compatibility copying the scripts and reading them, why the hash goes in `package.json` (`optimisticRepeatInstall`), the rejected git dependency, pkg.pr.new and reading in place. The dual members and lint issues found while updating the scripts

---

## 1. Design philosophy

> **Values are plain data. Behavior lives outside them.**

Every design decision follows from this one line.

Restricting values to plain objects, arrays and primitives guarantees the following.

- They pass through `structuredClone`
- They round-trip symmetrically through `JSON.stringify` / `JSON.parse`
- They fit directly in React state or a Redux store
- Immutable updates do not lose the prototype
- The brand is a phantom type, so it leaves no cost and no trace at runtime

The constructor deep-copies its argument by default (§4.1). This is not zero-cost. It is the minimum price for making "values are data" hold at runtime too. `.nocopy` can remove it, only where ownership can be confirmed separately.

Companion members are dual, data-first / data-last (§6.11). Values have no methods, so this is what lets you write `pipe(u, User.rename("x"))`. Each call pays a few ns. Unlike the copy, this price buys ergonomics, not correctness.

A class gives none of these. §7 collects what was given up to keep this principle.

---

## 2. Basic API

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

### 2.1 Brand

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

#### Why `unique symbol` was dropped

The key was originally a private `unique symbol`. It had a fatal flaw. **A library that uses valof cannot build with `declaration: true`**.

```
error TS4023: Exported variable 'User' has or is using name '__brand'
from external module ".../valof/dist/index" but cannot be named.
```

It happens in exactly the intended use: re-exporting `export const User = Val.sealer<User>().impl({...})`. Exporting the symbol does not fix it. TypeScript requires the name to be in scope in the file that emits the declaration, so the user ends up writing `import { __brand, __payload }`.

The brand does not exist at runtime anyway, so collision resistance comes from **the length of the name**, not from being a symbol. Nobody uses a property name that starts with `__valof_internal_phantom_`. The name contains `phantom` so that someone who meets this key in a hover or an error message does not go looking for it at runtime.

The cost is that the string key shows up in `keyof Val<...>`. Where only the payload keys are wanted, use `PayloadOf<V>` / `SeedOf<V>` (`patch` already goes through them).

#### 2026-10-26: back to symbol keys

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

#### Which boundary needs `declaration: true`

This is separate from "don't build a library" in the README Caveats. That one has a **runtime** reason. Companions are not tree-shaken and inflate the bundle, so it discourages using valof's companion machinery to implement a package distributed externally. The boundary here is **whether a Val type crosses a compilation unit that emits `.d.ts`**, regardless of whether anything is published to npm. It also happens with imports between packages inside a monorepo (the README's `billing/Id` example is exactly that).

Without the crossing, it does not occur. A setup that sees every package from source as one TS program, or one that only type-checks with `tsc --noEmit` and lets the bundler transpile, writes no `.d.ts`, so it gets no TS4023.

The deciding factor is whether you use TS Project References (`composite: true`). `composite: true` requires `declaration: true`, and tsc enforces it (confirmed).

```
tsconfig.json: error TS6304: Composite projects may not disable declaration emit.
```

Project References is the officially recommended TS pattern for faster incremental builds in a monorepo, and the more packages there are, the stronger the reason to adopt it. The deciding factor is not "it's a monorepo, so it's safe" but **whether that monorepo distributes types per package**.

#### Rejected: make the value type non-serializable, 2026-09-09

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

### Type naming conventions

`-Of` means "something projected out of a Val". `PayloadOf<V>` / `SeedOf<V>` take a Val. `Patch<T>` takes a payload type, so it has no suffix. The difference is deliberate. It is what lets a custom `patch` take a patch over a subset of the fields (to exclude a generated `id` from patching).

`Sealer` / `Sealed` / `Companion` / `CompanionBuilder` also take a Val, but they are shapes of the companion machinery, not something taken out of a value, so they have no suffix.

The brand is a phantom type and **does not exist at runtime**. This fact is the basis for the constraints in §5 and §7.6.

### 2.2 `Val.of`

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

---

## 3. Allowed types

The constructor and `Val.of` accept only the following types.

```ts
type Primitive = string | number | boolean;
```

`undefined` is not allowed as a value (§3.5). Neither is `bigint` (§7.8).
`null` is allowed inside objects and arrays but not at the top level (§9), because its intersection with the brand
is `never`, so it cannot be told apart as a distinct Val.

**Plain nested objects are forbidden. Nesting must always be a Val.**

### Why this restriction

1. **Lower inference cost.** The DeepReadonly recursion stops after one level (children are already readonly Vals). Conditional types stay shallow, so `tsc` stays fast
2. **Structural equality is well-defined.** There are no prototypes or cycles to consider
3. **Values always pass serialization boundaries.** `structuredClone` / JSON are always safe
4. **It pushes the design the right way.** Composing Vals is mandatory, which leads to a sound DDD-style structure

`ReadonlyArray` and `Record` are defined recursively. Without that, `readonly string[][]` (matrices, grids) and `Readonly<Record<string, Val>>` (ID indexes) could not be written. Each node is shallow, so the recursion does not make the cost blow up.

### Do not write `readonly` in a payload

`Val<K, T>` is `DeepReadonly<Checked<T>>`, so a payload written as mutable becomes readonly too, whether it is an array, a tuple or an object. So does `SeedOf`, and so do `Patch` (via `Derivable`) and `EqImpl`, which build on it. The API is the same whether the payload writes `readonly` or not.

**Writing it costs you.** `Val.unwrap` returns `PayloadOf<V>`, which is the type as written.

```ts
type R = Val<"R", { tags: readonly string[] }>;
Val.unwrap(v).tags.sort(); // ✗ readonly string[] has no sort
```

The purpose of unwrap, "a mutable copy to pass to code that does not know about readonly", is defeated by the `readonly` in the definition. The docs used to recommend `ReadonlyArray` / `Readonly<Record>` in both the allowed-types table and the examples, so both now use the plain form.

### Migration friction

Plain nested objects from API responses or existing code cannot be passed as is. The seal has to assemble the child Vals.

### Wrapping primitives directly

```ts
export type IsoDate = Val<"IsoDate", string>;
```

An important use case (§8.2).

### 3.5 `null` and `undefined`

|                        | Verdict                                         |
| ---------------------- | ----------------------------------------------- |
| Nested `null`          | Allowed                                         |
| Top-level `null`       | **Forbidden**                                   |
| `?` (absent key)       | Allowed                                         |
| `undefined` as a value | **Forbidden**                                   |
| `undefined` in a patch | Reserved to mean **delete the property** (§6.2) |

#### Why "no `undefined` as a value" rather than "no `undefined`"

Only "the key exists but its value is `undefined`" breaks.

```ts
JSON.parse(JSON.stringify({ a: undefined })); // {}: the key disappears
structuredClone({ a: undefined }); // { a: undefined }: the key stays
```

The two serialization paths disagree. That is the real reason to forbid it.

Optional properties themselves are harmless. If the key does not exist, `JSON.stringify` does not emit it, and after `parse` the key still does not exist. `structuredClone` behaves the same, so the round trip is symmetric.

In TS, `?` is by far the most idiomatic form, so forbidding optional properties outright and forcing `nickname: string | null` is not acceptable. So an absent key is fine, and `undefined` as a value is forbidden.

#### Checking with types

Optional keys can be detected.

```ts
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
```

`-?` is needed to keep `undefined` out of the mapped value type.

`Validate` uses it to strip `undefined` from the optional keys only, then checks.

```ts
type Invalid<Msg extends string> = { readonly __valError: Msg };

type Validate<T> = [T] extends [Primitive]
  ? T
  : [T] extends [AnyVal]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? ReadonlyArray<Validate<E>>
      : [T] extends [Function]
        ? Invalid<"functions are not allowed">
        : [T] extends [object]
          ? {
              [K in keyof T]: K extends OptionalKeys<T>
                ? Validate<Exclude<T[K], undefined>> | undefined
                : undefined extends T[K]
                  ? Invalid<"required property cannot be undefined; use null or make it optional">
                  : Validate<T[K]>;
            }
          : Invalid<"not a plain value">;
```

The non-distributive form `[T] extends [X]` checks a union such as `string | null` as a whole. This rejects `Val<"User", { nickname: string | undefined }>`.

#### A type alias cannot have a self-referencing constraint

The original plan was a self-referencing constraint, `T extends Validate<T>`, to "raise the error at the type definition". On a type alias, that gives **TS2313 "Type parameter 'T' has a circular constraint"** (a generic function's type parameter can have one, but `Val` is a type alias). A conditional type runs the same check instead.

```ts
type Val<K extends string, T> = [T] extends [Validate<T>]
  ? DeepReadonly<T> & Brand<K>
  : Validate<T>;
```

On a violation, it resolves to a `Validate<T>` that contains `Invalid<Msg>`. That does not satisfy `AnyVal`, so passing it to `Val.of` / `Val.sealer` / `Val.companion` is an error.

```
Property '[__brand]' is missing in type
  '{ nickname: Invalid<"required property cannot be undefined; use null or make it optional"> }'
but required in type 'AnyVal'.
```

**The error moves back from the type definition to the first use.** The message comes out as intended. The check applies once, from `Val<K, T>`, so the inference cost advantage holds.

**2026-11-04: report on the type definition line too.** `Val<K, T extends ValidateFields<T>, Tr>`. `ValidateFields` is the object branch of `ValidateValue` extracted as a mapped type, and it is the same constraint as `Payload`'s (§9 "Add the payload rule checks to `Payload`"). A mapped type does not give TS2313. A Val that references itself through `Rec` does not cycle either (TypeScript 5.9.3 / 7.0.2). The conditional type above (the verdict) stays.

- **What the type definition line does not catch.** ~~Root `null`, `bigint`, `symbol`, functions, numeric keys, unions of valid objects.~~ → The top level is now reported on the type definition line too (`Allowed` below). Only conflicts with a trait remain. The constraint reads only `T`
- **`Allowed<T, Owner>`, 2026-11-04.** The constraint of `Val` and `Payload`. Given a whole Val as a type argument, it returns a dedicated `Invalid`. If `Validate<T>` returns an `Invalid` at the top level, it returns that. If it returns `Refused` (a `Payload` whose top level was refused, that is, an `Invalid` itself), it returns `Refused`. With `Invalid` as the constraint, an `Invalid` type argument would satisfy it. The rest goes through `ValidateFields<T>`, field by field (the message names the field)
  - **Reading `Validate<T>` inside a conditional type does not cycle.** `T extends Validate<T>` is TS2313, but using the result of `[Validate<T>] extends [Invalid<infer M>] ? … : …` as the constraint does not cycle (TypeScript 5.9.3 / 7.0.2). §9 left this out because "it would hold the root rules twice", but reading `Validate` directly does not duplicate them
  - **A whole Val as a type argument is refused.** `Val<"UserId", Id>` was already `never` on main, with two brands colliding. `Payload<User>` takes out the shape the way `PayloadOf<User>` does, but it makes the dependency run Val ← Payload. Define the common shape first with `Payload<T>` and use it in the Val (Payload ← Val). The wording is the user's (on the `Payload` side, the subject is `a Payload's`): `a Val cannot be used as {another Val's | a Payload's} type. Define common shape using \`Payload<T>\`, and use it in Val's declaration.`
  - **No branch for `Rec`.** `Val<"Top", Rec<Other>>` passes without one (confirmed by a test-audit mutation). A self-referencing `Val<"Self", Rec<Self>>` is TS2456 with or without the branch
  - **What leaked when the constraint was `ValidateFields` alone.** Passing a whole primitive or array Val made `ValidateFields` map the Val type itself, which gave a confusing TS2344. An object Val passed through and became `never`
- **A Val whose payload contains a type parameter cannot be written.** `type Page<T> = Val<"Page", { items: T[] }>` is TS2344. `Val<K, string>`, with only the brand as a type parameter, passes. `Page<User>` and `Page<Post>` sharing one brand goes against nominal typing, so rejecting it is fine. `type Branded<K, T> = Val<K, T>` (§14.7) can no longer be written either
- **Enum Variants are not constrained.** `Enum` and `VariantOf` build the Variant Vals generically, so they use `UncheckedVal`, which has no constraint. Hovers and error output still print `Val<…>` / `VariantOf<…>`. Reporting a Variant's payload on the Enum declaration line has not been started
- **Breaking change.** Vals whose payload contains a type parameter, and code that declares a payload that breaks the rules without using it
- **Cost.** Instantiations core +249, trait +223, enum +145, `index.d.ts` +0.91 kB (mostly JSDoc; TypeScript 5.9.3, against #123). Of that, `Allowed` accounts for core +194, trait +171, enum +102 and +0.26 kB

#### The `exactOptionalPropertyTypes` wall

With EOPT **off** (the TS default), `{ a?: string }` and `{ a?: string | undefined }` are literally the same type, and the language has no way to tell them apart. So the following cannot be detected.

```ts
const raw: { nickname?: string } = { nickname: undefined }; // legal with EOPT:false
User(raw); // passes the type check. The key exists and its value is undefined
```

With EOPT on, `Record<K, undefined> extends Pick<T, K>` can detect it. Enabling it can produce many errors in existing code, so **it is not required**.

When freeze was cut (§7.1), the argument was "breaking it needs `as any`". This one **leaks from ordinary code with no cast**. So this guarantee is weaker.

#### Defuse it in two layers

1. Remove `undefined` from `Primitive`
2. Add the `Validate` above
3. **Strongly recommend EOPT: true** in the README, without requiring it
4. `patch` reads an `undefined` key in a patch as deletion and drops it after the merge (§6.2)
5. **The default deep equals ignores keys whose value is `undefined`** (§5)

Item 5 does the work. If `{ a: undefined }` and `{}` are equal, the disagreement between the two serialization paths **can no longer be observed**. The runtime cost is almost zero, and it comes along with the implementation that makes the comparison independent of key order.

Types prevent most of it, and equals defuses the rest. This balances adoption cost and guarantees better than requiring EOPT to close the gap fully in types.

#### Interop friction

`undefined` comes from many places in TS (`Array.prototype.find`, `Map.get`, index access with `noUncheckedIndexedAccess` on, OpenAPI/GraphQL codegen, form libraries, destructuring defaults). More places need a `?? null` before passing to seal.

That is **exactly where a smart constructor should normalize**, consistent with §5's principle of "construct in canonical form". The README states it as the message "normalize at the boundary".

#### A side benefit

`undefined` cannot exist as a value, so `undefined` in a `patch`'s patch **can serve as a deletion sentinel** (§6.2).

```ts
User.patch(user, { nickname: undefined }); // deletes nickname
```

If both `null` and `undefined` were allowed as values, this sentinel would not work. A dedicated sentinel would be needed to tell "set it to `null`" from "delete it".

In this library, updating a value always creates a new object, so "assign `undefined` to a property" never happens in the first place. Removing `undefined` from the value space loses no expressiveness.

Likewise, deep equals never faces the awkward question of whether `{ a: undefined }` equals `{}`.

### 3.6 Forbid unions of objects

`patch` merges into the node that already exists. With a different variant, there is nothing to merge into, and the old variant's keys remain.

```ts
type State = Val<
  "State",
  { kind: "loading"; startedAt: number } | { kind: "loaded"; value: string }
>;

State.patch(loading, { kind: "loaded", value: "ok" });
// { kind: "loaded", value: "ok", startedAt: 1 }
```

The object branch of `Validate` rejects the union. Unions of primitives (`"a" | "b"`, `string | null`, `boolean`) pass as is.

```ts
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;
```

The `[T] extends [Primitive]` branch comes first, so `boolean` (= `true | false`) is not caught. The check applies at every level as a consequence of `Validate`'s recursion. Checking only the root would leave the same hole in nested values.

Only unions of objects used to pass. `Point | null` and `string | Point` do not satisfy `[T] extends [object]`, and they already failed with `Invalid<"not a plain value">`. Unions of arrays still pass through the array branch, but arrays are replaced whole, so they leave no hole in `patch`.

Sum types go to `Enum`, not `Val` (§9).

### 3.7 Self-reference: `Rec`

You can write a `Tree` that holds a `Tree`. Insert a marker that appears only in the declaration.

```ts
export type Tree = Val<"app/Tree", { value: number; children: Rec<Tree>[] }>;
export type Node = Val<"app/Node", { value: number; next?: Rec<Node> }>;
```

**Not one line of runtime code changes.** Structural sharing produces a DAG, not a cycle (§4.1). A child exists before
its parent, so neither a tree nor a linked list can form a cycle without mutation. `copy` and `equals` both stop at nested Vals.
The only obstacle is the order in which type aliases resolve. A reference to an interface does not demand resolution, so `Rec` breaks the cycle there.

Without `Rec`, **the declaration compiles and the first use fails**, with TS2615 naming the cyclic property.
Arrays gave TS2589, but once `Validate` walked arrays with a mapped type, they gave TS2615 too (2026-11-03, §9).
Alias resolution itself got lighter with the verdict (§11.2), so the old TS2456 no longer appears.

`DeepReadonly` opens `Rec<V>` to `V` (§4.3), so **`Rec` is visible only on the declaration line**. It does not remain
in the value, the seed or `patch`. `PayloadOf` opens it too, but to `PayloadOf<Tree>`, not `Tree`
(as with nested Vals, §4.1 "Known friction"). Without that, the elements of the payload that `Val.unwrap` returns would stay
`Rec<Tree>` and be unreadable. `SeedOf` runs the declaration straight through `DeepReadonly`, so it does not walk it twice.

```ts
const leaf = Tree({ value: 1, children: [] });
const root = Tree({ value: 2, children: [leaf, leaf] });
root.children[0]; // Tree
```

Write the payload plain (§3). Writing `readonly Rec<Tree>[]` makes `Val.unwrap` return a readonly array.

Enum Variants are written the same way. `Enum<"Tree", { Leaf: …; Branch: { kids: Rec<Tree>[] } }>`
works through declaration, construction and `match`.

`Rec` alone was not enough. `Checked` and `Brand` compare the payload against its own image while the alias resolves,
so they need the type that is being resolved. The check moved to the type of a private field (§11.2).

| Shape                                 | Result |
| ------------------------------------- | ------ |
| `DeepReadonly<T> & Phantom<K, T>`     | Passes |
| `DeepReadonly<Validate<T>> & Phantom` | Passes |
| `DeepReadonly<Checked<T>> & Phantom`  | TS2456 |
| `DeepReadonly<Checked<T>> & Brand`    | TS2456 |

#### The type argument is unconstrained

`Rec<V extends AnyVal>` makes the constraint check force `V` to resolve, which brings back the cycle. So `Rec<number>` passes and
opens to `number`, and `Rec<Other>` (a `Rec` that is not self-referencing) opens to `Other`. **There is no need to block it.** The opened type is
identical to writing `number` or `Other`, so it does no harm (§14.26).

#### Rejected shapes

- **`interface Tree extends Val<"app/Tree", TreeShape> {}`** → TS2310. Getting the base members requires the type
  itself. The usual trick of breaking a cycle through an interface does not work here
- **Reusing the existing `Self`** → not possible. The deferral relies on **the marker carrying the name in a type argument**.
  `Self` has no type argument, so `Val` would build the self-reference inside its own definition, and the cycle would be
  `Val`'s definition itself, not `Tree`. Users who never write recursive types would be caught in it too
- **Recursing through the brand string** (`Rec<"app/Tree">` + declaration merging into a global registry) → not verified.
  Unneeded once `Rec<Tree>` worked. Making users write `declare module` is already too expensive

---

## 4. DeepReadonly

A type defined with `Val` is DeepReadonly. The restriction in §3 stops the recursion after one level, so the cost is low.

### 4.1 The constructor owns (copies) its argument by default

DeepReadonly is about types and disappears at runtime. If the caller keeps a mutable reference to the argument, the Val can be rewritten later.

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "mallory" without the copy
```

On the default path, this is not left as "the user's responsibility". Breaking it takes no `as` or other cast. Straightforward code breaks silently. If a value object can change behind your back, it is not a value object. So the constructors from `Val.of` / the sealer / `.impl()`, and `patch` / `create` going through the default seal, deep-copy their argument.

The payload is limited to primitives, arrays, plain objects and nested Vals, so the recursive copy needs no special cases. It does not use `structuredClone` (5 to 6 times slower than our own recursion).

A custom seal returns through the default seal, its second argument. A normal call copies there, and `.nocopy` adopts the payload at the same spot. **Ownership is taken in one place, the terminal seal** (§6.8).

**Measured cost** (Node 24 / M-series, fresh input every time, ns/op)

|                   | flat 3 keys | nested ~40 nodes | 1000 rows |
| ----------------- | ----------- | ---------------- | --------- |
| Return as is      | 2           | 4                | 14        |
| Deep copy         | 47          | 858              | 99,731    |
| `structuredClone` | 514         | 5,474            | 469,529   |

Under 1 μs for a reasonably sized value object. Packing 1000 rows into one Val costs 100 μs, but that cost is a sign to split it into nested Vals, which agrees with §4's policy that "recursion stops at a Val".

#### Neither types nor lint can close it

**TS has no linear or affine types.** There is no way to express "I took ownership of this argument", so whether the caller keeps a reference
is not written at the call site. How long `const raw` lives crosses function boundaries, so
valof-lint cannot see it either. Nobody checks a hand-written `[...arr]`, and forgetting it in one place becomes a silent aliasing
bug.

**The extra cost comes from not telling apart inputs that have no alias.** In `User({ id: "a", name: "bob" })`, nobody else holds that
object, so hand-written code would not copy it. valof pays 47 ns. The object is not in `owned`, so
the WeakSet does not help. It is a common call, and here the cost is pure waste.

#### Removing the copy with `.nocopy`, 2026-09-15

When a profile shows that the copy is the bottleneck, and only where the caller can confirm ownership of the payload, the terminal copy can be removed explicitly.

```ts
User.nocopy(readonlySeed);
Val.of.nocopy<User>(readonlySeed);
Dog.seal.nocopy(input);
Dog.create.nocopy(name);
```

The default stays copying. Forgetting `.nocopy` loses only time and allocations, not correctness. An opt-in `.copy` would instead let a forgotten call on external input connect the Val to a mutable alias. `patch` gets no `.nocopy`. It already shares unchanged owned nodes and copies only the external nodes that enter the changed path, so the gain does not justify another dangerous path.

`.nocopy` is a contract: "the terminal payload may be adopted as a Val without duplicating it". The caller, and the implementer of a custom seal / create that brings references into the payload, guarantee that the graph is stable plain data with no alias that can change it later. Deep readonly is no evidence of that. TS lets you assign a mutable object to a readonly view, and casts, wrong declarations, JavaScript, accessors and proxies remain.

Only the default sealer's `.nocopy` takes the argument type through a `const` type parameter and recursively rejects writable properties and mutable arrays. It accepts fresh literals, readonly objects / arrays / tuples and optional properties, and stops checking at nested Vals. This is a guardrail against misuse, not a proof of ownership. `Val.of.nocopy` and custom seals do not require this check, because the terminal payload does not always come directly from the call argument.

At runtime, the terminal step is one of two: copy or adopt. In development, adopt inspects the descriptors of the whole graph, rejects accessors, class instances and cycles, registers every node as owned, and freezes it. Production trusts the contract and records only the root's adoption, in O(1). The first time a later `patch` needs a copy, it walks the descendants to fill in the owned index and keeps the identity of unchanged subtrees. A custom seal and create each register a single implementation, and the public paths choose only between the terminal copy and adopt. Validation and normalization run the same either way.

**Measured against the normal sealer** (2026-09-15, commit `624619b4935bb27f1e07ad5a1779516a64f8a93d`, Node 24.21.0, M-series, `NODE_ENV=production`). Inputs are built beforehand to exclude construction time. Each case ran 9 samples in separate processes, twice, and the figures are the range of the two medians.

| payload                | Normal sealer | `.nocopy`  | Speedup        |
| ---------------------- | ------------- | ---------- | -------------- |
| flat 3 keys            | 115–116 ns    | 9.0–9.2 ns | 12.5–12.9x     |
| nested 40 nodes        | 4.28–4.29 μs  | 8.4–9.2 ns | 468–507x       |
| 1000 rows (1002 nodes) | 133–139 μs    | 9.2–9.7 ns | 14,300–14,500x |

The normal sealer's copy time and allocations grow with the size of the payload. Production `.nocopy` only records the root in a `WeakSet`, so in this measurement it took about 9 ns regardless of payload size.

Rejected names: `.noncopy` (reads as non-copyable), `.adopt` (does not show the cost it avoids), `unsafeSeal` (reads as bypassing validation too). `.nocopy` names exactly the mechanism it changes. No lint rule recommends `.nocopy` either. Judging ownership beyond fresh literals needs escape analysis across functions and aliases, and a suggestion based on readonly types would justify a dangerous optimization.

#### Ownership tracking: do not rebuild nodes we created

The nodes that `copy` creates are registered in a WeakSet, and returned as is the next time they are met. It is in `src/val.ts`.

**Every node is registered.** The ideas that narrow it with a threshold (interior, which registers only nodes that hold objects, and K=n, which registers subtrees of size n or more) set the threshold by copy time. That optimizes the wrong objective. React / Vue / Svelte compare identity, not copy time. With interior, changing just `user.name` copies `user.wallet` (a leaf Val holding only primitives) and changes its reference, so `React.memo(Wallet)` **re-renders on a change it does not even read**.

|                     | seal of flat 3 keys | Building a list of 200 Vals | Child identity |
| ------------------- | ------------------- | --------------------------- | -------------- |
| interior            | 57.7 ns (1.25x)     | 11.0us (1.12x)              | Changes        |
| Register every node | 145 ns (3.14x)      | **2346 ns (0.24x)**         | Kept           |

- +100 ns to build a small flat value. That is in the ns range, and the relative cost drops as the object grows
- Building a list of Vals is 4.7x faster. Each row registers in its own seal, and the parent can share it. Lists are also where React does most of its work
- One re-render costs μs to ms, far more than 100 ns

**It loses on speed for small flat values. We take that loss knowingly.**

Key implementation points:

- `deepCopy(owning)` is just built in two forms, owning and non-owning, and the public API does not change. `owning` is captured in a closure rather than passed as an argument, so its value cannot change under a copy in progress
- `Val.unwrap` runs the non-owning copy. Its contract is to return a mutable copy, so **it must neither share nodes nor become a node that gets shared**. Forgetting the latter means that re-sealing an unwrapped payload makes the value hold on to the caller's mutable object
- A miss only degrades to a copy, so even when the WeakSet is a different instance across realms, there is nothing to repair

7 tests: `patch` keeps the subtrees it does not touch, nodes from a patch are never adopted and always copied, `Val.unwrap` shares nothing, an unwrapped payload is not adopted when re-sealed, and `equals` gives the same answers.

**Bundle size: ownership tracking costs +48 B of production gzip.** The `implEquals` spec (§5) did not fit the 1 kB budget of the time, so the budget was raised to 1.25 kB. That budget was a compromise, and §5 rejected the ideas for trimming it. With React alone at 45 kB gzip, 1.25 kB will not make anyone hesitate to adopt it on the frontend. `implEquals` was withdrawn (§5), so the budget is now 1.00 kB.

Values are not frozen, so casting a value and rewriting it **also affects every value that shares the node**. Breaking it still needs `as`, as in §7.1, but the affected range grew. Dev-only freeze was adopted in response (§7.1).

#### Rejected: holding the ownership mark under a symbol key

The idea was to put `obj[MARK] = true` on the created object itself instead of using the WeakSet. Measured (Node 24.19 / M-series, ns/op).

| Cost of marking                                  | ns/op |
| ------------------------------------------------ | ----- |
| Only creating `{a,b,c}`                          | 3.7   |
| + `owned.add(o)`                                 | 81.9  |
| + `Object.defineProperty(o, MARK, {value:true})` | 69.5  |
| + `o[MARK] = true` (enumerable)                  | 6.6   |

Lookup is faster with a symbol (3 ns for both hit and miss, against 7/5 ns for the WeakSet). But **on the construction path, the cost of marking dominates**, so the net difference is only 0 to 20%.

**The only big win (`o[MARK]=true`, 6.6 ns to mark) is unsound.** Spread copies an enumerable symbol, so `patch`'s `{...value, ...patch}` copies the mark, the copy is skipped entirely, and external objects from the patch get embedded in the value. That is exactly the aliasing §4.1 prevents. Even with a `delete` in `patch`, the mark leaks onto a plain object the moment the user writes `{...user}`. Non-enumerable is the only option, and that is the 69.5 ns path.

The WeakSet wins on more than speed.

- **It cannot be forged.** An internal `Symbol()` cannot be forged either, but then the mark is not shared across dual packages or realms. Sharing it means `Symbol.for`, and at that moment anyone can write `obj[Symbol.for("valof.owned")] = true` and embed a mutable object in a value
- **No extra state rides on the value.** A symbol shows up in `Object.getOwnPropertySymbols`
- Both handle a miss the same way. Both lose the mark across JSON / `structuredClone` and degrade to a copy

It is internal, so it can be swapped later without a breaking change if needed.

#### A `patch` that changes nothing returns the value itself

Even with sharing, a no-op `patch` creates a new root, so the identity changes and a re-render runs. `patch` already loops once over the keys of the merged payload, so the identity comparison runs in that same loop. This matches Immer's `produce`.

- Caught: `patch(v, { name: same value })`, `patch(v, {})`, deleting a key the value does not have
- Not caught: passing a new child Val with an equal value. **Once it went through a constructor, being a new instance is the natural JS behavior**, so this is by design
- With a custom seal, the value still goes through the seal, because the seal owns the shape of the return value. The `copy` inside recognizes the value and returns the same node, so the identity of the `Result`'s contents is kept

The short-circuit skips the seal only for the default seal. §6.8's "every path to a value goes through seal" still holds for custom seals.

#### Sharing creates diamonds, not cycles

**Creation order, not deep copy, is what rules out cycles.** The sharing path skips the copy, so the explanation "it deep-copies at the entry, so there are no cycles" no longer holds. What works is that `copy` is bottom-up. It finishes copying every child before it creates `out`, so **`out` can reference only nodes that existed before it**. The sharing path returns even older owned nodes, so the owned graph is a DAG ordered by creation time. Deep copy is responsible for aliasing, not for cycles.

Types cannot create a cycle either. A parent needs its children first, so only mutation can create a cycle.

Passing a cyclic payload gives a `RangeError` (stack overflow). `copy` is plain recursion with no visited set, so it fails the same way before and after sharing.

**What newly happens is diamonds.** Putting the same child Val in two places now yields the same reference, where it used to be copied separately.

```
diamond: a === b → true   a === m → true
JSON round trip: {"a":{"amount":1},"b":{"amount":1},"note":"n"}   ← sharing is lost
after structuredClone, a === b: true                              ← the DAG is kept
after with, a === b: true   shared with the original: true
```

The values are equal, so `equals` gives the same answer. The difference is observable only through identity.

The failure mode changes in just one case, after a cast breaks immutability.

|                                     | production                                                                                           | development                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| `(v as any).self = v`               | The write succeeds                                                                                   | **TypeError** (dev freeze) |
| Putting that `v` into another value | It is an owned node, so it is shared and enters the value still cyclic (previously a stack overflow) | Unreachable, stopped above |

In production, "crash immediately" becomes "a value that silently contains a cycle". The premise is a cast with `as` and a rewrite, so §7.1's dev freeze catches it one step earlier.

#### No interference with GC

Confirmed with `--expose-gc` that the WeakSet entries added by registering every node do not retain values.

```
1. Value registered in the WeakSet:       collected
   Its child (the shared diamond node):   collected
2. The parent, when only the child is held: collected (the child survives)
3. The root it was derived from:          collected
```

**1. `owned` is a WeakSet, so it does not retain owned nodes.** Only the number of weak references grew.

**2. References point only downward, so holding a child does not keep the parent alive.** A shared node points only to nodes created before it. Holding `user.wallet` does not keep `user` alive. There is no risk like Java's old `substring`, where "a small fragment holds on to a huge buffer", **because whole nodes are shared, and nothing is sliced out of them**.

**3. Sharing actually shrinks the live set.** A diamond means two objects became one, so there are fewer live objects than with copying.

#### Split only the values you update into nested Vals

A comparison on a raw tree of 106 nodes (depth 3, branching 4): held in one Val as is, versus split into nested Vals at each level.

| Approach            | One seal, unsplit | Build, split      | Unsplit + with x10 | Split + with x10 |
| ------------------- | ----------------- | ----------------- | ------------------ | ---------------- |
| plain (no tracking) | 3020              | **11.4us (3.8x)** | 30.1us             | 30.0us           |
| interior            | 9308 (3.08x)      | 11.4us (1.00x)    | 3066 (0.10x)       | 2015 (0.07x)     |
| K=8                 | 4690 (1.55x)      | 10.8us (0.94x)    | 3062 (0.10x)       | 1831 (0.06x)     |
| K=32                | 3696 (1.22x)      | 13.0us (1.14x)    | 3138 (0.10x)       | 1948 (0.06x)     |

1. **Splitting costs something even without tracking.** 3.8x for plain. The parent's seal copies its children again, so every cut in the hierarchy re-copies every node below it. **Without tracking, the library penalized, at construction time, the very modeling it recommends**
2. **Tracking removes that penalty.** Splitting with tracking runs at 0.94 to 1.00x
3. **A single update flips everything.** The rough break-even point is the second `patch`

This gives a guideline.

> Split values you update into nested Vals. Keep read-only values as one Val with a deep payload.

Users know at design time whether they will update a value, so this is a line they can draw.

This is **not a recommendation for custom seals**. `SealImpl` enforces in the types that "a seal takes the payload, not a wire format", so the split happens before the seal, and rewriting the seal changes neither where copies happen nor how many. The lever is the modeling.

#### Sealing nested Vals is enforced by types (except the `PayloadOf` hole)

The phantom brand means a nested Val cannot be created from a raw payload.

```ts
type OrderA = Val<"OrderA", { id: string; total: Money }>;
OrderA({ id: "o", total: { amount: 1, currency: "JPY" } });
// error TS2322: missing __valof_internal_phantom_brand, __valof_internal_phantom_payload
```

Even on the "build the parent from JSON" path, a child always goes through the child's seal and is registered under tracking. The only ways out are writing `as` and **putting `PayloadOf` in a field position**.

```ts
type OrderB = Val<"OrderB", { id: string; total: PayloadOf<Money> }>;
OrderB({ id: "o", total: { amount: 1, currency: "JPY" } }); // passes
```

The brand drops entirely, so the child's seal (invariants, normalization), the child's custom `equals` and sharing under tracking are all lost. It is not completely silent (writing `Money.equals(order.total, x)` gives a type error), but nothing flags it at the moment of construction.

The README's `Reusing a Val` shows **composition at the top level** (`PayloadOf<User> & { … }`), which is a legitimate use. It does not say how that differs from the field position, and someone actually misread it.

### Known friction

`readonly T[]` is not assignable to `T[]`. This gets in the way every time you pass a value to a third-party function that does not know about `readonly` (even `Array.prototype.sort` is unavailable). `Val.unwrap` takes out a mutable copy. It is the inverse of `Val.of`, and its implementation reuses `copy`.

`Val.unwrap`'s return type is `PayloadOf<V>`, so the brands of nested Vals drop too. At runtime it also copies through
nested Vals, so the children it returns have not been through a seal. The cost is that for a payload with nested Vals,
both `Val.of(Val.unwrap(v))` and `Order(Val.unwrap(o))` are type errors. Re-seal the children.

```ts
const raw = Val.unwrap(order);
Order({ ...raw, total: Money(raw.total) });
```

**Rejected: keep nested Vals in `unwrap` only.** The round trip would type-check, but it needs a second payload type besides `PayloadOf`,
and `unwrap`'s return type would no longer be `PayloadOf`.

Swapping `unwrap`'s implementation for `structuredClone` **saves 9 B of gzip, and all 102 tests pass**. Reusing `copy` requires the owning flag, and `structuredClone` removes the flag altogether. No correctness difference turned up either (a payload with `__proto__` as an own property is cloned as an own property and pollutes nothing, a null prototype becomes `Object.prototype`, and a clone of a frozen value is not frozen). The only remaining difference is speed, and it is large (381 vs 2,587 ns/op, 6.8x). **That trade makes `unwrap` 7x slower for 9 B, so it keeps reusing `copy`.**

Error messages also bloat with nested `readonly` and become hard to read. That friction remains too.

`unwrap` is an exit for passing data outside, not a way to derive values. `SeedOf<V>` accepts a Val as is, so `Val.of` / `patch` copy once, but going through `unwrap` copies twice (92 → 184 ns/op, about 8 nested nodes).

`unwrap` is not a standalone export. A common name like `unwrap` at the top level collides with `Result` libraries. Being the inverse of `Val.of` is another reason to keep it in the namespace. A standalone export would save only 9 B, short of the estimated 44 B (measured in §14.6).

### Benchmarks

DeepReadonly, the brand and the companion's overload resolution are all conditional types, so type-checking speed was measured. 30 fields × 3 levels of nesting × 200 types (18,000 properties), observed with `tsc --extendedDiagnostics`.

| Variant                                             | Types  | Instantiations | Check (TS 7.0.2) | Check (TS 5.9.3) |
| --------------------------------------------------- | ------ | -------------- | ---------------- | ---------------- |
| Plain `interface` (no library)                      | 3,979  | 0              | 0.036s           | 0.09s            |
| `Val<K, T>` type + `Val.of` only                    | 46,744 | 765,435        | 0.207s           | 0.54s            |
| + `sealer().impl` and `patch` / `update` / `equals` | 88,145 | 943,921        | 0.285s           | 0.71s            |

About 4,700 instantiations and 1.4 ms of check time per type (TS 7). In absolute terms that is 8x a plain `interface`, but typing all 200 types in one file stays within 0.3 s.

It is linear in the number of types, with no combinatorial blowup in conditional type expansion (the full variant's check time is 0.065s for 50 types / 0.137s for 100 / 0.285s for 200 / 0.601s for 400, and instantiations follow the same slope at 237K / 473K / 944K / 1,886K).

The 2.5x gap in the table above came from the setup least favorable to TS 7 (200 types in one file), where per-file parallel checking, a large part of TS 7's speed, does not apply. Splitting the same 200 types into one file per type widens the gap to over 7x.

| Layout of the full variant | Check (TS 7.0.2) | Check (TS 5.9.3) |
| -------------------------- | ---------------- | ---------------- |
| 1 file (200 types)         | 0.285s           | 0.71s            |
| 200 files (1 type each)    | 0.094s           | 0.70s            |

Put the other way, collecting types into one huge file throws away most of TS 7's advantage.

In either layout, **instantiations are nearly identical across the two compilers** (943,921 / 943,425), so regression monitoring watches instantiations, not time.

Remeasured after adding deep patch (§6.2). The same 200 types × 30 fields × 3 levels, changing only the `patch` calls.

| Variant                          | Types   | Instantiations | Check (TS 7.0.2) |
| -------------------------------- | ------- | -------------- | ---------------- |
| Before deep patch, 1-level patch | 120,172 | 870,532        | 0.29s            |
| After deep patch, 1-level patch  | 120,281 | 870,851        | 0.28s            |
| After deep patch, 3-level patch  | 177,885 | 1,177,941      | 0.40s            |

**Defining the recursive type itself is free.** The cost grows only where a deep patch is actually written (+35% instantiations). It scales with the call depth and stays linear in the number of types (with a 3-level patch: 307K for 50 types / 577K for 100 / 1,117K for 200 / 2,198K for 400).

Making DeepReadonly opt-in is judged unnecessary. Most of the cost is on the `Val` type definition side (765K instantiations already, without companions), and the overload resolution of `patch` / `update` / `equals` adds only 23% on top.

### 4.2 Keep tuples

Tuple payloads used to be flattened by `DeepReadonly`. `ReadonlyArray<infer E>` also accepted tuples and flattened them into `ReadonlyArray<DeepReadonly<E>>`. `SeedOf` sits on top of it, so the APIs derived from it (`patch`'s patch, §5's `implEquals` spec) could not express per-position handling.

**`number extends T["length"]` separates arrays from tuples.** The tuple side is a homomorphic mapped type, so positions, length, labels and `readonly` are all kept. The same branch went into both `Validate` and `DeepReadonly`.

```ts
: [T] extends [ReadonlyArray<infer E>]
  ? number extends T["length"]
    ? ReadonlyArray<DeepReadonly<E>>
    : { readonly [I in keyof T]: DeepReadonly<T[I]> }
```

#### Optional elements and `undefined`

Optional tuple elements (`readonly [string, number?]`) are allowed on the same footing as optional object keys. A missing element just makes the array shorter, and it round-trips through JSON. `readonly [string | undefined, number]`, on the other hand, is like putting `undefined` on a required key, so it is rejected (§3.5). An `undefined` in an array becomes `null` under `JSON.stringify`, which silently changes the value.

`Required<T>` tells the two apart inside the mapped type. Only optional elements lose `undefined`.

```ts
[I in keyof T]: undefined extends Required<T>[I]
  ? Invalid<"a tuple element cannot be undefined; use null or make it optional">
  : Validate<Exclude<T[I], undefined>>;
```

#### Rest elements fall back to arrays

`readonly [string, ...number[]]` has `number` as its `length`, so the check falls straight to the array side. Positions are lost, but it is not unsound. **This follows from the criterion "is the length fixed"**, and fixing it would need a different check. Left as is until someone asks for it.

#### The message improved too

Previously, a union of elements missed the `Function` branch and fell into the object branch, which gave `Invalid<"not a plain value">`. Now each position goes through `Validate`, so the wording matches arrays.

```
Val<"InTuple", { t: readonly [string, () => void] }>
  → readonly [string, Invalid<"functions are not allowed">]
```

#### Cost

Measuring the same payload shape as an array and as a tuple, 200 types × 3 levels: Types +69 / Instantiations +147 (0.06%). An identical tuple type is instantiated only once, so what matters is **the number of distinct tuple types**. Payloads without tuples change by +0.01%, and the runtime is unchanged.

As a type, this is a breaking change, so it goes into 0.3.0. For a type with a `readonly [A, B]` payload, assignments that used to pass as `ReadonlyArray<A | B>` no longer pass.

### 4.3 Open `Rec`

`DeepReadonly` opens `Rec<V>` to `V`. This is the one place where §3.7's marker disappears from the value.

```ts
export type DeepReadonly<T> =
  IsRec<T> extends true ? (T extends Rec<infer V> ? V : T) : DeepReadonlyValue<T>;
```

#### Detect by key, not by assignability

`[T] extends [Rec<unknown>]` reads `Rec<Tree>`'s type argument. That is exactly the resolution `Rec` defers, and it gives
TS2615 at `Val.sealer<Tree>()`. Checking by key does not touch the type argument.

```ts
type IsRec<T> = string extends keyof T ? false : keyof Rec<unknown> extends keyof T ? true : false;
```

An index signature matches every key, so it is excluded first. Otherwise `Record<string, Money>` is detected as `Rec`
and passes through unvalidated.

#### Drop `undefined` from optional keys before descending

An optional key's type arrives in the form `{ at: Rec<Tree> } | undefined`. As a union, the walk stops one level
short, and the inner `Rec` does not open. The value never holds `undefined` (a key is either present or absent, and §3.5 rejects
`undefined` on a required key), so it is dropped before descending.

```ts
readonly [K in keyof T]: DeepReadonly<Exclude<T[K], undefined>>;
```

#### Array detection moved to `keyof`

`[T] extends [ReadonlyArray<unknown>]` reads and compares a property's type when a payload key overlaps an array member name (`entries`, `values`,
`at`, `length`). If that property holds a `Rec`, as in `entries: Record<string, Rec<Dir>>`,
it resolves the type under declaration and fails with TS2456. It showed up as **a property named
`kids` passes, and one named `entries` fails**.

Only arrays have payloads with numeric keys, so `keyof` is enough.

```ts
number extends keyof T
  ? number extends Extract<T, readonly unknown[]>["length"]
    ? ReadonlyArray<DeepReadonly<T[number]>>
    : { readonly [I in keyof T]: DeepReadonly<T[I]> }
```

Fewer structural comparisons make it cheaper. Core instantiations 5,750 → 5,460, trait 13,753 → 13,784, enum
70,873 → 32,091. **Adding recursion lowered the type cost.** Enum drops by more than half because each Variant goes through
`Val`, so removing the check from the value's shape (§11.2) pays off once per Variant.

The same branch in `Validate` stays. That branch lives only inside the verdict (§11.2), and is not read during
alias resolution.

---

## 5. Equality

**Withdrawn 2026-09-15 (#36).** Custom equality is removed. A companion has no `equals`, no `implEquals` and no spec.
The rest of this section records how we reached that decision.

The current form:

- `equals(a, b)` is a named export and compares structure only. Tree shaking drops it when unused
- The first argument decides the Val type of the second. Comparing two different brands is a type error
- Where different inputs mean the same value, the seal normalizes them. Only the "construct in canonical form" principle below survived
- A comparison that is not value equality (comparing by id alone, for example) goes on the companion under another name. Its author is responsible when its result differs from `equals`

Two reasons:

- **Nothing can call a child's custom equals automatically.** As "Constraint" below shows, a nested Val is compared by structure
- **Requiring `implEquals` makes code redundant.** The parent writes a spec every time a child holds a Val

The comparison rules stay the same. The comparison ignores key order and ignores keys whose value is `undefined`.

### API

There is **no** free function `Val.equals`. The brand is a phantom, so the runtime cannot identify the type and cannot dispatch to a per-type custom equality.

Instead, every companion has a default `equals`, and `.implEquals` replaces it.

```ts
User.equals(a, b); // deep equal by default
```

The default implementation, `deepEquals`, is **not exported** either. As a free function it would be `Val.equals` under another name, and would open a path that silently bypasses the per-type `equals` (it takes `(a: unknown, b: unknown)`, so it also accepts two Vals of different types).

Instead, **the override receives it bound, as its third argument**. Only an override receives it, where delegation makes sense, and it is typed with that Val.

```ts
const Doc = Val.sealer<Doc>().implEquals((a, b, deepEquals) =>
  a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id,
);

Doc.equals(a, b); // the caller still passes 2 arguments. The third is already bound
```

The argument is the structural comparison itself, not "the equals before the override". The constraint below, "a parent cannot call a child's custom equals", applies to this argument unchanged.

A primitive payload gets the third argument too. `deepEquals` is not `===`: it treats NaN as equal to NaN (see the requirements below). An override on `Val<"Temp", number>` that writes `a === b` behaves differently from the default, so the override still receives `deepEquals`.

### Requirements for the default implementation

- Deep structural comparison
- **Independent of key order** (sort the keys, then compare). The Set representation in §8.1 needs it, and it is the correct behavior anyway
- **Ignore keys whose value is `undefined`.** `{ a: undefined }` and `{}` are equal. This makes a serialization difference between two paths unobservable when an `undefined` leaks in with EOPT off (§3.5)

### Constraint: a parent cannot call a child's custom equals

```ts
const Money = Val.sealer<Money>().implEquals(
  (a, b) => a.currency === b.currency && normalize(a) === normalize(b),
);

const Order = Val.sealer<Order>(); // the default deep equals

Order.equals(o1, o2); // ← the Money inside goes through the generic comparison, not Money.equals
```

The default deep equals looks at a child value and cannot tell that it is a `Money`.

No implementation trick avoids this. In principle, the runtime has only three ways to get a type from a value:

1. The value has a prototype → class
2. The value has a tag → tagged record
3. The caller knows the type → dictionary passing (type classes / implicits)

1 and 2 conflict with the premise that the brand is a phantom, and TypeScript has no means for 3. This is a structural fact, **the trade-off between "a value is plain data at run time" and "runtime polymorphism"**, not a design mistake.

### Solution: construct in canonical form

A type that needs a custom equals **becomes correct under structural equality once its seal normalizes it**.

```ts
const Email = Val.companion<Email>().implSeal(
  (s: string, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

`Email` no longer needs `implEquals`, and a parent's structural comparison gives the right answer. Establishing invariants in a smart constructor is standard practice for value objects, so this constraint leads toward the right design.

`implEquals` itself stays, documented as "applies only to a top-level comparison, not when a parent compares". It is an escape hatch, not the recommended path.

### The `implEquals` spec

Some equalities cannot be expressed by normalization: comparing by id alone, ignoring a cache column, excluding `updatedAt` from equality. A parent that writes `equals` by hand for these lists even the unrelated keys itself, which is redundant. Instead of a function, `implEquals` accepts **a spec per child**, and a key left out falls back to the default `deepEquals`.

```ts
export const Order = Val.sealer<Order>().implEquals({
  total: Money, // pass the companion as is. Money.equals is used
  email: Email, // works for a child with a primitive payload too (the key point)
  lines: [OrderLine], // an array, element by element
  shipping: { zip: Zip }, // a plain nested object that is not a Val: write only the specs inside
  span: [undefined, Money], // a tuple, position by position
  updatedAt: () => true, // exclude from equality
});
```

`id` and `note` need not be listed.

**What a spec accepts**

| child type          | form                            | meaning                                       |
| ------------------- | ------------------------------- | --------------------------------------------- |
| Val                 | companion / `(a, b) => boolean` | compares the value itself                     |
| primitive           | `(a, b) => boolean`             | same as above                                 |
| array of any length | `[spec]`                        | element by element                            |
| array of any length | `(a, b) => boolean`             | the whole array (ignoring order, for example) |
| tuple               | `[spec, spec, ...]`             | position by position. Write every position    |
| plain object        | `{ k: spec, ... }`              | descends into it                              |

At the top level (the argument of `implEquals` itself), a bare function overrides `equals`. Every other form works the same there.

```ts
Val.sealer<Tags>().implEquals([Email]); // Email.equals element by element
Val.sealer<Tags>().implEquals((a, b) => setEq(a, b)); // overrides the whole array
```

A tuple **lists every position**. `undefined` makes that position fall back to the default.

#### Rejected: a bare companion or function as an array's spec

This form reads as "a function for an array, positions for a tuple", and it would allow leaving out tuple positions (`lines: OrderLine` would mean element by element). **It broke at run time during implementation.**

`toEq` sees only the spec. When a Val whose payload is an array (`Val<"Tags", readonly string[]>`) appears as a child, the two cases become indistinguishable.

```ts
// the parent's payload: { tags: Tags; raw: readonly Email[] }
implEquals({ tags: Tags, raw: Email });
```

`tags` must apply `Tags.equals` to the whole array, and `raw` must apply `Email.equals` element by element. Both specs are objects with `equals`, and both values are arrays at run time. **The types can tell them apart by checking `[T] extends [AnyVal]` first, but that information does not exist at run time.** The result is silently wrong equality.

As long as square brackets mark "element by element", this ambiguity cannot arise. `Array.isArray(spec)` decides between element by element and position by position, and anything else always compares the value itself.

The cost is that a tuple can no longer leave out positions. `[eq]` reads two ways, "`eq` on every element of the array" and "`eq` on position 0 only of a 3-tuple", so a tuple lists every position. Only a spec of length 1 is ambiguous, and there both readings give the same result.

A rest tuple (`readonly [string, ...number[]]`) falls to the array side through `number extends T["length"]`, and its element type becomes `string | number`. The positions are lost (the rest limit in §4.2).

**The ambiguity between a companion and "a nested spec with a key named `equals`"** is resolved by checking `typeof spec.equals === "function"` first. A payload cannot hold a function (`Validate` in §3), so only a companion can be an object whose `equals` is a function.

**This check goes before the check for a bare function.** A sealer is callable, so checking `typeof spec === "function"` first uses the companion as a constructor in the comparison. The returned value is truthy, so the values always compare equal. We hit this during implementation.

**Recursion stops at a nested Val.** You cannot descend by hand, as in `{ total: { amount: eq } }`. This is the same rule that stops `DeepReadonly` and `Patch` at the same position, and it closes the path that would silently bypass `Money.equals`.

**The spec is precompiled into comparators.** `toEq` runs once when the companion is built and creates a comparator closure for each spec node. A comparison no longer looks at the spec.

#### Rejected: fold the spec into `deepEquals` (size reduction)

With a separate `toEq`, the array and object traversal duplicates the one in `deepEquals`. One recursion that takes the spec as its third argument removes the duplication, and `deepEquals(a, b)` becomes `eq(a, b, undefined)`. **Production gzip -116 B. We implemented it, measured it, and reverted it.**

Measured (Node 24.19 / M-series, production, ns/op):

|                                                                   | precompiled | one recursion |
| ----------------------------------------------------------------- | ----------- | ------------- |
| default `deepEquals` (an order with 20 lines)                     | 2530        | 2535          |
| `equals` with a spec (`{ total: Money, lines: [Line] }`)          | **232**     | **511**       |
| `equals` with a spec (a small aggregate, `{ total: Money }` only) | 112         | 139           |
| same reference                                                    | 4.6         | 7.0           |
| building the companion                                            | 4300        | 3950          |

The default path does not change. **The element-wise array spec (`[Line]`) slows down, in proportion to the element count.**

We also measured a middle option that shares only the traversal and keeps the precompilation. It took 489 ns and recovered almost nothing. **So the cost is not "two `typeof` checks per node".** Precompilation creates a separate closure for each spec node, so each call site stays monomorphic and V8 can use its inline caches. One recursion sends every spec shape through the same function, which V8 cannot specialize. Passing `child(k)` to a shared traversal loses just as much, because one added level of indirect calls is enough. (The speed difference is measured; the explanation is inferred.)

The budget was never tight, so there is no reason to chase these 116 B.

#### Rejected: bind the seal for with / update in one helper

`attach` contains `impl ? (v, a) => impl(v, a, seal) : default` in two places, and this option wraps it in `bind`. **Measured: gzip +6 B.** The repeated ternary compresses well, so the helper's name and calls cost more.

**Types**

```ts
type EqSpec<T> = [T] extends [AnyVal]
  ? Eq<T> | { equals: Eq<T> }
  : [T] extends [Primitive]
    ? Eq<T>
    : [T] extends [readonly unknown[]]
      ? Eq<T> | EqElements<T>
      : [T] extends [object]
        ? Eq<T> | { [K in keyof T]?: EqSpec<T[K]> }
        : never;

type EqElements<T> = T extends readonly unknown[]
  ? number extends T["length"]
    ? readonly [EqSpec<T[number]>]
    : { readonly [I in keyof T]: EqSpec<T[I]> | undefined }
  : never;

// At the top level a bare function is the override, so the spec side drops functions.
type EqImpl<V extends AnyVal> = ((a: V, b: V, deepEquals: Eq<V>) => boolean) | EqPayload<SeedOf<V>>;

type EqPayload<T> = [T] extends [AnyVal]
  ? { equals: Eq<T> }
  : [T] extends [Primitive]
    ? never
    : [T] extends [readonly unknown[]]
      ? EqElements<T>
      : [T] extends [object]
        ? { [K in keyof T]?: EqSpec<T[K]> }
        : never;
```

For a primitive payload, `EqPayload` resolves to `never`, and the argument collapses to the single override function. No dedicated branch is needed.

#### Rejected: a free function `Val.eqBy`

The form `.impl({ equals: Val.eqBy({ ... }) })`. We do not adopt it, for three reasons.

1. **Inference becomes a gamble.** `V` would be inferred from the return type's context, and "inference from a contextual return type plus a mapped-type constraint" is a weak spot of TypeScript. In a builder step, `V` is already fixed, and the question disappears
2. **Added to `Val`, it cannot be dropped.** A bundler cannot drop a property of `const Val = {...}`, so users who never call it pay 181 B gzip (measured by adding `toEq` to the existing bundle). A standalone export could be dropped, but "which module do I import eqBy from?" would stay forever
3. **`equals` would have three forms** (hand-written / eqBy / default)

#### Rejected: keep the wiring target in `.impl`

→ §7.7

#### Allow omission? (yes)

The idea that required spec keys would catch a forgotten custom equals at the type level does not work. There are three options, and the types can solve only part of the problem.

1. **Every key optional.** Concise, but a forgotten spec goes undetected
2. **Require only the keys whose child is a Val.** Writing `HasVal<T>` lets the types compute this. But it forces you to list even children with no custom equals. Most nested Vals keep the default `deepEquals`, and for them structural comparison gives the same answer. Filling in the keys becomes mechanical work, and in that state the "forgotten spec" check barely works
3. **Require only the keys whose child overrides `equals`.** Ideal, but invisible to the types, because `Val<"Money", ...>` holds no reference to its companion's type. A declaration-merging registry would make it expressible, but then the problem just shifts to "forgot to register in the registry"

We do not make every key required either (the opposite of 1). That means listing even `id` and `note`, which re-implements `deepEquals` by hand.

The deciding fact: **the types protect only someone who calls `implEquals`**. A forgotten spec is truly dangerous in a parent that does not write `implEquals`, that is, a parent that writes nothing, and the types have nothing to check there. The person most likely to forget is the least protected.

So **every spec key is optional, and valof-lint detects the forgotten ones.**

- The linter can see `.implEquals(` directly in the source, so it needs no registry and no type machinery. Since this is a dedicated step, the linter no longer searches the object literal in `.impl({ ... })` for the key
- The analysis has the same shape as the existing implementation. It already tracks imports, namespace imports and renaming re-exports, and identifies the companion at the root of the chain
- Rule: when one companion calls `implEquals`, and another Val embeds that Val in its payload, the parent's companion must call `implEquals` or specify that key in its spec
- The fix is unique, so the linter can offer it as a suggestion (fix)

The types guard "does the comparison written in the spec fit the type", and the linter guards "did anyone forget to write it".

#### Rejected: forbid custom comparison on a plain payload

This option narrows the spec to "which children use their own equality, and which are excluded". A Val position accepts only a companion, and an unbranded position accepts only an exclusion marker (`Val.ignore`). It turns the §5 principle, that equality belongs to the type and is declared in one place, directly into types.

We do not adopt it, because the types cannot guarantee the other half of the principle. No type can say "require `implEquals` only when a nested child has a custom equals" (3 above). So tightening only the Val positions does not establish the invariant, and only reduces expressiveness. That also removes the value of adding one more sentinel, `Val.ignore`. `updatedAt: () => true` stays.

---

## 6. Smart constructors and updates

### 6.1 A constructor that does not exist cannot be bypassed

**2026-10-21: `Val.sealer` is removed (§6.12).** No companion is callable any more, and `X.seal` is the only entry point. What follows records the time when the sealer existed.

Constructor generation moves to `Val.sealer`, separate from `companion`.

```ts
Val.sealer<Tags>(); // constructor (+ default behavior)
Val.sealer<User>().impl({ greet }); // constructor + behavior
Val.companion<Age>().implSeal(check); // behavior only. Not callable
```

**Origin, not detection,** decides whether a companion is callable. A sealer is a constructor, so whatever is built from it stays a constructor, and a companion built without a sealer is not a function at all.

```ts
export const Age = Val.companion<Age>().implSeal((n: number, seal) =>
  n >= 0 ? ok(seal(n)) : err("negative"),
);

Age(30); // This expression is not callable
Age.seal(30); // ← the only entry point
```

**Rejected: the gate approach.** The original plan was "do not return a constructor when the companion receives `from` or `new`". `HasSmartCtor<M>` detected whether the key was present and swapped the call signature.

```ts
(...args: ["User has a smart constructor. Use User.from() instead."]): never
```

It was implemented and worked, but deciding by origin removes the need for detection. `HasSmartCtor<M>`, `SmartCtorGuard`, the gate-only `new` and the return-type constraint on `CompanionMethods` all went away. The guarantee is stronger too. Under the gate approach, **the type error appeared, but the function existed and threw at run time**. Now no constructor exists, so there is nothing to bypass.

The two entry points differ only in their first call (`Val.sealer` or `Val.companion`). `.impl()` is the one way to add behavior, and the only choice left is the meaningful one: "does this type need a constructor?" §13.1 explains the two-step call.

### 6.2 `patch`

**There is no free-function `Val.patch`.** The runtime cannot identify the type, so it cannot dispatch to that type's seal. `patch` is a method on the companion instead.

```ts
User.patch(user, patch);
// internally, returns seal({ ...user, ...patch }) as is
```

- No custom seal → it goes through the default seal (a copy), so it returns `User`
- A custom seal → it returns `ReturnType<typeof seal>`

This closes the hole where "`patch` bypasses the smart constructor". It is part of the §6.8 invariant that every path that creates a value goes through the seal.

#### No `patch` on a primitive or array Val

`Patch<T>` returns `never` for anything other than an object. At first that `never` passed straight through, so even the companion of `Val<"IsoDate", string>` had `patch`. **It appeared in completions although its `never` argument made it uncallable.** At run time it only threw a `TypeError`: a mistake the types should have stopped was deferred to run time.

`patch` becomes a conditional property, and the type drops it entirely when there is nothing to patch.

```ts
type PatchMethod<V, M> = [Patch<SeedOf<V>>] extends [never]
  ? Record<never, never>
  : { patch: ... };
```

The wrapped form `[...] extends [never]` stops the conditional type from distributing over `never` (distribution would collapse the whole conditional to `never`).

- The run-time `TypeError` guard stays. A call from JS that skips the types still needs it. Its role only drops from "main defence" to "last safety net"
- An array Val gets the same treatment. `Patch` cannot express an element-wise patch, so the right path is to rebuild the whole value with the constructor or `seal` (§6.4)

#### `undefined` in a patch means "delete"

| patch form         | meaning     |
| ------------------ | ----------- |
| key left out       | leave as is |
| `{ k: undefined }` | **delete**  |
| `{ k: value }`     | set         |

A patch is a `Partial`, so leaving out a key already expresses "leave as is". If `undefined` meant the same, **the same operation would have two forms, and nothing would express deletion**.

§3.5 removed `undefined` from the value space, so it is **the only value usable as a sentinel**. That one sentinel goes to "delete", which has no other way to be expressed.

The implementation gets simpler too. Spreading `{ ...user, ...patch }` produces "the key exists and its value is `undefined`", so **dropping the `undefined` keys after the merge is the deletion**. The patch needs no cleanup before the merge.

For reference: JSON Merge Patch (RFC 7386) uses `null` to mean deletion. This library allows `null` as a legitimate value, so it cannot do the same, but the idea of using a value outside the value space as the deletion sentinel is shared.

#### Guarding against accidental deletion

Several layers guard against an unintended deletion in `patch(u, { nickname: form.nickname })` when `form.nickname` happens to be `undefined`.

**1. `undefined` on a required key is a type error.** The patch type splits optional and required keys.

```ts
type Patch<T> = { [K in Exclude<keyof T, OptionalKeys<T>>]?: PatchValue<T[K]> } & {
  [K in OptionalKeys<T>]?: T[K] | undefined;
};
```

**2. Deleting an optional key is a legitimate operation.** The field was declared as "may or may not be present", so deleting it is expected.

**3. With EOPT off, the seal still catches it.** With EOPT off, the types do not stop `undefined` on a required key. The result breaks the invariant, so a custom seal returns `Err`. **It fails loudly instead of breaking silently.**

A hole remains only for the combination "EOPT off and no custom seal". This is the same setup as §3.5, and the README's EOPT recommendation applies here too.

#### A patch reaches any depth

With a shallow optional `Patch`, every deep update needs one spread per level of depth.

```ts
User.patch(u, { profile: { name: "x" } }); // type error: age is missing
User.patch(u, { profile: { ...u.profile, name: "x" } }); // written every time
```

React state updates do this every day, so a library that advertises interop has to close this gap. `Patch` became recursive, and `patch` became a deep merge.

```ts
type PatchValue<T> = [Patch<T>] extends [never] ? T : Patch<T>;
```

**A type with nothing to patch (a Val, an array, a primitive) is replaced whole.** The optional / required split applies at every level through the recursion, so the guard against accidental deletion and the excess property check work the same at depth. No extra machinery was needed.

**Stopping the recursion at a Val follows from §6.8.** If a patch reached inside a nested value, it would produce a payload that the nested value's seal never received. The outer `patch` seals only the outer value.

The writer loses nothing. A nested value can be derived with its own type's `patch`, which goes through its own seal and keeps the references of untouched subtrees.

```ts
Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) });
```

From the outside, this is "a node a constructor built", so the owned rule in §6.2 replaces it. It reaches the same result as a deep patch without skipping a single seal.

#### Only an existing node can be merged

The recursive `Patch` allows a partial on the assumption that a node exists at that position. If none exists, the runtime replaces instead of merging, so **the partial becomes the value as is**.

```ts
Place.patch(place, { at: { x: 1 } }); // at is optional and currently absent
// { name: "p", at: { x: 1 } }        at.y is typed number, undefined at run time
```

A missing `Record` entry is the same. A node can be missing in three ways, and the discriminated union (§3.6) was one of them.

An optional key and a `Record` entry take **the whole value**. The type does not know whether the node exists, so it errs on the safe side.

```ts
type Patch<T> = … & { [K in OptionalKeys<T>]?: T[K] | undefined };
```

`OptionalKeys` classifies a `Record` key as optional (`{}` is assignable to an index signature), so one place closes both cases. A required key always has a node, so it merges as before. The cost: a partial update of an existing node writes the whole value too (`{ at: { ...point, x: 1 } }`).

#### The run-time boundary is `owned`

The brand is a phantom, so the runtime cannot read "this is a Val". It can read only where a node came from, and the copy in §4.1 already records that.

**An owned node is a value, not a patch, so it is replaced, not merged.** This is the run-time counterpart of "stop at a Val" in the types. The same rule replaces an existing subtree passed in, as in `{ owner: other.owner }`. That matches the intent.

In a payload that lost its record (one that went through `structuredClone` or a JSON round trip), a nested value falls back to a merge. The only breakage is "a replacement that leaves behind optional keys it should have removed", and correctness otherwise holds. The right fix is to seal the payload again before passing it.

#### Cost: a nested object cannot shrink

With merge as the default, an object cannot be replaced with one that has fewer keys. The Record-as-Map pattern in §8 suffers most.

```ts
Shop.patch(shop, { staff: computed }); // old entries remain
Shop({ ...shop, staff: computed }); // replacement goes through the constructor (§6.4)
```

No new API is added. `patch` merges plain objects all the way down and deletes with `undefined`. Replacing the whole value uses the paths that create values.

`{ staff: { u1: undefined } }` deletes a single entry, so the Map use case is easier to write than before.

#### How the name became `patch`

Renamed from `with`. A breaking change in 0.4.0.

`Array.prototype.with` (ES2023) and the Records & Tuples proposal use `with` with the same meaning, so `with` looked right as JS vocabulary. **It reads correctly only when there is a receiver.**

```ts
arr.with(0, 9); // "arr, with index 0 set to 9"
Order.with(order, {}); // the preposition's subject moves into an argument and is left hanging
```

§1 decided to keep behavior outside the value, so a companion's first argument is the value. A word made for method syntax cannot be carried over unchanged.

`patch` is an imperative, so its verb form matches `equals` / `create` / `seal` / `of` / `unwrap`, and the name matches the argument type `Patch<T>`. A function named `with` no longer takes a `Patch`.

**The word also means a partial update, which is a further benefit.** HTTP `PATCH`, JSON Merge Patch (RFC 7386) and `git patch` all mean "apply a diff instead of sending the whole", which matches the deep-merge implementation. `with` said nothing about partial or whole. Only the deletion sentinel differs: `null` in merge patch, `undefined` in valof (§3.5).

#### Rejected: the past tense (`patched`)

This option shows immutability in the name.

- **The companion form does not sound mutating.** `user.patch(...)` looks as if it changes the receiver, but in `User.patch(user, p)` `user` is an argument, and nothing in the call reads as the thing that changes. Nobody reads `Object.keys(x)` as changing `x`
- **The past tense helps only when a mutable twin exists.** Python's and Swift's `sorted()` mean something because `sort()` sits next to them. valof has no twin, so the name only makes the reader ask "is there a mutable version somewhere?". Scala's case class uses `copy()`, not a past tense, too
- One member alone would be a past participle, breaking the consistent verb form

#### Rejected options

- **An updater function as a patch value** (`{ profile: (p) => ... }`). The sugar works for one level only, and the same operation gets two forms
- **A path API** (`patch(u, "profile.name", x)`). Template literal types slow type checking and use up the d.ts budget, and the API grows. A v2 candidate

#### Cost

Production gzip +43 B, d.ts +0.52 kB. The existing loop in `patch` becomes the recursive function `patched` as is, so the net increase is small.

At every level, `patched` returns the original node when nothing changed, so it preserves reference identity at a finer grain than before.

### 6.3 No Result type

neverthrow, Effect and fp-ts already exist, so this library does not provide one.

**`patch` works without one.** `patch` does not need to unwrap the seal's return value (the old value is already valid, so it merges and passes the result to the seal). Inferring the return type as `ReturnType<typeof seal>` is enough, and the library never needs to know what is inside a `Result`. It works with any Result implementation, home-made ones included.

### 6.4 Remove `update`

`update` and `patch` differed only in the shape they took. Both passed a payload to the same seal. Paths that pass the whole payload already exist: the constructor, and `seal` on a type with a custom seal.

```ts
User({ ...user, name: user.name.toUpperCase() });
Age.seal(age + 1);
const nearby = Path(path.filter((point) => point.y <= 5));
```

The boundary of `patch` stays. Only a plain object that can be deep-merged gets it, and an array, tuple or primitive does not.

**A bare companion offers no way to rebuild the whole value.** A companion that is neither a `Val.sealer` nor has `.implSeal` has no public construction path, yet `update` alone could replace the whole payload through the internal default seal. That was inconsistent as a capability boundary, and removing `update` makes it consistent. A type that creates values chooses a callable sealer or a custom seal.

Removed: `UpdateMethod`, `NoExtra`, the run-time `target.update` and the boolean `Ctors.fixed`. `fixed` became a type-argument-only operation (§6.10). Production gzip -30 B, d.ts -1.1 kB.

Users may now name a member `update`. It is no longer `never` in `.impl` and no longer in the linter's BUILTIN.

**The cost.** On a type with `fixed`, `update` kept the optional keys the callback left out (because the blind merge at the root had no key names). This behavior is not carried over. Delete with `patch(v, { k: undefined })`.

Rejected options: extending `patch` to arrays (`{}` would be a no-op and `[]` a whole replacement, so the meaning would depend on the payload's shape); making `undefined` in an array the deletion sentinel (it overlaps with the standard `filter` / `map`, and the spec would grow a distinction between holes and optional elements); letting `patch` take both a value and a callback (the same operation would have two forms).

### 6.5 Fix the first parameter of a method to the Val (`impl` / `implSeal`)

The `: User` in `greet(u: User)` was boilerplate on every method of every companion. Typing the index signature of `impl` as **a single function type** that starts with the Val turns on contextual typing, and the annotation becomes unnecessary.

```ts
type CompanionFns<V extends AnyVal> = {
  equals?: never;
  patch?: never;
  seal?: never;
  create?: never;
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonMethod;
};
```

`...rest` is `any[]` rather than `never[]` so that unannotated parameters after the first are not inferred as `never`. Assignability holds either way.

#### Only "a single function type" works

Only one shape keeps contextual typing alive. Every alternative failed when measured:

| shape                                                  | result                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| add `AnyFn` to a union to let `from` through           | two candidate signatures, and contextual typing disappears                                                                       |
| an F-bounded mapped constraint `M extends Table<V, M>` | validation works, but contextual typing disappears                                                                               |
| an intersection `{ from?: AnyFn } & Record<string, …>` | the `Record` side checks every property, so there is no exception                                                                |
| overloads (strict → loose, two of them)                | including `from` makes the other methods implicit any too, and the loose side accepts anything, so validation disappears as well |

Moreover, **giving `M` a default type argument is enough to turn off contextual typing**. With `impl: <M extends CompanionFns<V> = Record<never, never>>(fns?: M) => …`, TS stops using the constraint as the contextual type, and the first parameter of every method falls to implicit any. An overload keeps `.impl()` with no argument.

```ts
impl: {
  (): Sealed<V, Record<never, never>>;
  <M extends CompanionFns<V>>(fns: M): Sealed<V, M>;
};
```

#### Constructors go to `.implSeal` / `.implCreate`

A function whose first parameter is not the Val fails this constraint. A smart constructor's first parameter is "what to seal", not the Val, so it cannot go in the method table. It becomes a builder step.

```ts
export const Age = Val.companion<Age>()
  .implSeal((n: number): Result<Age> => …)
  .impl({
    next(a) { … }, // a is Age
  });
```

An options argument (`Val.companion<Age>({ seal })`) is not possible. TS cannot infer type arguments partially, so once `V` is explicit, the function's type is not inferred and falls to the default.

**The name is `implSeal`.** It avoids the pun of `.seal(fn)` (registering) and `Age.seal(x)` (calling) sharing a name. `smart` / `ctor` are short, but the name does not say what the added method is. Passing it as the second argument of `impl` removes the naming problem, but then only the position carries the meaning, and the most important function, the constructor, looks like an accessory. §6.9 tells how the name settled on `seal`.

#### Writing a wiring target in `.impl` is a type error

With a primitive payload, `V` can be assignable to the first parameter's type (`seal(n: number)` for `Val<"Age", number>`). Then **the function passes the constraint and is added as a plain method, and `patch` is not wired to it** (for `create`, **a creation path that skips the seal appears**). It is a silent accident, and we hit it during the migration. Declaring `seal?: never` / `create?: never` rejects it.

We also tried putting a message in the type (`seal?: "use .implSeal() …"`), but chose `never`. The error text reads worse. The optional modifier makes the type `never | undefined`, so TS says:

```
Type '(n: number) => Age' is not assignable to type 'undefined'.
```

Where the only place for information is a parameter type, an embedded message is needed. Here the key name `seal` itself shows what the user tried to do, and `implSeal` sits right next to it in the API. We prefer the form that states the type's intent directly ("`seal` cannot go here").

`equals` / `patch` are `never` for the same reason. The accident takes another shape for them: **the member is added, but the wiring is lost** (the third argument of `equals` never arrives, and the return value of `patch` skips the seal). §7.7 explains why they moved to dedicated steps.

**Keys that start with `__valof_` are `never` too.** Besides the five names, the type declares ``[key: `__valof_${string}`]: never``. `attach` sets `target.__valof_traits = traits` before registering the members, so `.impl({ __valof_traits: fn })` would overwrite the record, and none of a `dyn` box's members would be bound (measured: `Greetable.dyn(...).greet is not a function`). `Declarable` on the `Trait` side rejects the same prefix, so adding internal keys adds no checks.

**The `impl` prefix also belongs to the library.** `.impl({ implTrait: fn })` overwrites nothing, because `.impl(fns)` builds and returns a new object from `base()`, and the step methods are not assigned to it. The types `Sealed` / `Companion` have no steps either. The chain has ended, so nothing can collide. It is rejected anyway, because `User.implTrait(u)` reads as a step. Reserving the whole prefix means a new step never collides with a user's name. `fixed` is not rejected. It is a legitimate member name, as in `Money.fixed(m)`, and nothing can collide with it.

#### No `implSeal` on a sealer

**2026-10-21: the sealer itself is removed (§6.12).**

**A sealer is the default seal itself.** A checked seal next to it would turn the first seal into "a hole that bypasses the check" (§6.1). `implSeal` is for a companion only.

#### `implSeal` is not required

Should `Val.companion<V>().impl({…})` be allowed without a custom seal? **Yes.**

1. **Requiring it closes no hole.** `Val.of` is public API, and `Val.of<Age>(-1)` passes whether or not a seal exists
2. **It cannot be made consistent.** `Val.companion<V>()` is already a usable Companion as is (with `equals` / `patch`). Requiring a seal on `.impl` alone leaves the earlier step open
3. **It forces a fake seal.** A pass-through rubber stamp, `(v) => Val.of<V>(v)`, appears. A seal that reads as validation and does nothing is worse than no seal

A companion without a custom seal is a meaningful form too. For a type whose values come from a boundary (a decoder, a DB row, an external API), the right design bundles only behavior, has no constructor, and builds values with `Val.of`.

#### No omittable parameters

A member with no parameters, an optional parameter, a default parameter or a rest parameter is a type error. Members are dual, so a call that leaves out an argument cannot be told apart from data-last (§6.11). A trailing `a: T | void` counts as optional. `a: T | undefined` is accepted.

#### What is lost

A helper factory whose first parameter is not the Val (`Money.fromCents(n)` / `IsoDate.parse(s)`) cannot go in `.impl`. It is not "behavior on a value", so it makes more sense as a separate plain exported function. A constructor with several parameters (`Point.create(x, y)`) is covered by `implCreate`, so it is unaffected.

→ On 2026-10-26, the `implAssoc` step made room for these (§6.13).

### 6.6 `patch` cannot be overridden

**The vocabulary is a contract.** On any type, `Foo.patch(v, p)` means "deep merge, delete with `undefined`, go through the seal". As long as it can be overridden, this is no promise, and the reader has to check the definition type by type. The benefit of a small fixed surface is lost there.

A derivation with different rules **gets its own name**. Write it in `.impl`, and call the type's own seal inside.

```ts
const Money = Val.companion<Money>()
  .implSeal((m, seal) => seal({ ...m, amount: Math.round(m.amount) }))
  .impl({
    scale: (m, by: number): Money => Money.seal({ ...m, amount: m.amount * by }),
  });
```

The return type annotation is required. The member references `Money` inside its own initializer, so without it TS reports TS7022 / TS7023 (implicitly has type 'any'). This is a general TypeScript fact, not something specific to valof, so neither the README nor the JSDoc mentions it.

#### Rejected: `implPatch` (added once, then removed)

We once added an override step. It had three motives, and **each was already solved elsewhere**.

| motive at the time                               | now                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| keep a generated `id` out of the update path     | `Unpatchable` (§6.10, §6.12)                                                                                             |
| the seal's argument is narrower than the payload | `CheckedSeal` rejects it when `implSeal` registers it (§6.10)                                                            |
| add `patch` to a primitive Val                   | nothing to fix. `patch` on a type with nothing to merge is a lie. Rebuild an array with the constructor or `seal` (§6.4) |

**"A custom derivation cannot reach the seal" was solved too.** At the time we decided "`YourVal.seal(...)` cannot be written, because the companion is still initializing", and passed the seal as the third argument. In fact, **with a return type annotation, the seal can be called from inside `.impl`**. At run time, the function body runs after initialization, so it always worked. Only the circular type inference stopped it. The same holds for a type whose custom seal returns a `Result`.

The `Point` example in the README (truncate in `implSeal`, `seal({ ...p, ...patch })` in `implPatch`) **was a rubber stamp**. With it removed, the default `patch` returns the same answer:

```
default patch:  {"x":3,"y":2}   // the seal truncated 3.7
```

§6.6 added this step to stop people writing rubber stamps, yet its only example was one.

Removed with it: the type arguments `W` / `U` (threaded through all four of `Companion` / `Sealed` / `Sealer` / `CompanionBuilder`), `WithoutSeal<T>`, `DeriveImpl<V, F>`, two fields of `Ctors` and two branches of `attach`.

**Production gzip -40 B, d.ts -1.90 kB.** Removing two type arguments shows up strongly in the d.ts.

`patch` stays `never` in `CompanionFns`. "Cannot be overridden" is separate from "a pass-through function of the same name can be added", and the latter would overwrite the default at run time.

### 6.7 Separate seal and create

The default `patch` still had a hole the types could not close. "The constructor accepts the payload" is **a necessary condition, not a sufficient one**.

```ts
.implSeal((input: Fields): User => make({ id: crypto.randomUUID(), ...input }))
```

`SeedOf<User>` (`{id, name, email}`) is assignable to `Fields` (`{name, email}`), so the types accept `patch`. But what actually runs is `seal({ id, name, email })`, and this function discards the `id` it receives and assigns a new one. **The ID changes on every call, with no type error.**

The structure cannot reject this. Requiring "the argument is exactly the payload" would rule out `seal(input: object)`, a legitimate zod form. `object` and `Fields` are both proper supertypes of `SeedOf<V>`, and nothing tells them apart.

#### Convention: a seal is idempotent (generation goes to `create`)

A seal "seals a payload", so **`seal(the payload of v)` must return `v`**. Generating an ID, a timestamp or a sequence number breaks this law, so it goes to `create`. Each is registered in its own step.

| step            | constraint                                                                                  | adds     |
| --------------- | ------------------------------------------------------------------------------------------- | -------- |
| `implSeal(f)`   | `f: SealImpl<V>` (`(value: SeedOf<V>, ...rest: never[]) => unknown`)                        | `seal`   |
| `implCreate(f)` | `f: CreateImpl<V>` (`(...args: never[]) => SeedOf<V>`. Any parameters, returns the payload) | `create` |

1. **The error appears where the mistake is.** A constructor with several parameters is rejected **when `implSeal` registers it**. Before, the error appeared ten lines below, at `Point.patch(...)`. The branch that explained "write your own patch" became unnecessary and was removed
2. **`create` and the seal can coexist.** This is exactly DDD's split between create and reconstitute. `create` generates the payload, the seal seals it, and `patch` goes through the seal, so `create` does not run again. The ID example for which §6.6 said "you have to write your own `patch`" works correctly with the defaults
3. **`create` alone also adds `patch`.** The default seal (a copy) is a payload function too, so the `id` that `create` assigned is copied and kept. `Rebuild` lost its branch

```ts
type Rebuild<V, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;
```

The subset form (`seal(f: { name: string })`) still passes the `SealImpl<V>` constraint. As with `seal?: never`, the types do not close this, and they cannot express idempotence either. A separate `create` step gives generation a place of its own, so **following the convention becomes the easy path**. That is the guarantee.

**The name is `create`.** `new` is a legal property name (`User.new(...)` works), but writing `{ new(x: number): Y }` in a type literal parses as a construct signature, which is a trap, and `new` is a reserved word too.

#### Upper bound on the seal's argument: it must not accept `string`

`SealImpl<V>` sets only the lower bound (it must accept `SeedOf<V>`). `CheckedSeal<V, G>` checks the upper bound separately and makes it **a type error when the parameter accepts `string`**.

```ts
.implSeal((json: string, seal) => seal(JSON.parse(json))); // type error
.implSeal((input: unknown, seal) => seal(schema.parse(input))); // type error
.implSeal((input: object, seal) => seal(schema.parse(input))); // OK
```

`patch` passes the payload back to the seal (§6.8), so a wire-format decoder in the seal breaks the moment a value is derived from another value. The check rejects `unknown` and `{}`. `object` and `Record<string, unknown>` are wide enough for a schema library.

A Val whose payload is itself a `string` (`Val<"Email", string>`) is exempt. The types have no way to tell the payload from the wire format.

#### A seal returns synchronously, 2026-10-14

The seal's return type was `unknown`, so the types accepted an async seal. It is now forbidden.

```ts
.implSeal(async (r, seal) => seal(await normalize(r))); // type error
```

- **Every derivation becomes async.** `patch` returns the seal's return value as is, so both `seal` and `patch`
  return `Promise<V>`
- **Async usually means I/O, which conflicts with the idempotence convention.** A uniqueness check rejects an existing value's own payload.
  Hashing twice gives a different value. Fetch values outside the seal and pass the result as an argument
- **An await comes between the check and the copy.** The copy happens in the default seal at the end (§6.8). During the await,
  the caller can modify the input. Still, such a modification is visible in the code. Development detects it with
  `changedDuringSeal`, and production does not check

`Synchronous<G, Checked>` rejects a seal whose return type includes `PromiseLike`, through `Invalid<…>`.
It applies to `Val.companion`, `Enum.companion` and a variant's `implSeal`. It does not exempt a Val whose payload is
a `string` either. Only the argument check exempts them.

The type looks for `PromiseLike`, not any type with `then`. An object whose `then` signature does not match
passes.

**A seal whose return type is `any` passes.** `any` also matches `PromiseLike`, so without the exemption a synchronous seal
would get a false error, "a seal is synchronous".

`create` could never be async. The generator's return type is `SeedOf<V>`, and a `Promise` is not assignable to it.
An empty payload is the same. `SeedOf` narrows an empty payload to an object that is not a promise (§9, 2026-10-19).

**Rejected: in development, throw when the default seal is called after the custom seal has returned.** It catches lazy
evaluation that passes the types (`(r, seal) => () => seal(r)`) and an async seal whose return type is `any`. It was added once and
removed as overly defensive. Anyone who knows that a seal checks and normalizes writes neither. Modification of the input during
an await is still detected in development by `changedDuringSeal`.

The production bundle does not change (852 B gzip). Type instantiations: core 5,665 → 5,781, enum
33,264 → 33,537.

#### No `create` on a sealer

**2026-10-21: the sealer itself is removed (§6.12).**

A sealer is callable, so adding `create` removes no construction path, and **all it gains is a namespace**. The problem is that **the name makes a promise it cannot keep**.

```ts
const Task = Val.sealer<Task>().implCreate((t: Fields) => ({ id: uuid(), ...t }));

Task.create({ title: "x" }); // id is assigned
Task({ id: "forged", … });   // ← passes right next to it
```

A companion's `create` means something as part of "generation is `create`, sealing is the seal, and no other path makes a value" (§6.7 / §6.8). The same name on a sealer would make the same `create` differ in strength by type: it reads as a guard and guards nothing. `.fixed` (§6.10) is also a companion builder step, so the sealer would get only half the toolset.

If all you want is an alternative constructor with several parameters (`Point.create(x, y)`), a plain exported function is enough. And **"I want `create` on a sealer" usually signals that you want a companion**: if there are fields to generate, not just anyone should be able to pass a raw payload. Leaving `create` off the sealer pushes users toward a companion.

This step can be added in a backward-compatible way, so we can reconsider once real examples accumulate.

### 6.8 Make the seal the only gate

**`create`'s return value goes to the seal.** `create`'s return type is fixed to `SeedOf<V>`, and the public `create` becomes `seal(create(...args))`.

```ts
.implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f })) // only builds the payload
.implSeal((u: SeedOf<User>): Result<User> => check(u)) // the only place that seals
User.create(fields); // → Result<User>
```

- **A single path makes values.** "A payload becomes a Val only through the seal" becomes a library invariant, and `create` shrinks to "build a payload from the arguments". The exception is `.implCreate.noseal`, which skips the seal in production (§9)
- **Return types line up.** Before, `create` could return `User` while `from` returned `Result<User>`. Now both return `Constructed<V, F>`
- **User code has one fewer `Val.of`**
- **Without a custom seal, it falls back to the default seal (a copy).** If the `implCreate` constraint depended on whether `F` is present, the type of `create` would depend on registration order. So it always requires `SeedOf<V>`, and the runtime decides which seal to use

The cost is that **`create` itself can no longer fail**. If it returned `Result<SeedOf<V>>`, the library would have to bind it, which violates "the library does not know `Result`" (§6.3). Move checks on input that may be invalid to the seal (`seal(v: object)` passes the constraint, so the zod form works as is). Anything that must fail while building the payload goes to a plain exported function. → Since 2026-10-26, it goes in an `implAssoc` member, which calls the `seal` it receives itself (§6.13).

#### The seal's argument stays immutable, and `Val.of` copies once

We once implemented a mutable seal argument (`PayloadOf<V>`), with the public `seal` deep-copying at the entry. The reasons were that normalization could `sort` an array, and that the payload could go to someone else's function that requires a mutable type. We dropped it:

1. **It becomes an immer-style mutable draft.** That contradicts the style of deriving values from values
2. **ES2023 made it unnecessary.** With `toSorted` / `toSpliced` / `patch` / `toReversed`, normalization can derive instead of mutate
3. **It copies twice.** The deep copy at the entry adds to the deep copy in `Val.of` at the end

With the argument back to `SeedOf<V>`, **the copy at the entry is not needed at all**. A seal that receives a readonly argument does not touch the caller's object (unless it casts), and `Val.of` takes ownership. Without a custom seal, the default seal (`copy`) makes that one copy.

What is lost: passing the payload as is to someone else's function that requires a mutable payload. Put `Val.unwrap` or a spread in between (§4).

The type of the public `seal` is the registered function itself. The zod form (`seal(u: object)`) still accepts wide input.

#### Paths and copy counts

`copy` is a deep copy that walks the whole payload once. A shallow copy (a top-level spread) is counted separately. A nested child Val is included in the deep copy, but **the child's seal does not run again** (no dispatch, §5).

| call                                                         | goes through the custom seal  | shallow copies                 | deep copies                          |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------ | ------------------------------------ |
| `Val.of<V>(x)` / the sealer's callable `V(x)`                | no (this is the default seal) | 0                              | 1                                    |
| `Val.of.nocopy<V>(x)` / `V.nocopy(x)`                        | no (chooses to adopt)         | 0                              | **0**                                |
| `V.seal(x)` (custom seal)                                    | yes                           | as many as the seal derives    | 1 (the default seal at the end)      |
| `V.seal.nocopy(x)`                                           | yes                           | as many as the seal derives    | **0** (adopts the final payload)     |
| same, validation fails and returns `Err`                     | yes                           | same                           | **0** (skips the default seal)       |
| `V.patch(v, patch)` (no custom seal)                         | no                            | 1 (merge)                      | 1                                    |
| `V.patch(v, patch)` (custom seal)                            | yes                           | 1 + what the seal derives      | 1                                    |
| `V.create(args)`                                             | yes                           | what create builds (usually 1) | 1                                    |
| `V.create.nocopy(args)`                                      | yes                           | what create builds (usually 1) | **0** (adopts the final payload)     |
| `V.create()` (`.implCreate.noseal`)                          | not in production             | what create builds (usually 1) | 1 (0 with `.nocopy`)                 |
| a custom `patch` in `.impl` → the seal in the third argument | yes                           | depends on the implementation  | 1                                    |
| a custom `patch` in `.impl` → `Val.of`                       | **no**                        | same                           | 1                                    |
| `Val.unwrap(v)` → transform → `V.seal(...)`                  | yes                           | the transform's                | **2** (once in unwrap, once in seal) |

- The default canonical path deep-copies once, and the matching `.nocopy` zero times. The choice is always made at the final seal, "the moment it becomes a value"
- A failing path does not copy. Input that fails validation does not pay for a copy
- Shallow copies come from the structure of the path itself (the merge, `fn`'s return, the derivation in normalization)
- Only a derivation through `Val.unwrap` copies twice. This is why §4 says "do not use `unwrap` to derive"

**"1 deep copy" counts walks, not the amount walked.** The copy stops at owned nodes (§4.1), so you pay only for the newly built part, not for the size of the value.

Measured on a payload of 101 nodes, production build:

| call                                     | µs/op  |
| ---------------------------------------- | ------ |
| `City({ ...fresh, name })`               | 11.087 |
| `City({ ...city, name })`                | 0.151  |
| `City.patch(city, { name })`             | 0.229  |
| `City.patch(city, { geo: { lat: 36 } })` | 0.439  |

**The origin of the nodes passed in**, not the path, decides the 70x difference. Spread a value and pass it straight to the constructor, and the copy stops at the owned nodes. Assemble an object from outside and pass it, and everything is copied.

Deep patch (§6.2) makes this finer-grained. Only the nodes on the path the patch touched are new, and every sibling passes through as owned.

#### Pass the default seal as the second argument

Creating a value inside a custom seal used to require writing `Val.of<Age>(n)` with its type argument. Passing the default seal (brand + copy, which is `Val.of` bound to the type) as the second argument removes it.

```ts
.implSeal((n, seal) => (n >= 0 ? ok(seal(n)) : err("negative")))
```

This mirrors how `equals` passes `deepEquals`. What it receives is **the default** seal, not itself, so there is no recursion. A seal written with one parameter is registered as is. The public side drops the second parameter with `WithoutDefaultSeal<F>`.

**`Val.of` stays public anyway.** Removing it would stop `.impl` methods from creating values of their own type, would make a companion without a seal (§6.5) impossible, and would force revalidation through the seal when lifting an already validated value (a JSON round trip, a test fixture). And `payload as Age` remains, so **this is not a hole that can be closed**. `Val.of<Age>(x)` is an escape hatch that grep can find, because the type argument is explicit.

| where the value is created                | means                        |
| ----------------------------------------- | ---------------------------- |
| inside a custom seal                      | the seal in the 2nd argument |
| an `.impl` method / lifting at a boundary | `Val.of`                     |

### 6.9 How the name became `seal`

The registration step was `implFrom`, and the added method was `from`. We dropped names one after another.

- **`from`**: `implFrom` reads as Rust's `impl From<T> for U` (conversion from any type). That is what `create` means now, so **the name pointed at the opposite of what it did**
- **`validate`**: checking is only one of the things a seal does. Normalization (Email in §5) and wrapping in a `Result` are not "validation", and a `validate(x)` that copies its argument is odd. The word also invites misreading it as a predicate that returns a boolean
- **`parse`**: it reads naturally for both the copy and the failure. But parse means "decode loose input into a type", so **the name does not explain why the argument is fixed to the payload**. That constraint is essential for `patch` to go through the seal, and it must not look arbitrary
- **`seal`**: what gets sealed is the contents themselves, so the name says the argument is the payload. It is already library vocabulary (`Val.sealer`), and the three-way split lines up. The verb also conveys the §6.7 convention "do not generate"

|                   | argument | constraint                                 |
| ----------------- | -------- | ------------------------------------------ |
| `Val.sealer<V>()` | payload  | none (brand + copy only)                   |
| `.implSeal(f)`    | payload  | yes                                        |
| `.implCreate(f)`  | any      | builds a payload and passes it to the seal |

**The remaining risk is confusion with `Object.seal` / `sealed class`.** JS's `Object.seal` forbids adding properties at run time, but valof does not freeze (§7.1). In Rust / Scala / Kotlin, `sealed` is an adjective on a type declaration (a closed inheritance hierarchy), while here it is a verb that creates a value. valof has neither subtyping nor variants, so there is little to misread, but one line in the README and the docs rules it out.

### 6.10 `fixed`: keys excluded from the derivation paths

**On 2026-10-22, this moved to the companion type argument `Unpatchable<K>` (§6.12).** What follows records the time when it was a step.

The §8.4 pattern, keeping the `id` that `create` generated away from the derivation paths, could be written only by **overriding `patch`**. The override's body did not differ from the default by a single character. **Its only content was the patch type.** §6.5 / §6.6 decided "do not make people write rubber stamps", yet the most frequent pattern forced one.

A declaration step is added.

```ts
Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal(seal)
  .fixed<"id">();
```

#### Keys are passed as a type argument (they do not exist at run time)

Passing the key as a string, `fixed("id")`, would make it known at run time too, but we chose the type argument alone. That matches the brand being a phantom, and the guarantee is the level §8.4 already accepts ("ordinary update paths cannot touch it. `Val.of` can forge it"). Restoring the old value at run time when the types are bypassed (through `any`, for example) would also hide bugs.

With `update` removed (§6.4), nothing remains at run time. The patch argument of `patch` becomes `Patch<Omit<SeedOf<V>, K>>`, a type-only operation.

#### Name

It went through `implProtect` / `implFinal` / `implMinted`, became `unpatchable`, and was then renamed `fixed`.

- No `impl` prefix. `impl*` means "provide an implementation of X", but this step passes no function and only declares something about the type. **Names should tell steps that provide implementations apart from steps that declare properties**
- `final` brings in JVM vocabulary (`final val` / `sealed abstract class`) and invites misreading `seal` as in `sealed trait`. `finalize` reads both as a GC finalizer (`FinalizationRegistry`) and as the end of a builder (`.build()`)
- `minted` fits the role of `create` best, but its meaning is unclear on a type without `create`, and readers outside the English-speaking world find it hard to understand
- `unpatchable` takes its meaning only from the already public `Patch<T>`. It brings in no new metaphor and promises no more than it does

#### `unpatchable` → `fixed`

When `with` was renamed to `patch` (§6.2), the stems collided. `unpatchable` restricted both derivation paths of the time, but the old name read as blocking only `patch`. That reading lets through the very forgery it was meant to prevent.

`fixed` shares no stem with `patch` and does not depend on whether `create` exists. It belongs with fixed-point and fixed rate, so it suggests neither inheritance nor visibility.

**It stays an adjective.** The decision above still holds: this step passes no function and only declares a property, and its name sets it apart from `impl*`, which provides implementations. `fix` would be an imperative and erase that distinction, and `.fix()` in a chain reads as "repair".

- **`final`**: still rejected as above. §6.9 names, as `seal`'s remaining risk, JVM vocabulary leading readers to misread `seal` as `sealed trait`, and `final` amplifies it
- **`lock`**: imperative and not misread, but only one boolean remains at run time, so "lock" promises too much
- The internal type `Patchable<V, P>` is renamed `Derivable<V, P>`. It is the surface of all derivation paths, so it should not carry the stem of one of them

### 6.11 Make members dual, data-first / data-last, 2026-10-20

Both `User.rename(u, "x")` and `User.rename("x")(u)` work. The goal is writing `pipe(u, User.rename("x"))` with a pipeline library (fleuve, built separately). A Val is plain data, so method chaining is not available (§1). A breaking change in v0.10.

```ts
pipe(u, User.rename("x"), User.greet); // a member that takes only self can be passed without parentheses
pipe(shape, Shape.match({ Circle: (c) => …, Square: (s) => … }));
```

#### Scope

- **Wrapped:** `.impl` members, `patch`, Trait members (those on a Val's companion and those on the Trait's own companion), the members of an Enum's `.impl` / `implTrait`, `match`, `[Tag].match`
- **Not wrapped:** `seal`, `create`, `implAssoc` members. None of them takes self as the first argument. → On 2026-10-26, `implAssoc` members became wrapped too. Their first argument moves to the end (§6.13)
- **The Trait's own companion members are wrapped too.** The same final can be called two ways, `User.shout` and `Greetable.shout`. If only one were dual, the shapes would disagree. The two are wrapped separately, so `User.shout === Greetable.shout` does not hold. We judged that no user relies on function identity
- **Enum cannot be left out.** `Enum.companion` builds each variant's slot with `Val.companion().impl(fns)`, so its members are dual without extra wrapping. Making only Enum dual later would add constraints to the arguments of `.impl`, a breaking change
- **`dyn` is not wrapped.** A box's methods already have self bound, so wrapping would make `box.rename("x")` return a function. `dyn(companion, value)` does not take self as the first argument either. Currying such as `xs.map(Greetable.dyn(User))` can be added later without a breaking change

#### Arity decides the form

Overloads separate the forms in the types. The problem is telling them apart at run time.

- **`.impl` reads `n = fn.length` once.** A call with `n - 1` arguments is data-last, and anything else is data-first
- **Data-first is not limited to exactly `n` arguments.** `xs.map(User.greet)` passes three arguments. Treating `n` or more as data-first keeps the current behavior
- **Rejected: decide with a predicate.** The brand is a phantom (§2.1). `owned` disappears through `structuredClone` / JSON and cannot mark a primitive. A miss would change the outcome from "one copy" to "wrong behavior"

#### The types forbid omittable parameters

`fn.length` does not count default parameters or anything from a rest parameter on. It counts `a?`, but when `a` is left out, the call is indistinguishable from data-last.

- **Optional and default parameters.** In the types, both become optional elements, so `P extends Required<P>` is false
- **Rest parameters.** Checked with `number extends P["length"]`
- **Parameters that include `void` need no separate check.** TS infers a trailing `a: T | void` as an optional element (`[u: U, n?: void | number | undefined]`), so the check above rejects it. A `void` before a required parameter cannot be omitted (TS2554). Neither can `unknown` / `any` / a type parameter `T`
- **Members with no parameters.** They do not take self, so both the development check (below) and the types reject them. Until then, `.impl({ anonymous: () => "x" })` was allowed. They belong in a plain exported function, later in `implAssoc`
- **The check is placed on `.impl`'s argument.** As with `Grown`, the argument type is intersected with `Arity<M>`. `CompanionMembers` must stay a single function type, or the contextual type of the first parameter disappears (§6.5)
- **Trait implementations are checked too.** `Declarable` rejects a declaration, and `Arity<H>` rejects an implementation in `Trait.companion().impl`. An implementation in `implTrait(Greetable, { toWire: (u, sep = "/") => … })` is assignable to the declared type, so `implTrait` receives the implementation as a type parameter `I` and applies `Arity<I>`. The trait fixture grew by about 2,000 instantiations
- **Remaining hole: a declared type that hides the implementation.** The types see the inferred member type, and the runtime reads the implementation's `fn.length`. When a type annotation hides a default or rest parameter in the implementation, the two disagree. The types pass, and a data-last call silently runs as data-first. Since 2026-10-28, the development check catches it ("Run time" below)
  - Passing an annotated variable or object (`.impl({ toWire })` with `const toWire: (u: User, sep: string) => string = (u, sep = "/") => …`)
  - `implTrait<Sized>({ … })` had the same shape, so it was removed (§15.1 "Removing the type-argument form")
  - **The types cannot close it.** Once annotated, no type retains the fact that a default parameter exists. §9 has the lint rule
  - **Rejected: in development, read `f.toString()` and look for `=` and `...` in the parameter list. → Overturned on 2026-10-28 ("Run time" below).** It misfires on destructuring defaults, comments and transpiled code. Throwing on a false positive breaks correct code. `implAssoc` reads only whether the list is empty, for functions of length 0 only (§6.13)
- **One direction of the `Declarable` check made type instantiation too deep.** Writing `unknown extends Omission<M[K]> ? … : …` caused TS2589 when expanding a recursive Val (`Rec`). `Omission<M[K]> extends string ? … : …` passes
- **What is forbidden is omission, not `undefined`.** `a: T | undefined` is a required parameter, and `f(u)` is TS2554 under `--strict`, `--exactOptionalPropertyTypes` and `--strictNullChecks false` alike. An external optional value can be passed as is: `User.f(u, opts.x)`. The only cost is writing a call that passes nothing as `f(u, undefined)`

#### Run time: throw on functions of length 0 in development

A function wrapped as `(...args) => fn(...args)` has `length` 0. A data-last call silently runs as data-first. A regular member takes self, so `n >= 1`. The types reject members with no parameters, so the check never fires on a regular member. Development throws at `.impl`. Production builds drop the check.

A member that is not a function (`LABEL: "user"`) is attached without wrapping. `__valof_traits`, which `dyn` reads, and `__valof_shared`, which `implTrait` reads, keep the unwrapped functions.

#### Run time: throw on hidden defaults and rest parameters in development, 2026-10-28

Development rejects, from the source, the defaults and rest parameters that a type annotation hid ("Remaining hole" above). `(user, sep = "/")` has `length` 1, so it was attached as a member with one parameter, and `User.toWire("-")` returned a string. The length-0 check cannot catch the second parameter or later ones.

- **Look for a top-level `=` and `...` in the parameter list of the source that `Function.prototype.toString` returns, at any parameter position.** `.impl`, `.implTrait`, `.implAssoc` and Trait and Enum members all go through `createMembers`
- **Defaults and rest inside a destructuring pattern pass.** They do not shrink `length` (`({ a = 1 }, b)` and `[a, ...r]` both have `length` 2), so they do not break the data-last decision. A default on the destructuring pattern itself (`({ a } = {}, b)`) is a top-level `=`, so it is rejected
- **The false positives that were the reason for rejection are avoided by reading tokens.** Strings, templates, regex literals and comments are skipped whole. A template's `${}` counts as a bracket, and closing it returns to the template, so nesting reads correctly too. A `/` after a symbol is a regex, and after a name, a number or a closing bracket it is division. A `/` inside a regex character class does not close the regex. Bracket depth is counted, and only `=` and `...` at depth 1 count (parentheses in a default expression, telling `=>` from `=`). The list is the first `(` outside brackets, which skips a computed key (`[k("x")](a) {}`). If `=>` comes first, it is an arrow without parentheses. `function`, `async`, method syntax and generators read by the same rules. Tests mutated each rule, and every mutation failed a test
- **Remaining false positive: a type that lists only the parameters before the default.** Passing `(u, greeting = "Hi")` as `greet as (u: User) => string` gives one parameter in both the type and `length`, so they agree and nothing breaks. It still throws. At run time, the number of parameters in the type is unknown, so this is indistinguishable from passing `(u, sep = "/")` as `(u: User, sep: string)`. Letting only trailing defaults through would let through the exact shape the check exists to catch, so we do not. Wrapping as `(u) => greet(u)` passes
- **Remaining lexical false positives.** A regex after a keyword (`typeof /x/`) reads as division. `a++ / 2` reads as a regex. Both matter only inside a destructuring default
- **Keep the check and improve `hidesParameter` (the user, 2026-10-28).** Breaking the convention has a large impact: a data-last call silently runs as data-first
- **Misses.** Bound and native functions have the source `() { [native code] }`, so their list looks empty. Defaults and rest transpiled to ES5 move into the body, so they are invisible
- **The length-0 check stays on the `.impl` side.** `() => "x"`, with an empty list, has no defaults or rest. The message is split in two (defaults / rest, and members that take no value)
- **Dropped in production.** `hidesParameter` is called only under `development &&`, so it drops out of the production bundle. bundle-size confirmed that the Val production gzip stays at 965 B
- **Rejected: parse with a parser (acorn or similar).** It adds a dependency, which also lands in users' development bundles. Lexical rules read every shape above
- **Rejected: move the check to lint only.** Lint sees both the annotation and the implementation, so it avoids the false positive above, but it is opt-in and cannot follow shapes across files. The lint rule is added anyway (§9)
- **Rejected: import valof-lint's function at run time.** The linter depends on `oxc-parser` (a native binding), an optional peer. Development code also runs in the browser, so it cannot load it, and even the wasm build would bloat users' development bundles. The linter has an AST, so it has no need for the runtime code either
- **oxlint's `typescript/no-useless-default-assignment` catches some cases.** When the annotated type does not include nullish, it warns that the hidden default is "an unused default". The tests suppress it. Input for the lint rule in §9

#### Overloads put data-first last

When the function is passed as a callback, TS uses the last signature.

```ts
declare const greet: { (): (self: U) => string; (self: U): string };
pipe(u, greet); // string
[u].map(greet); // string[]
```

#### One rest-parameter wrapper

```ts
const dual = (f) => {
  const n = f.length;
  return (...args) => (args.length === n - 1 ? (self) => f(self, ...args) : f(...args));
};
```

Node 24.21, `NODE_ENV=production`. Ten members wrapped with the same wrapper and called from separate call sites (close to the companion's conditions). Third round of 10 million calls. The variance between two runs is within 0.5 ns.

| form        | data-first | data-last |
| ----------- | ---------- | --------- |
| direct call | 4.5 ns     | —         |
| rest        | 13.1 ns    | 18.4 ns   |
| fixed arity | 8.1 ns     | 14.7 ns   |

- Materializing the variable-length arguments is most of the cost. Replacing the spread with `apply` does not shrink it
- **Accept the +8.6 ns of rest.** `User.patch` takes 139 ns, so the share is small. Getter and predicate calls take twice as long
- **Rejected: fixed arity (`function (s, a) { return arguments.length === 1 ? … }`).** It costs only +3.6 ns, but each additional arity adds about 20 B. Covering up to 4 including self exceeded the Val budget by 9 B, measured before #70

#### Cost

Production gzip, 2026-10-20.

|                 | before | after  |
| --------------- | ------ | ------ |
| Val             | 858 B  | 900 B  |
| Trait increment | +84 B  | +103 B |
| Enum increment  | +491 B | +521 B |

- The development check costs 0 B. `dual` lives in `src/dual.ts`, and Enum and Trait use it too. `development` moved to `src/env.ts`. If dual.ts imported it from val.ts, the two would import each other
- 124 B of the Val budget remains for `implAssoc`. A minimal prototype took about 82 B

Instantiations (`vp run type-perf`):

| fixture      | before   | after    | budget          |
| ------------ | -------- | -------- | --------------- |
| core         | 6,456    | 6,921    | 10,000          |
| trait        | 15,615   | 19,829   | 17,000 → 22,000 |
| enum         | 39,996   | 46,923   | 90,000          |
| `index.d.ts` | 67.46 kB | 70.37 kB | 96 kB           |

- **The trait budget went up.** About half the increase is `implTrait`'s `I` (above). Removing it would let an implementation with a default parameter silently misbehave at run time. The rest is the `Duals` of the Trait's companion (about 1,200), the omission check, and the Val's `Duals`
- Removing the `void` branch cut about 650

#### A generic member loses its type arguments in data-last form

```ts
const User = Val.sealer<User>().impl({ pick: <K extends keyof User>(u: User, k: K) => u[k] });
User.pick(u, "name"); // string
User.pick("name"); // (self: User) => string | number
pipe(u, (v) => User.pick(v, "name")); // string. Wrap data-first in an arrow function
```

`Dual<F, S>` builds the data-last type from the member type `F`. When a conditional or mapped type decomposes `F`, TS first erases the type parameters to their constraints (`unknown` without a constraint). Fixing the first parameter to `V` changes nothing. The erased `K` appears in the remaining parameters and the return type.

- **No type-level means can instantiate a generic function type.** An instantiation expression (`typeof f<"s">`) works only on values. An `F` received as a type parameter cannot be written as `F<"s">` (TS2315). This gap is separate from higher-kinded types (passing a type constructor as a type argument), but both have the same root: a TS type argument takes only a complete type
- **Only call inference preserves type parameters.** That happens when a generic function is passed directly as an argument and the call returns a function type with one signature (`last(g)` is `<K>(k: K) => (self: U) => U[K]`). A dual member has two signatures, so it cannot meet this condition by construction
- Probed with TS 7.0.2. Every attempt lost the type parameters
  - Make the match target of a conditional type generic (`F extends <A extends unknown[]>(self: S, ...args: A) => infer R`). It does not match
  - Let the data-last signature take the argument types itself and build the return value by matching against `F` (`<const Args extends A>(...args: Args) => (self: S) => Ret<F, S, Args>`). `Args` is inferred as `["s"]`, but matching in `Ret` widens `T` to `string`. `C.g<["s"]>("s")` too
  - Give data-last its own type parameter (`<T = unknown>(k: T) => …`). `T` arrives but cannot be applied to `F`
  - A reverse mapping that receives the arguments and return value as a record per member. The link between type parameters breaks, and a generic member is no longer assignable
  - Register members one at a time, `.impl("pick", g)`. The return value is an object, so call inference does not apply
  - A per-member wrapper `dual(g)`. Typing its return as an overload or an intersection loses the parameters. A single signature keeps them but loses the data-first type
- **A fixed-arity wrapper changes nothing.** The wrapper's shape is a run-time matter, and `Dual` decides the type. Generics survive in Effect's `dual` because the author writes the two signatures by hand (`effect/src/Function.ts`, which returns `DataLast & DataFirst`)

#### Rejected: write the type with `annotate`, 2026-10-20

The author writes both signatures and marks the member with an identity function. `Duals` does not derive a marked member and uses the written type.

```ts
import { annotate } from "valof";

Val.sealer<User>().impl({
  pick: annotate<{
    <K extends keyof User>(k: K): (self: User) => User[K];
    <K extends keyof User>(self: User, k: K): User[K];
  }>((u, k) => u[k]),
});
```

The types behaved as the probe showed (TS 7.0.2). `pick("name")` is `(self: User) => string`, the implementation's `k` is `keyof User`, and a return value that disagrees with the written type fails with TS2322. Two reasons not to adopt it:

- **It does not work for a Trait.** The companion types of `Trait.companion().impl` and `implTrait` are built from the Trait declaration (`Unbound<MembersOf<Tr>>`), not from the members passed. The types accept `annotate`, and it does nothing. Making it work needs a way to write dual types in the Trait declaration
- **An arrow function is enough.** `annotate` means writing two signatures per member, with their type parameters. An arrow function adds only `(v) => …` per call, and the rule is the same for Val, Enum and Trait. We expect few companion members to be generic

It is additional API, so adding it once someone asks is not a breaking change. At that point, design the Trait declaration side along with it.

- **Rejected: export `dual`.** The name promises wrapping at run time, but outside a companion `add(2)` does not become data-last. Wrapping at run time would need a mark so that `attach` does not wrap twice, and the Val core would pay for it
- **Rejected: pass it as `.impl(({ dual }) => ({ … }))`.** It would make the function unusable from outside, but it brings back the callback form removed in §15.4 (two rules, and heavier enum types)
- **Rejected: export only the type and annotate with `as`.** It does not check the implementation against the written type
- **The type parameters cannot be left out.** Both signatures write `<K extends keyof User>`. A type alias's type parameters are separate from a signature's type parameters, so the duplication cannot be removed

#### A member that takes only the value has no data-last form, 2026-10-27

For `over: (s) => s.n > 1`, `over()` only returns `over` itself and has no use. `over` is already a one-parameter function, so `pipe(size, BundleSize.over)` works. A breaking change in v0.11 (the user).

- **Types.** `Dual<F, S>` returns `F` alone when the parameters after the value are `[]`. `Loose<F>` also returns `F` when the parameters after the first are `[]` (zero or one parameter). `M.member()` is a type error
- **The trigger was a lint false positive.** `xs.filter(BundleSize.over)` triggered oxlint's `no-unnecessary-condition` (§19). tsgolint 7.0.2001 reports it when any signature always returns truthy, whether as an intersection or as overloads. Swapping the order does not help, and neither does the other signature returning `boolean`. It does not report a plain function. Not reported upstream (the user)
- **A member with one parameter (and with zero for `implAssoc`) is attached unwrapped, via `f.bind(undefined)`.** Both `impl` and `implAssoc`. Returning `f` unwrapped would make `this` in `User.greet(u)` the companion, which disagrees with `ThisType<undefined>`. The zero-parameter `implAssoc` members in #95 did exactly that. The call cost of going through the wrapper disappears too
- **`impl` and `implAssoc` are treated the same (the user).** Binding only in `implAssoc` would split behavior on a difference the types do not show, so we do not
- **`dual` only wraps (the user).** `createMembers` (formerly `duals`), which receives the record, decides between `bind` and `dual` and runs the development checks. Adding `bind` to `dual` would give it two responsibilities. The function `loose` became `createMembers`'s second parameter, `loose`
- **Cost.** Val 967 → 965 B. Instantiations: core 7,214 → 7,186, trait 18,320 → 17,642, enum 36,361 → 35,703

#### Rejected: a namespace for data-last (`User.$.rename("x")`)

It reads no better than wrapping in a closure.

#### Rejected: a placeholder `__`

`User.f(u, __, c)` would pass arguments other than the first later. Partial application of anything other than the first argument can be written as an arrow function (`(b) => User.f(u, b, c)`). Together with `implAssoc`, it exceeded the budget by 40 B (measured before #70). The types are heavier than dual alone too, because each position accepts `T | typeof __` and the return type is built from the remaining arguments.

### 6.12 One entry point: `.seal`, 2026-10-21

This came out of the `implAssoc` discussion. `Val.sealer` / `Enum.sealer` are removed, and `companion` is the only entry.
A breaking change in v0.11.

```ts
const User = Val.companion<User>().impl({ greet: (u) => `Hi, ${u.name}` });
const bob = User.seal({ id: "a", name: "bob" }); // the default seal when there is no implSeal
```

**Sealing is always `X.seal(p)`.** A companion is not callable. Without `implSeal`, it exposes the default seal (typed
`(value: SeedOf<V>) => V`, with `.nocopy`).

- Call syntax reads as "construction that cannot fail" (TS's `new` cannot return a Result either). With `.seal`, the name
  shows that the value passes a gate. The verb `seal` reads as "give it a brand", which conveys how valof thinks
- Adding `implSeal` later does not change how call sites are written. Only the return type changes
- Every entry point has a name (`seal`, `create`, and `implAssoc`'s `from*` / `parse*`)
- A companion is no longer a function. That removes the `useState(User)` accident and the reason to set `name` / `length`
  with `define` (`define` stays for `__proto__`)
- The cost: nested construction gets longer (`Order.seal({ lines: [Line.seal({ … })] })`). Rust is about the same
- `nocopy` is no longer a reserved name. It protected the sealer's `nocopy`, which now lives at `X.seal.nocopy`

**Rejected: unify on `User()`.** An entry point that can fail would look like construction that cannot fail.

**Rejected: call syntax for the default seal, `.seal` for a custom seal (one companion, two entry points).** Adding an
invariant would change how every call is written, even for a seal that only normalizes (`Math.round`).

**Rejected: hide it with `.implSeal(null)`.** It reads as "there is no seal". In fact `patch`, `create` and `implAssoc` go through it.

**Rejected: `implSeal.private(fn?)`.** To hide the default seal, `implSeal.private` would be called with no argument. And for an Enum, it does not
clearly say that every variant is hidden.

#### A step that hides the seal: not added

`.private<K extends "seal" | "create">()` (a type-only step, like `fixed`) was added once and removed in the same PR.
It moved to the companion's type argument (`Val.companion<User, [PrivateSeal, Unpatchable<"id">]>()`, 2026-10-22).

- **A declaration that works only in the types was written as a value step.** A step that does nothing at run time stayed in the chain,
  and it caused problems with the order of the first half of the chain and with reserved names
- **Hiding `seal` alone is enough.** Exposing `create` does not break the invariant, because its output always goes through the seal.
  Exposing `seal` lets a caller pass the fields `create` should generate (`User.seal({ id: "forged", … })`). Hiding `create` only tidies the public surface, and the docs' three steps (parse goes in `implAssoc`,
  generation in `create`, checks in `seal`) cover that
  - **2026-10-24: `PrivateCreate` was added (§15.2 "Build with one chain").** It still does not protect the invariant,
    but some cases need a way to tidy the public surface. An Enum variant gets a default `create`, and you may want to remove it rather than
    replace it with `implCreate` (so the variant is built only through `Shape.seal` or another function). Like `PrivateSeal`, it hides both the default
    and the one from `implCreate`. §15.2 compares the names
- **`fixed` moves to the same type argument and becomes `Unpatchable<K>`.** It blocks only the type of `patch`. The reason §6.10
  rejected `unpatchable` (it restricted two derivation paths but read as `patch` only) disappeared when `update` was removed (§6.4).
  It does not become a type-side `Fixed<T>` (attached to a payload field). It restricts `patch`;
  it is not a property of the field
- **The name is `PrivateSeal`.** The fields stay readable, and only the path that creates values is closed. The same shape as Kotlin's `private constructor` and
  Scala's `case class X private (…)`. OCaml's private type (readable, but not constructible from outside) is the closest
  - **Rejected: `opaque`.** Opaque types in Scala 3 / Flow hide the contents too. A valof value's fields are readable
  - **Rejected: `unsealable`.** It also reads as "can be unsealed (opened)", which mixes it up with `Val.unwrap`. It also reads as a property of the type, which contradicts `create` and `patch` going through the seal
  - **Rejected: `hideSeal`.** A declaration that works only in the types is an adjective (§6.10). A verb reads as doing something at run time
- **Rejected: a form that hides any member.** Sibling members call each other through the companion's name, so a hidden member could not be called by its siblings either.
  A helper you want to hide becomes an unexported module function. `patch` cannot be hidden either, because the only way a member can call it is `User.patch`
- In an Enum, `PrivateSeal` removes `Shape.seal` and the `seal` of every variant. It is not set per variant. A variant's
  `.create` is currently a seal that adds the tag, so per-variant hiding comes when the variant entry points are reorganized (§9)
  - **Rejected: private per variant.** `Shape.seal` passes the payload to the variant's slot by tag, so it reaches a hidden variant
    from there. Making it refuse would shift what `Shape.seal` means and make the behavior implicit
  - To protect only one variant, move what needs protecting into a Val in the payload, and hide that Val's seal
    (`Pending { id: PendingId }`)
- On a type with `PrivateSeal`, members cannot call `User.seal` either. Until `implAssoc` (§9) arrives, the only paths that create values are
  `create`, `patch` and `Val.of`

#### Markers are passed as a tuple, 2026-10-22

```ts
Val.companion<User, [PrivateSeal, Unpatchable<"id">]>();
```

The constraint is `const O extends readonly (PrivateSeal | Unpatchable<keyof SeedOf<V> & string>)[] = []`. A marker is
a phantom class, like `Tag` (on 2026-10-25, `PrivateSeal` became the class itself, §18.4). Every mistake fails at the position of `O` (`[Unpatchable<"idd">]`, `["id"]`,
`Unpatchable<"id">` without the brackets). Two `Unpatchable`s exclude both keys.

**Rejected: an intersection of markers (`PrivateSeal & Unpatchable<"id">`).** The first probes used this form.

- In `Unpatchable<"a"> & Unpatchable<"b">`, the literal-typed properties conflict and the whole intersection collapses to `never`.
  `never` satisfies every constraint, so the constraint on `O` cannot reject it. It silently excludes nothing. A `PrivateSeal` in
  the intersection disappears with it, and the seal is exposed
- The only way to reject it is to put the check in the constraint on `V` (`V extends AnyVal & NotEnum<V> & Markers<O>`). The error
  appears at `User`, and the cause is unclear until you read the message. Writing it in the constraint on `O` makes
  `unknown extends O`, which detects the default, fail with TS2313 (circular constraint)
- With `never` as the default, an unrelated type (`"id"`) can be rejected at `O`, but the form that writes `Unpatchable` twice resolves to the same type as the default,
  and nothing can reject it
- To reject unrelated types, we also looked at an object type with optional keys instead of a phantom class.
  TS2559 rejects them, but the `__valof_*` keys show up on hover. A tuple rejects them while the markers stay phantom classes

**The third type argument of Trait and Enum stays an intersection.** Those are type declarations, and this is companion configuration. The reasons §15.1
gave for rejecting a tuple for Trait (the intersection is the core of the mechanism, and the fold would land on `Val`, the most instantiated type)
do not apply here. The options are only read, and a companion's type argument is instantiated only once per type.
`[PrivateSeal | Unpatchable<"id">]` reads as specifying both. That rarely departs from the intent, so it is not rejected.

**Measured.** type-perf: core 6,885 → 6,866, trait 17,649 → 17,729, enum 44,827 → 44,895, `index.d.ts`
68.45 kB → 69.66 kB (mostly the JSDoc of the two markers). Production gzip: Val 897 → 887 B.

#### Chain order

```ts
Val.companion<Account, [Unpatchable<"id">]>()
  .implSeal(seal) // first half: implSeal → implCreate
  .implCreate(create)
  .impl({ … }) // second half: impl (once) and implTrait (any number of times), in any order
  .implTrait(Named, { … });
```

**The first half configures the gate, and its order is fixed.** Each step appears once.

- Later steps depend on their results. The types of the `seal` / `create` passed to the `implAssoc` callback are decided here.
  The output of `create` goes through the seal
- `implSeal` states invariants and is close to a type, so it comes before generation
- A step written too late explains why (`` write `implSeal` before `implCreate` ``). The message is placed in the parameter type, so the error is not
  TS2339
- A step written a second time is just removed from the type. TS2339 reads clearly enough there

**The second half registers members, in any order.** The registrations do not depend on each other. Members call each other through the companion's name.

- Once a second-half step is written, the first-half steps disappear from both the type and the runtime
- **`impl` does not close the chain.** §15.4 made it close the chain so that no seal step would remain, and now the seal steps
  drop at the first second-half step. `impl` itself appears once
- The types reject duplicate names in either direction. Even when `implTrait` comes after `impl`, `Takes` rejects it with
  "another member already answers to one of these names"
- The docs only show the recommended order. Following Rust: `impl` → `implTrait`

**2026-10-24: Enum step order moved to §15.2 "Build with one chain".** What follows records the state at the time.

**For an Enum, only `implSeal` is in the first half.** `impl` (once), `implVariant` and `implTrait` come in any order, and writing any of them
removes `implSeal`. This made §15.2's `Before` (which forced `implSeal` before `implVariant`) unnecessary,
so it was removed. `implVariant` goes away when the variant entry points are reorganized (§9), so we chose the shape with the fewest changes.

**Measured.** type-perf: core 6,921 → 6,885, trait 17,844 → 17,649, enum 46,593 → 42,954, `index.d.ts`
72.17 kB → 68.43 kB. Production gzip: Val 898 → 897 B, Enum increment +519 → +442 B (the callable slots and the Proxy's
`apply` are gone). While `.private` was in, core was 7,012 and Val 903 B.

#### Sorting out things that can be written two ways

- **The argument-less `.impl()` is removed,** for Enum and variants too. It existed to close the chain, but `impl` no longer
  closes the chain, so it has no purpose. `Val.companion<X>()` is a companion as is (since 2026-10-23,
  `.build()` closes the chain. See "Close the chain with `.build()`" below)
- **Kept: a trait's final can be called by two names,** `User.shout(u)` and `Greetable.shout(u)`. Inside a generic
  function (`<T extends Greetable>`), only the trait side can call it
- Two forms on purpose: data-first / data-last (§6.11), `patch` and `seal({ ...u, x })` (identity and deep
  merge), `X.seal` and `Val.of` (for types without a companion. On a type with one, `bypassed-companion` warns)

#### Close the chain with `.build()`, 2026-10-23

All three of Val / Enum / Trait start with `.companion()` and close with `.build()`. This overturns the rejection in §13.6.
A breaking change in v0.11. Existing code migrates by adding `.build()`.

```ts
const User = Val.companion<User>().impl({ … }).build();
const Shape = Enum.companion<Shape>().implSeal(…).build();
const Greetable = Trait.companion<Greetable>().impl({ … }).build();
```

**§13.6's reasons for rejecting it, and where they stand now:**

- "Longer in every case": still true. A Val with no members writes `.build()` too. The entry point's name does not change
- "`.build()` is pure ceremony", "in TS the object literal is the builder": back then it was a single `.impl({…})`.
  Now `implSeal` / `implCreate` / `impl` / `implTrait` line up, and the chain of steps itself has become the builder. The Enum
  rebuild (§9) adds even more steps
- **`sealer` is removed (above).** `sealer()` strongly reads as "returns the companion as is", and it does not read well with `.build()`
  after it. `companion().build()` reads as "assemble the companion"

**What it solves:**

- **Detach.** A closed companion has no steps, so the types do not allow `User.impl(evil)` or `Shape.implSeal(evil)`.
  `detached-impl` (§9) became unnecessary and was removed. "A companion is defined in one place" turns from a lint rule into a type invariant
- **Reserved step names.** Members and steps no longer share an object, so Val / Trait members and Enum
  variant names can be `impl` / `implTrait` / `build`. `Steps` was removed from `Rejected`, and the step names from `Fault`.
  The same goes for the linter's `RESERVED`
- **Completion.** A companion shows only `seal` / `create` / `patch` and the members
- The same shape as a Rust builder

**What it does not solve:**

- **A second companion.** A path that builds `Val.companion<User>().implSeal(evil).build()` elsewhere remains.
  `split-companion` / `companion-mismatch` handle it
- **The slot returned by the `implVariant` callback.** (2026-10-24: closed by removing `implVariant`, §15.2.) The current slot is attached to the companion with its `impl` / `implSeal` still on it, so
  the types accept `Shape.Circle.implSeal(evil)`. `implVariant` goes away in the Enum rebuild, so this PR left it
  alone. With `detached-impl` removed, lint does not catch it either until the rebuild
- **The rebuilt E reserves variant names again.** (2026-10-24: reserved, §15.2.) This is because the builder lists `.Circle` alongside the steps. `build` is
  added to the reserved names then

**Guidance when `.build()` is forgotten.** The error appears at the use site (not at the definition). The builder's `seal` /
`create` / `patch` (Val), `seal` / `match` (Enum) and `dyn` (Trait) have the type `CallBuildFirst`.

- `User.seal(p)` gives "Type 'CallBuildFirst' has no call signatures". Passing the builder to a function that takes a companion
  descends to the `seal` mismatch, and `CallBuildFirst` appears
- **What appears is the type's name, not a string inside it.** So the name itself is written as an instruction. Rejected: the probe's
  `Unbuilt`, which does not say what to do
- **The guidance covers every library-provided name on a companion.** A user's member (`User.greet`) cannot be covered and
  shows up as "not in `CompanionBuilder<…>`"
- The run-time builder has none of these names

**Run time.** The builder is a plain object with only the steps and `build`. Only the types enforce step order
(before, second-half steps also removed first-half steps at run time, because members could take step names). The Enum builder
no longer uses a Proxy, and `build()` returns the Proxy companion as before. Only the companion needs to know the variant names.
The Proxy no longer reads step names, so `Shape.impl` is the slot of a variant named `impl`.

**Measured.** type-perf: core 6,866 → 6,544, trait 17,729 → 17,120, enum 44,895 → 45,815, `index.d.ts`
69.67 kB → 69.95 kB. Production gzip: Val 887 → 857 B, Enum increment +449 → +415 B, Trait increment
+108 → +110 B.

#### Keep the Proxy

- The `dyn` Proxy stays. It fits the meaning of a box that wraps a value and adds behavior. Options compared: a shallow copy
  (`equals` would compare functions), a method prototype (an extracted method loses `this`), a box that does not expose
  the fields (the API changes)
- The Enum Proxy stays. Effect uses this shape too, and a companion is not passed around, so its behavior can be seen as part of the types
- **Rejected: pass the variant names at run time.** The names would be written twice, and the argument order would break

### 6.13 `implAssoc`: members that do not take the Val, 2026-10-26

**Members that do not take the Val (`from*`, `parse*`, constants, aggregation over a `Dyn` array) get a step separate from `impl`.**
It exists on Val and Enum companions, on Enum variants, and on Trait companions.

```ts
const User = Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => (u.name ? seal(u) : undefined))
  .implAssoc(({ seal, create }) => ({
    fromForm: (form: FormData) => create({ name: String(form.get("name")).trim() }),
    fromRow: (row: Row) => seal({ id: row.id, name: row.name }),
  }))
  .build();
```

It came from the shumoku-next scripts (valof 0.8.2). `SectionId.mint(used, count)` and
`Command.parse(argv)` could not go on the companion, so they became functions outside it.

#### Why a separate step

- **Types do not exist at run time.** If one `impl` sorted members by their annotations, the library could not tell the kinds of members apart at run time.
  `impl` members are wrapped with `dual`, `implTrait` copies a Trait's default implementations from `[Shared]` onto the Val, and
  `dyn` reads `[Traits]`. Each of these must exclude associated functions
- **The types get weaker.** See "Rejected: keep `impl` and tell members apart by annotation" below
- The same shape as the object-oriented split between static methods and methods (the user). Rust separates them within one `impl` by
  the presence of `self`, which it can do because `self` is syntax. A JS function carries no receiver mark at run time

#### Name

- Taken from Rust's associated function. `impl` + one word, like the other steps
- **Rejected: `implStatic`.** This is not a class, and `impl` members are also functions on the companion, so the word does not distinguish them
- A Trait's `implAssoc` differs from an associated fn on a Rust trait (an `fn default() -> Self` that the implementer provides).
  It corresponds to Rust's `impl dyn Trait { … }`. A declaration requiring implementers to provide associated functions would go on the Trait's
  type declaration side, so it would not collide with the step name (the user)

#### What it passes

- **For a Val and a variant: the companion's `seal`, `create` (only with `implCreate`) and `patch`.** The same `Supplied` as `impl`
  (§15.4). For an Enum's union: `seal` and `create`
- **The `seal` it passes is the companion's seal.** That is the `implSeal` one if present, and the default seal otherwise. "Every path that makes a value
  goes through the seal" (§6.8) holds for `from*` too, and an `implSeal` added later applies to `from*`
- **It passes them even when private.** Even on a type with `PrivateSeal` / `PrivateCreate`, the author's own code receives them
- **A Trait receives nothing.** `dyn` cannot wrap a value in a box without knowing the Val's companion, so anything passed would be unusable
  (the user)
- **A member calls `seal` itself, so it can fail while building the payload.** §6.8 did not allow this for `create` and
  pushed it out to a plain exported function. The library does not look at the return value, so §6.3 still holds
- **Three roles.** `implSeal` checks, `implCreate` generates, and `from*` only prepares the arguments and passes them to `seal` or `create`

#### Make them dual

**`implAssoc` members are dual too.** This overturns "not wrapped" in §6.11 (the user). The first argument just moves to the end,
and the rule matches methods. Partial application of anything other than the first argument is written as an arrow function.

- **A member with no parameters is attached unwrapped.** `dual` decides by argument count, so wrapping would make `Money.zero()` return
  a function. The development throw in `impl` stays as is. → On 2026-10-27, such members became attached via `f.bind(undefined)`.
  Attached as is, their `this` would be the companion. A member with one parameter has no data-last form either (§6.11)
- **The types forbid omittable parameters.** The same `Omission` as `impl` applies, allowing only functions with no parameters (`LooseArity`).
  TS's `radix?` vanishes at run time, so mistaking `parse(raw)` for data-last cannot be caught at run time
- **So a member that references the companion annotates its return type.** The same rule as `impl` (the user).
  The check's `infer` tries to resolve the member's return type in the middle of inference, which loops and causes TS7022 / TS7023.
  Confirmed on a minimal model (loops with the check, passes without it). A comparison without `infer` does not loop, but it
  cannot detect optional parameters. The annotation `impl` needs when it references the companion probably has the same cause, `Arity`.
  A prototype before the check was added could reference it without annotations
- **Development reads the source of functions of length 0. → On 2026-10-28, this was replaced by a check that looks for a top-level `=` and `...` in the list regardless of length (§6.11 "Run time: throw on hidden defaults and rest parameters in development"). That also fixed the remaining false positive below (computed keys).** `length` is 0 when there are no parameters, and when the first parameter is
  a rest parameter or has a default. The latter silently runs a data-last call as data-first
  (a type-annotated wrapper returned by `memoize(fn)`). It strips comments from the `Function.prototype.toString` output, and
  throw if the parameter list is not empty
  - This asks a different question from "look for `=` and `...` in `toString()`", which §6.11 rejected. It only checks whether the list is empty,
    and only for functions of length 0. Every non-empty list is a forbidden shape, so destructuring defaults are correctly rejected too
  - It errs only by missing cases. A `bind`-ed function, a built-in function, and rest transpiled to ES5 look empty
  - The remaining false positive is a method with parentheses in a computed key (`[k("x")]() {}`)

#### Names and storage

- The types forbid the same name across `impl` / `implTrait` / `implAssoc` (`Grown`, `Takes`). On the companion they
  become properties of the same object
- The reserved names are the same as `impl`'s (Wired). An Enum's union also rejects the variant names and `match`, and a Trait rejects the names of its declared members
  (including non-`Final` ones, since all of them are attached at run time) and `dyn`
- **Registered in storage separate from `impl`** (`Registered.assoc`). A Trait does not put them in `[Shared]`. `implTrait` can substitute the Val for the first parameter of a
  default implementation, but not of an associated function (the user)
- A second-half step that can be written any number of times. The first `implAssoc` closes the first half (`implSeal` and `implCreate`), because
  the type of the `seal` it passes is decided there. `impl` still appears once
- Variants have it too ("a variant has every Val step"). At run time it comes from the shared `steps` (§16.3)
- To create a variant from an Enum's `implAssoc`, reference `Shape.Circle.create(…)` and annotate the return type
  (the user). The variant constructors are not passed

#### Types

- **The assoc members go in the last type argument of `Companion` / `EnumCompanion` / `TraitCompanion`.**
  With `build: () => Companion<…> & A`, a user's emitted declarations lose the alias name and expand, failing with TS4023 /
  TS7056. The ts-compatibility declaration fixture covers this shape. Reverting to that shape made ts-compatibility
  run for more than 10 minutes without finishing, instead of reporting an error
- A step function's parameter is wrapped in `NoInfer` (§15.4, #94). Without it, instantiations jump for functions that take parameters

#### Remaining hole: invariant checks in `from*`

On a companion without a seal, an invariant check written in `from*` is skipped by `patch`, which goes through the default seal.

```ts
Val.companion<Money>().implAssoc(({ seal }) => ({
  fromCents: (cents: number) => (cents >= 0 ? seal({ cents }) : undefined),
}));

Money.patch(money, { cents: -1 }); // passes
```

- Neither the types nor lint can prevent this precisely. A parse failure and an invariant check both "reject some inputs"
- The same hole already exists (a `create` that throws, an exported function that calls `Val.of`). `implAssoc` adds one more place to write it without a warning
- The docs say "write invariants in the seal". Parsing has two layers. Decoding (wire format → payload) is
  `parse*` / `from*`, and refinement (payload → Val) is the seal alone
- **No lint rule.** One would have to look for "members with an exit that does not produce a value", and parsers for types with no invariants
  (`Point.fromString`) would be false positives

#### Measured

Production gzip: Val 899 → 967 B (budget 1.00 kB), Trait increment +101 → +105 B, Enum increment +465 → +456 B.
The three loops that attach members were merged into one `duals` (taking `wrap` as an argument). Before the merge: Val 976 B,
Trait +126 B, Enum +470 B. type-perf (after adding `implAssoc` to the fixtures): core 7,214, trait 18,320,
enum 36,361. `index.d.ts` 82.49 → 87.47 kB (after trimming the JSDoc caveats).

#### Rejected options

- **Keep `impl`, and treat a member as associated when its first parameter is annotated.** Overloads are chosen for the object as a whole,
  so a single annotated member makes the unannotated first parameters silently `any`. A mapped type that checks each member
  works, but it was sensitive to how the conditional type was written. A typo such as `note: Nota` would also pass as a function taking another type.
  The run-time distinction is covered in "Why a separate step" above
- **Pass the default seal.** `from*` would silently bypass the custom seal, and an `implSeal` added later would not apply
- **Pass no `seal` to a companion without a seal.** `Val.of` is public, so there is nothing to protect
- **Remove `implCreate` and have people write it with `implAssoc`.** It would lose `create.nocopy`, which the call site chooses, and
  the type-level restriction of `implCreate.noseal` (§9) that it "cannot take arguments"
- **No wrapping (the original decision in §6.11).** See "Make them dual" above
- **Make them dual and drop the parameter check.** The companion could be referenced without annotations, but a data-last mix-up with
  `parse(raw, options?)` would pass silently
- **Accept both the callback form and the object form.** A step takes a function (§15.4)

The naming lint (`from*` / `parse*` / `create*`), the reference lint, and `unused-member` covering `implAssoc`
come after the lint rewrite (§9).

---

## 7. What was deferred (and why)

Each of these follows from the one-line principle in §1.

### 7.0 Gating the constructor

See §6.1. Once `Val.sealer` took over generating the constructor, nothing needs detecting or replacing. A constructor that is never generated cannot be bypassed.

### 7.1 Freezing at run time

**Valof does not always freeze. It freezes only in development.**

The real hole in immutability was aliasing, and the copy in §4.1 closed it. Freezing additionally stops only writes that deliberately break `readonly`. They do not require `as`: `Object.assign(v, {...})` and `const r: Record<string, unknown> = v; r.k = 1` type-check without a cast. Writing to a value is still a deliberate act.

|                       | fresh input | children already Vals | flat, 3 keys |
| --------------------- | ----------- | --------------------- | ------------ |
| copy only             | 853         | 833                   | 44           |
| copy + freeze         | 1,216       | 1,182                 | 63           |
| copy + WeakSet reuse  | 1,055       | 220                   | 142          |
| copy + freeze + reuse | 1,387       | 258                   | 162          |

Freezing adds 25-30% across the board (ns/op). On reads, object property access is unaffected (3.54 vs 3.99 ns), but **array element access becomes 1.7x slower** (5.42 vs 3.11 ns, because V8 transitions the array to `PACKED_FROZEN_ELEMENTS`).

Valof freezes in development because the node sharing in §4.1 **widened the damage an immutability violation does**. When a cast lets code overwrite a value, only that one value used to break. Now the change reaches every value that shares the node.

- The check reads `process.env.NODE_ENV`, as `assertPlainObject` does. It lives in the module constant `development`, so a production build folds the whole branch away
- **The production gzip size does not change** (only the development build grows, by about 20 B)
- `Val.unwrap` runs with `sealing = false`. That one flag turns off three things at once: sharing, registering and freezing. `Val.unwrap` promises a mutable copy, so it needs all three off

**Freezing detects mistakes during development. It guarantees nothing.** In production, `Object.isFrozen` returns `false`.

### 7.2 Map / Set

`ReadonlyMap` / `ReadonlySet` exist only in the types. At run time the value is a plain Map. `Object.freeze` does not stop its mutation, and a Map does not survive JSON.

Wrapping it in a custom immutable type is rejected too.

- `JSON.stringify` produces a custom shape. A `toJSON` does not make parsing restore it, so "crosses any boundary" degrades to "crosses a boundary through a dedicated serializer"
- A wrapper with methods is in effect a class, and `structuredClone` drops its prototype. That defeats the purpose of avoiding classes in the first place

On top of that, `structuredClone` **breaks the reference identity of keys**.

```ts
const key = { id: 1 };
const m = new Map([[key, "v"]]);
structuredClone(m).get(key); // undefined
```

A Map keyed by objects loses its lookups the moment it is cloned. Keys would have to be primitives, and then `Readonly<Record<string, T>>` covers almost every case (§8.1).

If O(1) lookup ever becomes necessary, the value can stay a plain array with an index cached in a WeakMap. That can be added later without breaking anything.

### 7.3 Date / Temporal

**Both are removed from the allowed types.** Use an ISO 8601 string (`string`) or epoch milliseconds (`number`).

`Date`:

- Its mutators write to internal slots, so `Object.freeze` does not stop them. That contradicts the claim of immutability
- Its JSON round trip is asymmetric: `JSON.stringify` turns it into a string, and `JSON.parse` does not turn it back
- The default deep equals would compare it by reference, so it would need special handling

Wrapping it in a custom type is rejected for the same reasons as §7.2. Besides, once the wrapper grows date arithmetic (`addDays` / `diff` / formatting), **valof is writing a date library**. Time zones, DST, month ends and locales are open-ended work, too much for a value-object library to take on as a side task. A thin wrapper with no methods gains nothing, because the caller takes the date out anyway.

`Temporal` is immutable, so it is less bad than `Date`. Still, it is a class instance, and its JSON round trip is just as asymmetric. Allowing it would still make an exception to "plain objects only".

Without them the allowed types are just `Primitive | Val | ReadonlyArray | Readonly<Record>`, so **one line explains them**. Users do date arithmetic with whichever library they like (Temporal / date-fns / Luxon).

The core feature already covers the need to guarantee an ISO string in the type (§8.2).

### 7.4 TaggedEnum (as in Effect.ts)

An ADT needs its discriminant **as real data**, which breaks the premise that the brand is a phantom.

Also, nearly all the value of an ADT lies in the quality of its pattern matching, and ts-pattern is already strong there. Interop with it makes more sense than competing.

Deferred for v1. If valof adds it, it goes in a separate entry point.

### 7.5 Result type

See §6.3.

### 7.6 Dispatching from a parent to a child's custom equals

**2026-09-15: `implEquals` is withdrawn (§5).** The form in the example below can no longer be written. The reasons for rejecting dispatch still hold.

See §5. A parent that needs it can write it itself (the parent knows its children's types statically).

```ts
const Order = Val.sealer<Order>().implEquals(
  (a, b) => a.id === b.id && Money.equals(a.total, b.total),
);
```

This needs no new mechanism, survives serialization, and works for primitive children too. The verbosity goes away through the §5 principle of building in canonical form and through the `implEquals` spec.

**Rejected: storing a reference to equals in the value under a symbol key.** This is a variant of "the value carries a tag", one of the three routes in §5. It was tested at run time and is not adopted, for these reasons.

1. **It cannot attach to a primitive payload.** `defineProperty` on a `Val<"Email", string>` throws a TypeError. A custom equals is wanted most for types such as a case-insensitive Email, which is exactly where it would not work
2. **`structuredClone` and a JSON round trip silently drop it** (both drop symbol keys, while spread keeps them if they are enumerable). `deepEquals(o, structuredClone(o))` can become `false`. Nothing throws, so it breaks only across a worker boundary or through localStorage
3. **Equality stops being symmetric.** Pairs where only one side carries the symbol come up routinely, and then `equals(a,b) !== equals(b,a)`. Once equality is no longer an equivalence relation, the Set representation (§8.1) breaks
4. **The constructor would have to mutate the caller's object** (a frozen input throws a TypeError)

Comparing it with the WeakSet in §4.1 makes the difference clear. The WeakSet is also a mark of origin kept outside the value, but when it misses a value, **only speed changes, never the semantics**. When the symbol misses, equality itself changes.

#### Rejected: the variant that wraps primitives in a custom wrapper

This variant works around reason 1 by wrapping a primitive payload in an object such as `{ raw, [Symbol.equals], [Symbol.val]: true }`. It removes reasons 1 and 4, but it is not adopted.

**It buys exactly one thing**: dispatching a custom equals to a child with a primitive payload. It does not reduce deep copying. Copying a primitive already costs nothing, so the wrapper has no copy to remove. For object and array children, the ownership tracking in §4.1 already solves sharing without changing the semantics, and a wrapper only adds the cost of creating it.

**What it loses.**

1. **The symmetric JSON round trip.** `toJSON` fixes the output side, but `JSON.parse` returns a bare primitive. Restoring the wrapper needs a schema-driven revive, which means a codec layer. The reason §7.2 rejected a custom immutable type applies again
2. **Reason 3 (asymmetric equality) remains.** Values from `Val.of` and from JSON stay bare primitives, so pairs where only one side is wrapped come up routinely
3. **It breaks the Map / Set idiom in §8.1.** `Record<UserId, T>` and `Set<UserId>` work because a Val is a bare string at run time. A wrapper compares by reference, so `map.get()` misses with an `Email` whose content is equal
4. **Silent failure at boundaries.** The cost of `.raw` is not the keystrokes. Every boundary needs it, and on some paths forgetting it raises no type error (template literals, `===`, `switch`, React's `key`, building a URL, SQL parameters)
5. **As a design, it is worse than a class.** A class with one equals on the prototype is faster and uses less memory than an equals reference under a symbol key on every value. §7.2 / §7.3 already rejected that class because of `structuredClone`, and the wrapper has the same problem, and is less efficient

Being plain data is everything that sets this library apart. Dropping it would make valof compete with Effect Schema / Data with 1/50 of their API surface.

### 7.7 Leaving `equals` / `patch` in `.impl`

**Rejected. `.impl` holds only what attaches to the companion as is.**

A function in `.impl` attaches to the companion under its own name. These two did not; the library wired them.

- Their return type is fixed (`equals` returns `boolean`, `patch` returns what the seal returns)
- `equals` has its third argument (`deepEquals`) bound, so the public signature drops it
- The companion's type removes them from `M` with `Omit<M, "equals" | "patch">`

This showed at run time as well: the `for` loop in `attach` skipped these two with `continue`. The principle that `.impl` passes everything through was already broken.

`seal` and `create` had their own steps from the start, and `.impl` rejects them with `never` (§6.5). One rule then covers all of them.

> **What the library wires gets its own step. `.impl` holds only what attaches as is.**

They did not go to the same place. `equals` moved to `implEquals`. `patch` **went nowhere. The means to override it was removed altogether** (§6.6). The `never` that rejects them in `.impl` stays for both. **2026-09-15: `implEquals` is withdrawn (§5).** `.impl` no longer rejects `equals`, so a member of that name can be written. Not letting the user override the default is one thing. Letting a function of the same name pass through is another. That function overwrites the default at run time.

### 7.8 bigint, 2026-10-28

**Removed from the allowed types.** An integer below 2^53 fits in a `number`. A larger one goes in a Val wrapping a decimal integer string (§8.6).

`JSON.stringify(1n)` throws a TypeError. bigint was the only allowed type that broke the symmetric JSON round trip §1 guarantees. `structuredClone` handles it, so only the JSON boundary breaks, and the exception appears only there. This is the same reason §7.3 removed Date.

The type error has its own message (`JSON.stringify throws on a bigint; use a decimal string`). The type was accepted up to v0.11, so the message points migrating users to the replacement. A bigint in a union (`number | bigint`) gets the same message. The check sits in the last branch of `ValidateValue`, so an allowed payload never reaches it. symbol and the other primitives still get "not a plain value".

No run-time check is added. The development check looks only at objects with a prototype, not at symbols or functions, and it ignores bigint too. A custom seal may take something wider than the payload (§6.7), so a seal that takes `string | bigint` and turns it into a string can be written.

**The cost.** Since the number is stored as a string, the user pays for the following.

- Comparing strings does not order the numbers correctly (`"10" < "9"`). A companion member converts back with `BigInt()` and compares
- The seal enforces the canonical form (`/^(0|-?[1-9]\d*)$/`), so that `"010"` and `"10"` do not fail `equals` as different values (the §5 principle of building in canonical form)
- Every operation converts with `BigInt()`

#### Rejected: keeping it

The argument was that boundaries other than JSON (`structuredClone`, React state) handle bigint, so it does no harm to users who never go through JSON. Not adopted.

- Exempting the JSON round trip from "a value is plain data" makes the §1 guarantee conditional on "if it contains no bigint". That contradicts the reason Date was removed (§7.3)
- It fails late. The types accept it, and the exception appears only on serialization, often at a server boundary or when saving to localStorage
- The wrapping takes the same form as `Val<"IsoDate", string>` in §8.2, so the library needs no new mechanism

The ban on a top-level `null` (§9) is outside this change.

#### Holes valof does not guarantee against: non-finite numbers and sparse arrays

With bigint gone, two kinds of allowed value still break the symmetric JSON round trip. Neither throws. Both turn into `null`.

```ts
type N = Val<"N", { a: number; xs: string[] }>;
const N = Val.companion<N>().build();

JSON.stringify(N.seal({ a: NaN, xs: new Array<string>(1) })); // {"a":null,"xs":[null]}
```

- `NaN` / `Infinity` / `-Infinity`. Their type is `number`, so the types cannot reject them
- Sparse arrays. `new Array<string>(n)` has the type `string[]`, and its holes are written out as `null`. The literal `[, "x"]` has the type `(string | undefined)[]`, which the types reject

**valof does not guarantee against these.** The types cannot tell them apart, so closing the hole would take a run-time check. Some users deliberately use `Infinity`, as an upper bound for example, so these cannot be removed from the allowed types the way bigint was. `-0` turning into `0` does no harm, because `equals` treats the two as equal (§5).

---

## 8. Idioms

These need no extra implementation in the library. The docs only show them.

### 8.1 Map / Set

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

### 8.2 Dates

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

### 8.3 Using a schema library alongside

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

### 8.4 Fields to keep out of the update path

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

### 8.5 Framework state containers, measured 2026-09-09

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

### 8.6 Integers beyond 2^53

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

---

## 9. Open questions / to confirm

- [x] ~~**The hole in a patch passed as a variable (investigated in #125).**~~ Closed, 2026-11-05. Items 1-3 of `hunt-findings.md`. A non-literal
      argument gets no excess property check, and the patch type was an intersection (`{…} & {…}`), so it got no weak type check either
  - **Make `Patch` one mapped type.** The weak type check then rejects a variable that shares no key (`{ foo: 1 }`).
    An intersection gets the weak type check too, but loses it when one side has no keys. A payload with no optional keys
    (`{ id; owner; note }` in the `Unpatchable` example) was such a case
  - **Write the rejected keys as `?: never`.** This is the `X` in `Patch<T, X>`
    - The `Unpatchable` keys. `const both = { id: "forged", name: "y" }; U.patch(u, both)` was accepted
    - For a variant's patch, the tag and the other variants' fields. `S.C.patch(c, q)` (q a value of `Q`) was accepted, and `match` took the
      `Q` branch
    - For the patch of a nested plain object, `typeof PhantomBrand`. A Val holds this key as private, so it is not assignable to the public
      `?: never`. `U.patch(u, { meta: someOtherVal })` was accepted, and since the Val is owned, it replaced the field instead of merging
  - **Breaking change.** Code that passes `Patch<SeedOf<V>>` to a companion with `Unpatchable` breaks (the type-perf core fixture
    did). Change it to `Patch<Omit<SeedOf<V>, "id">>`. The error for a patch literal containing an `Unpatchable` key
    changes from TS2353 to TS2322
  - **Cost.** The fixture changed, so core is not comparable (8,504 → 8,217). trait 23,756 → 23,576, enum 39,853 → 40,057,
    declarations 96.66 → 96.79 kB

- [x] ~~**Unions in a Val's declaration and in companions (investigated in #125).**~~ Closed, 2026-11-05. Items 1, 3 and 6 of `and-or-holes.md`
  - **A brand is one string literal.** A value of `Val<"A" | "B", P>` is not assignable to `Val<"A", P>`. The verdict of `UncheckedVal`
    becomes "a Val's brand must be one string literal". `string` is rejected too, as in Enum (user, 2026-11-05).
    The check runs for every Val declaration, and core grew by about 130
  - **`Val.companion` and `Val.of` take exactly one Val.** `Val.of<U | W>({})` and `Val.companion<U | W>().build().seal({})`
    were accepted, and the seed collapsed to `EmptySeed`. Whether the type is a union is read from the brand. A Val with a boolean payload is a
    union of values with one brand, so a check that reads the values would reject it too. The constraint `OneVal` is a mapped type whose key is the message ("a companion builds one Val",
    "\`Val.of\` builds one Val")
    - Reading it with `BrandOf<V & AnyVal>` took core from 8,318 to 12,960. Read it directly with `V extends Phantom<infer B, unknown>`
  - **The option list cannot be a union.** `Val.companion<U, [PrivateSeal] | [Unpatchable<"id">]>()` was accepted, and `seal`
    disappeared. `Enum.companion` had the same hole. The constraint is `const O extends readonly …[] & OneList<O>`, where `OneList` is a conditional type that is `Invalid`
    only for a union
    - Rejected: a mapped type whose key is the message. `const` inference walked the intersection's mapped type, and core grew by 1,050
  - **Cost.** core 8,318 → 8,504, trait 23,635 → 23,756, enum 39,786 → 39,853, declarations 96.09 → 96.66 kB

- [x] ~~**Holes in an Enum's declaration (investigated in #125).**~~ Closed, 2026-11-05. Item 9 of `hunt-findings.md`, items 2-5 of `and-or-holes.md`.
      Each check went into `Fault` (which reads only the type arguments)
  - **A variant's name is a string.** In `{ A; B; 404 }`, `VariantKeys` (`Extract<keyof D, string>`) silently dropped `404`,
    and `match` counted as exhaustive without `404`. If every name was a number, the enum became `never`, and the companion was still accepted.
    `VariantKeys` now includes `number`, and `Fault` rejects it with "a variant's name must be a string"
  - **The name, the tag name and the shared fields cannot be unions.** A value of `Enum<"E" | "F", …>` is not assignable to `Val<"E.A", …>`.
    `Tag<"k" | "t">` was accepted with `.tag("k")` (`Tag<"k"> & Tag<"t">` was already rejected). For shared fields of
    `{ id } | { key }`, the `Pick` in `SharedIn` kept only the common keys, and `create({ n: 1 })` was accepted with neither `id` nor `key`.
    The shared-field check reads the third argument (`X`) before `SharedIn` collapses it
  - **`Enum.companion` takes exactly one enum.** `Enum.companion<F | G>()` was accepted, and no variants appeared. An enum is
    a union of variants, so whether it is a union of enums is read from the name. The constraint `OneEnum<E>` is a mapped type whose key is the message (the same form as `Single`)
  - **The name and the tag name are one string literal each.** The check is `IsOneLiteral`, as for a trait's name, and it also rejects `string`, template literal types, `any` and `never`.
    Hunt item 4 had marked a `string` brand as "won't fix", but Val, Enum and Trait now handle it the same way (user,
    2026-11-05). `Tag<string>` was accepted, and only made `.tag` require `key: string`
    - Rejected: allowing only names that start with an uppercase letter (or `…/` followed by an uppercase letter). The types can express it, but such a check accepts `` `X${string}` ``, unions,
      `any` and `never`, so the literal check would still be needed. Consistent naming belongs to the linter (agreed with the user, 2026-11-05)
  - **A declaration's checks report on the declaration's line** (user, 2026-11-05). The name uses the `OneLiteral` constraint, and the tag name the constraint on `Tag`. `Fault` is
    split into `SharedFault` (what the third argument alone decides) and `VariantFault` (each variant checked against the third argument), which become the constraints on
    `X` and `D` respectively. The brand's `Named` stays, for `any` and `never`
    - An `Enum<"E", {}>` with no variants is now rejected on the declaration's line too. Before, the indexed access just became `never`,
      with no error. The message is "an enum needs a variant" (see the one-variant item below). `Tag<never>` is rejected by the constraint on `X` too
    - The payload rules now apply to variant payloads and shared fields (`Checked<Written<…>>`). `Written` holds the fields the declaration wrote, excluding
      the fields a trait adds. The constraint on `D` also reports a field with no possible value in the intersection of a variant's fields and the shared fields (`Unfit`), and
      a disagreement with a trait (`Fits`, as for Val). Until then, only `Enum.companion` reported these.
      This also makes an alias whose variants contain a type parameter impossible to write (as intended). enum 41,290 → 44,111
  - **Cost.** enum 39,583 → 39,786, `index.d.ts` 95.55 → 96.09 kB. Most of the increase is messages. #127 raised the declaration budget

- [x] ~~**Rejecting an enum with one variant.**~~ Allowed, 2026-11-06 (user). An enum can shrink to one variant during modelling
  - It was rejected for the sake of users' `.d.ts`. With one variant, the indexed access returned the member's type with no alias, which
    expanded the private phantom into the `.d.ts` and raised TS4094 / TS4023. The message said "one is a Val"
  - `EnumPhantom` moved out of the indexed access: `{…}[VariantKeys<D>] & EnumPhantom<…>`. The intersection becomes the alias's
    own type, and the `.d.ts` keeps the names `Lonely` and `VariantOf<Lonely, "Only">`. With two or more variants it is the same type as
    `(A & P) | (B & P)`. A ts-compatibility fixture (`Lonely`) verifies it on TS 5.9 / 6.0 / 7.0
  - An enum with no variants is still rejected ("an enum needs a variant"). Its type would be `never`. Used as a field's type, it would raise
    "no value fits" on a distant line, and it is silently assignable to any type. A test cannot read the message (`never` has no brand)
  - **Cost.** enum 45,236 → 45,146, `index.d.ts` 100.60 → 99.92 kB

- [x] ~~**Messages that missed the point.**~~ Fixed, 2026-11-06. Passing `any`, `never`, `unknown` or the wrong kind of type raised another check's message.
      Each time, either a conditional type took both branches on `any`, or another check failed first
  - `Enum<…, Tag<any>>`: "the tag cannot take the name of a field the payload holds" → the tag-name message. The check for a clash with the tag
    runs only when `IsOneLiteral<Tg>` holds. The error now lands on the third argument
  - `Enum<"E", any>` and `Enum<"E", never>`: "a Val's brand must be one string literal" → "an enum's variants cannot be
    `any` or `never`". Building the variants substitutes a placeholder variant (`Built`), and a variant's brand goes through `Literal`,
    which becomes `"?"` for a non-literal. Where an `Enum<any, …>` is used, the Val brand message no longer appears either
  - `Trait<"T", any | never, M>`: "a trait member cannot take a field's name" on `M` → the shape message
  - An `unknown` payload, field, trait shape or shared field: the message of the null or undefined rule → "`unknown` is not
    a plain value; write the type"
  - A `Date` or `Map` field: "keys must be strings", because of its symbol keys → "not a plain value". An object with methods
    gets this message before the key rule
  - A Val in `Impl`, `Dyn` or `Trait.companion`: "a trait is only a declaration" → "not a trait". A union of traits in `Dyn` or
    `Trait.companion`: the hint about `Impl<A> | Impl<B>` → a message asking for one trait. A Val in `Enum.companion`:
    "a Val is built by `Val.companion`"
  - Tests read the messages that the types expose (the verdict, `NameOf`). Where only an `@ts-expect-error` comment marks the error, the message
    cannot be checked
  - **Cost.** trait 24,331 → 24,460, enum 45,146 → 45,511, `index.d.ts` 99.92 → 101.67 kB

- [x] ~~**Declarations that should not be accepted.**~~ Rejected, 2026-11-06. Found by auditing all of valof's types
  - A Val as a variant's payload (`{ X: Val<"Q", …> }`): the enum broke silently. "a variant's payload cannot be
    a Val; write its fields"
  - Variants written as an index signature (`Record<string, …>`, template literal keys): accepted silently since #133 gave the brand a placeholder
    name. "a variant's name must be one string literal"
  - `any`, `never` or `Tag<"k"> & Tag<"j">` (which becomes `never`) as an Enum's third argument: one message. The variants are built
    from an empty object in `SharedArg`, and the variant checks pass
  - A trait's member set that is `any` / `never`, or a member that is `any` (`Final<any>` too): `any` also satisfies the member constraint, so
    the verdict checks it (`AnyMembers`)
  - A trait shape field of `string & number`: `DeclarableShape` checks `Unfit` (objects only). Before, the implementing
    Val reported it
  - A record payload, and a trait whose shape is a primitive: `Agrees` only looked at field disagreements
  - A tuple element of `never`: mapping the element to anything satisfies the constraint, so the whole tuple gets "no value fits a tuple element"
  - **Not handled.** Passing a Val to a plain object field through `seal`. A Val is also a plain object, so this is fine
    semantically (user, 2026-11-06). `any` in a field, `Impl<any>` and `any` in a companion's options stay unhandled, per the 2026-11-04 policy
  - The type budgets (975 B left for `index.d.ts`, 332 left for trait) stay for now, and go up the next time one is exceeded (user,
    2026-11-06)

- [x] ~~**`patch` cannot pass a Val to a plain object field.**~~ Accepted when the Val has every key of the field, 2026-11-06
  - #130 made `PhantomBrand` `?: never` and rejected every Val. The reason was that the type of a field in `patch` is
    partial, but at run time an `owned` node (a Val, an existing value) replaces the field whole instead of merging. Accepting a Val with missing keys
    would leave the field without those keys while the type still claims them
  - A Val is also a plain object (user). If the replacing value must have the full shape, replacing and merging give the same
    result, and losing the `owned` record through `structuredClone` breaks nothing. `PatchValue<T>` became
    `Patch<T, typeof PhantomBrand> | (T & AnyVal)`. The second member matches only a value with a brand, so the handling of a plain object passed
    as a variable (weak type check, `?: never` keys) does not change. Variants are accepted by the same rule
  - **A Val is also a plain object, and may have extra keys** (user, 2026-11-06). Where a plain object is
    declared (a `seal` argument, a patch field), a Val with all its keys fits, and a Val with extra keys is accepted too.
    Dropping the extra keys for the JSON round trip is the custom seal's job (as in `custom-constructors.md`:
    "an undeclared key survives unless the seal removes it")
  - **Cost.** core 8,865 → 8,893, `index.d.ts` 103.05 → 103.16 kB
  - **Cost.** core 8,845 → 8,865, trait 24,460 → 24,668, enum 45,511 → 45,759, `index.d.ts` 101.67 →
    103.05 kB (975 B left of the 104 kB budget, 332 left for trait)

- [x] ~~**Holes in the payload rules (investigated in #125).**~~ Closed, 2026-11-05. Items 6, 11, A and B of `__memo__/hunt-findings.md` and
      item 7 of `and-or-holes.md`
  - **A field can hold `null` or a primitive alongside one other kind.** `string[] | null`, `Rec<Node> | null` (a linked list),
    `User | null`, `Impl<A> | null`, `string | string[]`. Until now these failed with "not a plain value" (`string[] | number[]`
    passed through the array branch). The last branch of `Validate` (neither an object nor an array) splits off the primitives and passes the rest to
    `Validate`. A union of objects is still rejected. The root is not split (that would give a Val of `string | {…}` a `patch`)
    - **`patch` replaces such a field whole.** `PatchValue` is `T` unless `[T] extends [object]`. Merging `{ x: 1 }` into a field of
      `{ x; y } | null` produced a value with no `y` when the field was `null`. The same reason makes an optional key take the whole value
    - **`DeepReadonly` and `Opened` split too.** Without the split, `Rec` did not open, and arrays did not become readonly. `string | string[]`
      has number keys, so it also enters the array branch. `DeepReadonly` processes the rest once, without splitting it (`Mixed`). Splitting
      it again made recursion through a comparison across a type parameter never end (TS2321. `vp check` passed, but the ts-compatibility round trip of the declarations raised it)
  - **Accept an explicit string index signature.** The `keyof` of `{ [k: string]: number }` is `string | number`, so it
    failed with "keys must be strings". The `keyof` of `Record<string, number>` is just `string`
  - **Reject a field that no value fits.** A required key of type `never` (`{ a: string } & { a: number }`, an intersection of two Vals
    `{ a: U & W }`, a clash between an Enum's shared fields and a variant). "no value fits \`a\`". An optional `never` and
    `Record<string, never>` are accepted (always absent, always empty)
    - **`ValidateFields` cannot express it.** Mapping a `never` field to anything satisfies the constraint. `Unfit` checks at the level of the object
    - **At the root, only `Allowed` (on the type definition's line) and the variant verdict check it.** Checking at the root of `Validate` made a
      `Payload` that references itself through `Rec` raise TS2456, because `Payload` resolves to `Validate`. An Enum's `Fault` also sits where only the type arguments are read, and
      a recursive Enum became circular there. A variant passes it into the verdict through `Fit`, the fourth argument of `UncheckedVal`
    - `never` in a trait's shape is not rejected. `Disagreement` already rejects a clash between shapes
  - **Reject on the Val's declaration when two traits declare a member of the same name.** "two traits declare a member named \`x\`".
    Until now the second `implTrait` rejected it with "another member already answers", and the declaration was accepted. One Val can register a name
    only once (`TraitHost`), so neither trait's type can be implemented
  - **An empty object field rejects class instances.** In the seed `{ meta: {}; any: object }`, an empty object below the root becomes
    `{ readonly [key: string]: never }`. A class instance has no implicit index signature, so even a class with no fields
    fails. Production stored whatever it was given. `DeepReadonly`'s `Arg` gains `"field"`
    - **The root becomes an index signature too** (2026-11-06). At first the root stayed `EmptySeed`, because an index
      signature at the root rejected existing values and tagged payloads (the 2026-10-19 item below). With the root as `EmptyField | AnyVal`,
      existing values pass. A tagged payload is not an empty object, because `Tagged` adds the tag before building the seed type.
      `EmptySeed` was removed. enum 40,190 → 40,781
  - **Cost (TypeScript 5.9.3).** core 7,713 → 8,318, trait 21,101 → 23,635, enum 35,874 → 39,583, `index.d.ts`
    92.69 → 95.55 kB. The trait budget went from 22,000 to 25,000. The biggest parts are the split in `DeepReadonly` (trait about +1,400) and
    `Unfit` (about +350)
    - The declaration budget went from 96 to 104 kB too. The review of #126 added messages and name checks, and this PR reached 96.45 kB
      (2026-11-05, caught by CI. #128 raised it first). Moving a declaration's checks onto its line took the top branch to
      99.95 kB, and the budget went from 100 kB to 104 kB. The whole stack added 7.9 kB: 4.2 kB of type code, 2.0 kB of JSDoc and 1.7 kB of
      messages. Sharing the messages through literal aliases would save about 0.4 kB, but the alias names add as much to read, so it was deferred
      (user, 2026-11-05)
    - Rejected: writing the rest of the split as dedicated leaves (`Rec` / Val / `Impl` / array / object). trait 23,766 and declarations +0.3 kB, too heavy
  - **Report the trait checks on the declaration's line too** (user, 2026-11-05). The constraint on a Val's third argument becomes
    `AnyTrait & DeclarableTraits<Tr, T>`, which surfaces `Fits` (a union of traits, members of the same name, a disagreement between payload and shape) in the
    type argument. It reads the payload, yet a payload that references itself through `Rec` did not become circular. The verdict keeps `Fits`
  - **Reject `any` and `never` as a payload.** The type of `Val<"V", any>` was `any` throughout, and `Val<"V", never>` was `never`, and both
    passed every gate. `Grounded` turns `any` and `never` into an empty object so the type does not collapse, and the verdict rejects them with "a payload cannot be
    `any` or `never`". Both satisfy the constraint, so the error does not appear on the declaration's line
    - Cost: core 8,348 → 8,707, trait 23,998 → 24,284, `index.d.ts` 97.14 → 97.66 kB. On the top branch the declarations reached
      99.95 kB, leaving 51 B of the budget

- [x] ~~**Primitives and arrays pass an empty payload.**~~ Closed, 2026-10-19. The argument type was `{}`, so
      everything except `null` and `undefined` was assignable. `E("text")` for `Val<"E", {}>` was accepted, and the Variant
      `E.A("text")` built `{ 0: "t", …, _tag: "A" }`
  - **Types.** `SeedOf` and `SeedFor` replace an object type with no keys with `object & { length?: never; then?: never }`.
    They replace it at every depth (`X({ meta: "text" })` for `Val<"X", { meta: {} }>` fails too).
    This rejects primitives, arrays, functions and promises, and accepts existing values and tagged payloads
  - **`DeepReadonly`'s type argument `Arg` makes the replacement only in argument positions.** `SeedOf` and `SeedFor` pass `true`.
    The seed type and the value type no longer share a cache, so instantiations went up (core 5,881 → 6,329, enum
    34,399 → 35,559)
  - **Rejected: an index signature (`{ [key: string]: never }`).** It rejects existing values too. A type that contains a class's `Phantom`
    has no implicit index signature. A tagged payload fails too, since `_tag` does not fit `never`
  - **The value type stays `{}`.** A Trait's shape also goes through `DeepReadonly` without `Arg`. Narrowing it there would stop a
    Val with a string payload from implementing a Trait with an empty shape (`tests/trait.test.ts` fails)
  - **The seal argument check (`CheckedSeal`) now applies to an empty payload too.** Before, it was excluded because a string is assignable to `{}`.
    A seal that takes `unknown` fails with "a seal takes the payload, not a wire
    format"
  - **Run time: check a Variant's payload before the spread that adds the tag.** The copy runs after the spread, so
    even development checked nothing. A string became an object keyed by its indices, and a class
    instance silently lost its prototype. A non-object throws in production too
    (as in `patch`). The prototype check is development only
  - **A Val's constructor does not check at run time.** The library does not know the payload's shape at run time.
    Some payloads are primitives, so it cannot require an object
  - **Place the check after the declaration of `development`.** Placed before it, the minifier could not fold `development`,
    and every development branch stayed in production (the Enum increase went from +474 to +633 B). Moving it brought it to +487 B

- [x] ~~**A `create` that skips the seal.**~~ Added as `.implCreate.noseal`, 2026-10-14. A `create` that always generates a payload
      the seal accepts still returned the seal's return type as is. The step that defines `create` removes the seal from it

  ```ts
  const SectionId = Val.companion<SectionId>()
    .implCreate(() => randomBytes(4).toString("hex"))
    .implSeal((text, seal): SectionId | undefined =>
      /^[0-9a-f]{8}$/.test(text) ? seal(text) : undefined,
    );

  const id = SectionId.create(); // SectionId | undefined. undefined is never reached
  if (id === undefined || used.has(id)) return mintIds(used, count); // folded into the collision retry
  ```

  - **It is a pattern.** An ID type whose seal checks the format always ends up in this shape when it generates its own IDs (uuid,
    nanoid). When the unreachable branch is folded into the retry, a broken generator raises no error, and the recursion never ends
  - **The form.** `.implCreate.noseal(fn)`. The public `create` and `create.nocopy` return `V`. `patch` and
    `seal` do not change. Writing a plain `implCreate` afterwards brings back the form that goes through the seal
  - **Going through the seal stays the default.** A forgotten `noseal` shows up as `| undefined` in the return type, so the caller
    notices at compile time. With the opposite default, a forgotten seal would pass the types and create unchecked values in production.
    This is the same criterion that made `.nocopy` opt-in (§4.1)
  - **A `noseal` generator cannot take arguments.** Whether the generator receives unvalidated input decides it,
    and forbidding arguments closes that path in the types. With no input space, a single run of the development check is nearly exhaustive.
    A constraint of `() => SeedOf<V>` alone still accepts optional and rest parameters, so a separate
    `Parameters<G> extends []` check fails them with `Invalid<…>`. Allowing arguments would be a backward-compatible addition, so it waits
    until a real case appears
  - **A wrong payload type raises the error at the return value.** The constraint on `G` covers only the argument shape, and
    when the return type does not match, the argument's type becomes `() => SeedOf<V>`. With `G & (() => SeedOf<V>)`, when the return type
    matches, TypeScript cancels it against one side of the intersection and does not infer `G` (confirmed on 5.9 / 6.0 / 7.0)
  - **Write a generator that takes arguments and always succeeds with `implAssoc` (§6.13) and `Val.of`.** A function that takes only
    validated Vals (`Session.create(user)`) is such a case. This path gets no development check.
    `bypassed-companion` (§14.23) stays as it is and warns on this `Val.of` too. The form can be written but is not recommended, so a
    disable comment is appropriate
    - The `seal` passed to `implAssoc` is the custom seal, so `implAssoc` cannot solve the type problem of a seal that may fail.
      `noseal` keeps its role. The ban on arguments exists so that input checks cannot be skipped, and it does not conflict with the
      `create*` naming convention
    - A `create*` that takes arguments can call `create()` and then `patch`
      (`createLabeled: (label: string) => Doc.patch(create(), { label })`). Its return type goes back to the seal's return type.
      `label` is input, so going through refinement is correct
  - **The types do not close input through a closure.** A Val defined inside a function is already a visible sign. A check would be the
    lint rule "forbid defining a Val anywhere but a file's top level". A generator that reads mutable module-level state
    survives even that rule. Restricting that goes beyond TypeScript's semantics, so valof does not
  - **Production goes through the default seal only.** It does not call the custom seal
  - **Development actually runs the custom seal.** It calls `custom(payload, terminal)`. If the terminal is
    not called, it rejects. If the candidate passed to the terminal does not equal the payload, it judges that the seal normalized and throws. It returns the terminal's
    result and ignores the seal's return value, so it does not break §6.3. This is the same mechanism as `changedDuringSeal`
  - **The contract is that `create`'s output is a fixed point of the seal.** Passing the checks is not enough. Skipping a seal that also normalizes
    (`Math.round`) produces values not in canonical form, which breaks `equals` and the identity of a `patch` that changes nothing
    (`keep` goes through the seal)
  - **The linter reads `.implCreate.noseal(f)` as the `implCreate` step.** See `stepOf` (`scan/chains.ts`).
    The receiver is no longer a call, so without this the chain would break there, `bypassed-companion` would lose the companion,
    and `unimplemented-trait` would miss a later `implTrait`
  - **Cost.** Production gzip +44 B (852 → 896 B), `index.d.mts` +1.2 kB. The development
    check folds away in the production build. The increase is wiring (the `noseal` on `implCreate`,
    the flag, the branch that decides whether to go through the seal). The instantiation count barely changes
  - **Rejected: `create.noseal()` at the call site.** The `.nocopy` form does not fit. Ownership is a fact about each call, but
    "the output always passes the seal" is a property of the generator's implementation, so saying it once at the definition is enough. At the call site,
    every user could switch off "the seal is the only gate" (§6.8) on any companion with `create`. The motive also
    differs. Skipping the seal still leaves the final copy, so what it buys is the return type, not speed
  - **Rejected: unwrapping once in a bare exported function.** With `Result` it is one line, but a seal that returns `V | undefined`
    has no unwrap. `!` checks nothing at run time, so the throw has to be written by hand
  - **Rejected: skipping the seal when the generator returns `V`.** The brand is a phantom, so run time cannot tell them apart
  - **Rejected: using `Val.of<V>(…)` outside the generator.** `bypassed-companion` (§14.23) warns, and the development
    check does not apply
  - **The step is added even though `implAssoc` and `Val.of` exist.** They can express the same thing, but the step keeps the development check and the
    `create` name. Both are worth the small bundle increase
  - **An async seal was already forbidden** (§6.7, "A seal returns synchronously"). The development check can assume synchronous code

- [x] ~~**Should companion members be data-first / data-last duals?**~~ Yes, 2026-10-20.
      This lets users write `pipe(u, User.rename("x"))`. The member tells the two apart by argument count, and the types forbid optional parameters. The data-last form of a generic
      member loses its type arguments, so call it data-first inside an arrow function. Scope and rejected alternatives in §6.11

- [x] ~~**valof-lint rule: optional parameters that a type annotation hides.**~~ Added `hidden-optional`, 2026-11-03.
      TypeScript 7.1's `typescript/sync` counts the annotation's parameters (through aliases and imports). A run with
      no candidate does not load TypeScript. It catches an annotated top-level const (a function, or an object holding
      functions) used as a value of the object a step's function returns, or as the name that function returns. It
      reports at the default or the rest parameter. The record from that time follows
- When a type annotation hides an implementation's default
  parameters or rest parameters, the types cannot reject them and the data-last call breaks (§6.11, "Remaining hole"). The linter reads the syntax, so it
  sees the implementation under the annotation
  - **Since 2026-10-28, development throws in `build`** (§6.11, "Run time: throw on hidden defaults and rest parameters in development"). The lint rule still adds value by showing the problem
    where it was written, before anything runs. oxlint's `typescript/no-useless-default-assignment` catches the case where the annotated type
    does not include nullish
  - **Match the run-time check.** `=` and `...` at the top level of the parameter list. Inside destructuring is accepted. The linter can also read the annotation's parameter count,
    so it does not report a type that lists only the parameters before the default (§6.11, "Remaining false positive")
  - **Forms it catches.** `.impl(fns)` with an annotated const object, and
    `.impl({ toWire })` with an annotated function variable. The same for the second argument of `implTrait(Tr, …)`. `unused-member`
    already follows const objects and spreads. For function variables, add tracking to their declaration in the same file
  - **Forms it does not catch.** Members written directly in `.impl({ … })`. The type inferred from the implementation shows the default or the rest, so the types
    reject it. A lint report would duplicate the type error
  - **Forms across files.** A function imported from another file. Reading its declaration through the import needs cross-file
    tracking. Check whether `unused-member`'s name resolution (imports, renames, namespaces) can be reused
  - `implTrait<Tr>({ … })` was removed on 2026-10-20 (§15.1). That form was the main way into this hole

- [x] ~~**Seals the noseal development check misses.**~~ Added `unreturned-seal`, 2026-11-03, as proposed below. It
      reports every call of the second argument outside the argument of a `return`. The record from that time follows
  - **Dropped, 2026-11-11.** It reported a seal kept in a variable and returned later, as in
    `const sealed = seal(x); return sealed;`, since following the value needs data-flow analysis. The hole it
    guarded needs `.implCreate.noseal` and a seal that calls the default seal and then returns a failure, which is
    too narrow for those false positives (user)
- A seal that calls the default seal,
  then discards the result and returns a failure, passes the check, since "the seal was called and the value is equal". Production
  skips the seal, so a value that should be rejected gets created. The same applies to a seal that returns `undefined`, not only to `Result`

  ```ts
  .implCreate.noseal(() => randomId())
  .implSeal((text, seal) => {
    const id = seal(text);
    return isReserved(id) ? undefined : id; // the development check does not see this rejection
  })
  ```

  - **The return value is not inspected.** Searching it in development for the default seal's result would prevent this. It would not ship in the production
    bundle, but it would go against §6.3. The deciding case is a primitive payload. It cannot be found by identity, and an `Err`
    message containing the same string would be mistaken for it. String IDs are the main use of this step, so this matters
  - **Make it a lint rule.** On a chain with `.implCreate.noseal`, read the inline function passed to `implSeal`. Warn if no call of the second
    argument appears inside the expression that is `return`ed (for an arrow function, the body expression)
  - **Limit it to noseal chains.** Sealing, discarding and returning a failure is legitimate in an ordinary seal
  - **Warn whenever the result is stored in a variable.** Tracing whether the value flows to `return` needs data flow.
    `const v = seal(x); return ok(v)` is warned too, but it can be rewritten as `return ok(seal(x))`
  - **Forms it cannot see.** A function defined elsewhere, as in `.implSeal(hex)`, is not followed, and the rule says nothing
  - The linter currently does not read the body of the `implSeal` function (`CompanionSite.seals` is only a boolean). It comes in a separate PR

- [ ] **Partial freeze when a development `.nocopy` fails.** If traversing the graph fails on a later node's accessor or on a cycle, only the children checked before that point stay registered as owned and frozen. To undo the side effects on failure, switch to two phases: register and freeze only after checking the whole graph
- [x] ~~Allow `null` as a top-level payload?~~ No. `null & { __brand: K }` is
      `never`, so a value that stays `null` cannot be told apart by brand. Putting the brand on a union lets a bare `null`
      in, and a wrapper loses plain data and falsiness. `null` inside objects and arrays is still allowed
- [ ] Whether TS 7.1 (beta 2026-10-06, stable 2026-11-24) ships an in-process LS API (§14.5). If it does, the 7.x LSP client can move to it and fold into the same path as 5.x / 6.x. **No hurry.** `tsc --lsp` works from 7.0, so this is a chance to simplify, not a prerequisite
  - 2026-11-11: 7.1.0-dev.20261110.1 exports `typescript/sync` and `typescript/async`. Its `Checker` has
    `getSymbolAtPosition` and `getTypeOfSymbol`. Whether it runs in-process is unconfirmed
- [ ] Editor integration (§14.9). The implementation is in (`Options.overlay`, `valof/lint`, `valof/eslint-plugin`). What remains is the README recipe and checking it in real editors
- [x] ~~**Editors do not show a member's JSDoc. Go to definition on a custom `seal` / `create` jumps into valof.**~~
      Members are fixed in TS 7.1. `seal` / `create` are given up (2026-11-11)
  - **A member's JSDoc is a TS 7.0.2 bug.** Passing through a bare mapped type such as `{ [K in keyof T]: T[K] }` is
    enough to lose it. 5.9.3, 6.0.3, 7.1.0-beta and 7.1.0-dev.20261110.1 show it. Go to definition reaches the
    user's code in every version
  - **`seal` / `create` jump into valof in every version.** `SealMethod` / `CreateMethod` declare the properties, and
    the function passed to `.implSeal` is only a type argument. Hover also shows valof's JSDoc, not the JSDoc written
    on the callback (7.1 nightly)
  - **Why give up.** The convention fixes their role, and valof's JSDoc explains it. Hover shows the parameter and
    return types as the user defined them. Returning `Result<User>` says it can fail. A rule the types do not show is
    a few lines below the companion, reached by jumping from the `User` in `User.seal` (same name, top level, §14.21)
  - **Rejected: TS 7.1's `registerLspMiddleware`.** It can rewrite the response to jump to `.implSeal(`. But it works
    only inside VS Code's `TypeScriptTeam.native-preview` extension, and the PR calls it an unstable API
    (microsoft/TypeScript#64583). 7.x does not read `compilerOptions.plugins`, so no hook works in every editor (on
    7.1 nightly, a plugin that writes a marker file when loaded did not run)
  - **Rejected: an LSP proxy wrapping `tsc --lsp`.** It works in every editor, but asks the user to configure the
    editor
  - **Rejected: having the user write `.implSeal({ seal: … })`.** As with members, the declaration site should become
    the user's code, but this is unverified. The API becomes awkward
  - **Rejected: a build-time transform.** The editor reads the source, so the transform's output never reaches it
- [x] ~~valof-lint: report a local alias (`type Local = ImportedUser`)~~ Implemented, as the separate rule `unnecessary-alias` (§14.25)
      rather than in brand-mismatch. It also closed the only hole in `split-companion`
- [x] ~~valof-lint rule: warn when `PayloadOf<X>` appears **at a property position** in a Val's payload.~~ Added
      `payload-of-property`, 2026-11-03. The top of a Val's payload and of each variant's payload (an intersection's
      members included) passes, and anything below it is reported. A local `type M = Payload<PayloadOf<X>>` is followed
      one level. It errors by default. The syntactic position distinguishes it from the legitimate use (the base of a
      top-level intersection)
  - **Dropped, 2026-11-11.** It catches one mistake, and what led readers to it is gone: the README's
    `Reusing a Val` composed `PayloadOf<User> & { … }` at the top level, and neither the README nor the book composes
    `PayloadOf` any more. The rule cost a scan pass of its own and its tests. The hole stays, recorded in §4.1. The
    types cannot close it, since `PayloadOf<Money>` is a plain object type
- [x] ~~valof-lint rule `foreign-rec`: report a `Rec` that is not self-referential~~ Not added (§14.26).
      `Rec<Other>` opens to `Other`, so the type is the same. It causes no harm, and nobody has a reason to write it
- [x] ~~**Implement `Enum` (a sum type).**~~ Implemented, in `src/enum.ts`, exported from `valof/experimental` next to
      Trait. At run time it is one proxy plus a frame per Variant (borrowing `Val.sealer`). Bundle size for
      `Val` + `Enum` is 1.10 kB gzip, against a budget of `Val`'s 1.25 kB + 384 B. What the implementation taught is in §15.2,
      "Lessons from the implementation"
- [x] ~~**`Enum` has no custom seal.**~~ Added. The entry point splits in two, `Enum.sealer` / `Enum.companion`,
      and `implVariant` passes the Variant's builder through a callback. The Enum's seal and the Variant's seal
      are chained into one, and `impl` closes the chain. The tag moved to the third type argument. Form and rejected alternatives in §15.2, "Per-variant seals and the union's `seal`"
- [x] ~~**valof-lint does not know `Enum`.**~~ Extended. `brand-mismatch`, `duplicate-brand`,
      `companion-mismatch`, `split-companion`, `unnecessary-alias`, `unimplemented-trait` and
      `bypassed-companion` read the Enum syntax. `unused-member` is unchanged. It registers `implVariant`'s members
      under the key `` `${enum}.${variant}` ``, and counts both `Shape.Circle.diameter` and a destructured
      `Circle.diameter` under that key. `scan` collects `sites` from three starting points into one list, and
      `Bindings.builders` became one Map too. **Three rules were decided against**
  - **A rule for fewer than 2 Variants.** The types reject it. `Fault` in `src/enum.ts` raises
    `"an enum needs at least two variants; one is a Val"` (from 2026-11-06, one is allowed, and only zero raises
    `"an enum needs a variant"`), and `E extends AnyEnum` rejects it at
    `Enum.sealer` / `Enum.companion` / `match` / `VariantOf` alike. The only silent case is a declaration with neither a companion nor
    any use, and that does no harm. The same judgment as dropping `tag-mismatch`
  - **A rule against giving a Variant its own companion.** The types reject it. The type argument of `Val.sealer` / `Val.companion` is
    `V extends AnyVal & NotEnum<V>`, so a Variant or a union raises TS2344 on the declaration's line. Where the types reject something, no rule is needed. On the `scan` side,
    a site whose type argument itself takes type arguments is not read as a companion site
    (this stops `companion-mismatch` from reporting `VariantOf` as a type name)
    - A self-referential constraint can be written on a function's type argument. "A self-referential constraint cannot be written" in §3 is about type aliases
    - **`val.ts` imports `enum.ts` for types only.** Moving `EnumPhantom` to `val.ts` and introducing a minimal
      marker were both rejected. One line in which the stable entry point's declarations reference `experimental` costs less than another
      phantom on Variant
    - The cost is that TypeScript expands the constraint into the message. The key of `Invalid` (`__valError`) appears on the second line as missing,
      so one internal name is visible
  - **2026-11-03: rebinding under the same name warns too (`unqualified-variant`, warn).** Destructuring and
    `const Circle = Shape.Circle` both hide the enum from the reader (§15.2, "Keep the prefix"). A rename stays with
    `companion-mismatch`. The record from that time follows
  - **Renamed `detached-variant`, 2026-11-11.** "Unqualified" is a technical word that does not say what the
    code does (user). The rule reports a variant taken off its enum into a local name, by either form.
    Rejected: `destructured-variant`. It is the most direct for `const { Circle } = Shape`, but not for
    `const Circle = Shape.Circle`
  - **A rule against rebinding a Variant.** `const { Circle } = Shape` and `const Circle = Shape.Circle` are
    legal. The only thing to check is that the names match, which an extension of `companion-mismatch` covers
- [x] ~~**The callback form of §15.4 is not in val.ts yet.**~~ Added, then removed on 2026-09-18. `.impl` closes
      in one call, and its only argument is the members object. A member that needs the companion references the outer name and annotates its return
      value. A probe showed that the annotation path covered everything `self` could reach. Val / Trait / Enum all
      match. The history is in §15.4, "Closing the chain"
- [x] ~~**Add `detached-impl` to valof-lint.**~~ Added. For `impl` / `implSeal` / `implVariant` /
      `implTrait` / `implCreate` / `fixed` whose chain reaches neither a starting point nor a local builder binding,
      `scan` records a candidate, and the rule reports it only when the base resolves to a companion site being scanned
      (including a dotted base such as `Shape.Circle.implSeal`, as an enum companion). An unrelated
      `.impl` resolves to nothing and stays silent. This turns "a companion lives in one place" from an assumption into an invariant, and
      `unused-member` and `companion-mismatch` keep counting correctly as they do now (§15.4)
  - 2026-10-23: removed. A companion closed with `.build()` has no steps, so the types do not let you write one (§6.12)
- [ ] `Unpatchable` can exclude only top-level keys (§6.10). Deep patch is in, so wait and see whether anyone wants to exclude deeper keys. It would take a path as a type argument, and whether that works with `Patch`'s recursion is unverified
- [x] ~~Document in the README how a payload behaves once it loses its `owned` record (§6.2)?~~ No. That a value becomes a different object after `structuredClone` is obvious to anyone writing JS, and the derived copying and merging follow from it. The record stays in §6.2
- [x] ~~Type-check the README's code samples?~~ No. twoslash is the counterpart of Rust's doctest, but the `// ---cut---` that hides the preamble works only in twoslash's renderer, and **GitHub and npm, where people read the README, show the preamble as is**. Hiding it needs a dedicated docs site, which is heavy for a project this size. A home-made scheme that gives each fence an id and keeps the preamble in another file could be written, but it adds one more thing to maintain
  - 2026-09-16: reversed (#39). `docs/tools/twoslash` type-checks each ts block in the README. The README does not use cut, and writes the preamble as part of the visible block. `paths` points imports from external packages to declarations in `docs/tools/twoslash/stubs/` (currently `remeda`)
- [ ] `Temporal` support in each runtime (low priority since valof leaves it out, but worth confirming if the README mentions it)
- [ ] The current state of the Records & Tuples proposal. The champions withdrew it in spring 2025 and were exploring Composites, as far as I recall, but this needs confirming. **valof does not adopt a strategy of waiting for the language to solve this**
- [x] ~~Close the gaps in valof-lint's tests (§14.10).~~ Closed in the third round, 2026-11-03. Mutations already
      failed on the chaining of `declaredName` and on `joins`. `widen` is covered by a fixture with two directives on
      one block (the union, and every kind winning in either order)
- [x] ~~**Type-check the fixtures? (§14.10) Reopened, 2026-10-14.**~~ Type-checked, 2026-11-03.
      `tests/lint/fixtures.test.ts` runs `tsc` with `tests/lint/tsconfig.fixtures.json` (0.1 s)
  - **The declarations went at the end of each file.** Type aliases are hoisted, so the positions the tests expect do
    not move. Only the leading `import` and the `@ts-expect-error` lines moved, and the expectations were rewritten
    from the line mapping
  - **The tsconfig loosens two options.** `noUnusedLocals` (a companion nobody reads is what a rule examines) and
    `declaration` (the declaration output of exported variables is not under test)
  - **Fixtures where two files share a brand got a namespace** (`billing/User`). Adding the declarations raised
    `duplicate-brand`
  - The record from that time follows.
    The fixtures are not type-checked, so renaming an API in the core leaves the lint tests green (§14.27)
  - Counted with a temporary tsconfig: 122 of 186 files, 329 errors. Most are omissions, not intended invalid code.
    `Val` not imported (162 as TS2304 / TS2552), parameters without types (TS7006, 77), types not
    declared (TS2749, 41)
  - Fixing them shifts lines, which means rewriting the positions the tests expect (`dead-member.ts:3:3`). A separate PR
  - Intended invalid code passes with `@ts-expect-error`. valof-lint reads only syntax, so its results do not change.
    **Put an invalid property on its own line.** The directive hides every error on its line, so
    writing `.impl({ patch: … })` on one line would miss a rename of `impl`
- [x] ~~With TypeScript 7.1 beta, a user's declaration output fails with TS7056.~~ The builder is now printed by name,
      2026-11-03 (§18.5). Found while adding valof-lint rules. Only the lint tests map the `typescript-7.1` alias to
      `typescript/sync` with a resolve hook
- [ ] **What remains of lint (from the 2026-11-03 additions).**
  - `block-step` (now `hidden-state-in-impl`, below), `split-variant-steps` and `unqualified-variant` are added (the three in `__memo__/tasks-to-design.md`)
  - **`block-step` stays (2026-11-11).** State goes outside the Val. A Val is immutable data, and state in a step's
    block is invisible to anyone reading the members. The report says only "move what it declares out of the
    companion", without saying where. A constant goes to module level, and state to a closure over the scope that uses
    it (valof-lint's plugin: inside `valof()`, §14.8)
    - **Rejected: dropping it.** It was almost dropped once, since moving state to module level still leaves state.
      The rule asks to move state out of the Val, not to remove it
    - **Rejected: recommending a class as the destination.** A closure with a narrow scope fits more cases (user).
      The plugin itself later moved its state into classes (§14.8, "State lives in classes")
  - **`block-step` became `hidden-state-in-impl`, and narrowed (2026-11-11).** `block` gave no picture of what the
    rule reports (user). The name says what goes wrong and where, and `impl` stands for every `impl*` step. It
    reports only a body whose own statements declare a variable, a function or a class. A body that only returns
    holds no state. A member's own locals, inside its function, are created per call and are not read
    - **Rejected: `step-block-body`.** It describes the form, and `block` was the word that gave no picture
    - **Rejected: `hidden-state-in-impl-block`.** Only a block body can declare anything, so `block` adds nothing
    - **Then `hidden-shared-state-in-impl`, the same day.** The state is both hidden from a reader of a member and
      shared by every member, and both are the harm (user)
  - `model-only-in-valof` is added (`__memo__/lint-model-only-in-valof.md`). Its options go to `Options.enable`, and
    the runner builds the boxes to run together with the default rules (css-var-kit's `compile`). No separate rule
    for "built-in types Valof does not allow as values"
  - **`model-only-in-valof` became `data-type-outside-valof` (2026-11-11).** The old name stated a policy, while
    every other rule is named after what it reports (user). The CLI flag, the plugin's setting and the key in
    `Options.enable` follow, and `ModelSettings` became `DataTypeSettings`. Rejected: `type-outside-valof`. The
    rule leaves out function types and `Payload<…>` aliases, so "type" claims more than it reports
- [ ] **The book's Map / Set gets membership wrong for inherited keys.** Found while turning valof-lint's Scan into
      Records, 2026-11-07. `docs/src/patterns.md` says "`if (tags[key])` is the membership test", but
      `tags["constructor"]` and `tags["toString"]` are truthy too (probed). The book lacks §8.1's note to check with
      `Object.hasOwn`. `__proto__` stays an own key through `Object.fromEntries` and `seal`. Not fixed
- [x] ~~**A mistake in `<W extends Rule>` gives no pointer to `Impl`.**~~ Not fixed, 2026-11-07. The release notes
      are enough. A check that gives the pointer adds type cost (user). `Rule` became a trait declaration (#125), so
      `Rule.dyn<W>` prints `TraitDeclaration<…>` in full with TS2344, and all it says is "Property 'kind' is missing"
- [x] ~~A Trait member returning a `Promise` breaks the declaration with TS2615.~~ The depth of `HasSelf`'s search is
      capped, 2026-11-03 (§15.1, "Capping the search depth"). Found while rewriting valof-lint
- [x] ~~A second type argument for `Dyn` that keeps the concrete Val (`Dyn<Tr, W extends Tr = Tr>`).~~ Not added,
      2026-11-04. `Dyn` is a box that forgets the concrete Val, so the shape's type widening to the trait's
      declaration is natural. valof-lint dropped the union of rule names (§14.8)
  - **Rejected: taking the original value out of the box (downcast).** Not now. If added, it goes on the trait's
    companion rather than on the box, and returns the original value (`Rule.downcast(box, DuplicateBrand)`, Rust's
    `downcast_ref`). The box is a Proxy where every key reaches the value, so a method would collide with the
    payload's fields and the trait's members. Branching on which Val it is means a closed set, which is a job for an
    Enum and `match`
- [x] ~~A Trait member overwrites a name the library puts on the companion.~~ Rejected by the types, 2026-10-14.
      Until then it passed the types, and only the run time replaced the name with the member
  - **An Enum's Variant names and `match`.** `Shape.Square({ side: 1 })` returned the Trait member's return value, and
    `Coin.match(h, handlers)` called the Trait member. The declaration's `Fault` rejects these. It reads only the type arguments,
    so it sits at the verdict position (§11). Member names are collected per Trait, distributing over them. Taking `keyof` of a union of member
    records keeps only the keys common to every Trait
  - **A Val's `nocopy`.** The type of `Id.nocopy` was `Nocopy<Id> & ((i: Id) => string)`, and at run time only the member
    remained. It is now in `Rejected`, so both `.impl` and the Trait's `Declarable` reject it. It is also in the linter's `RESERVED`
    (§14.27)
  - **The run time is unchanged.** The Enum's Proxy still reads `members` first. Only a cast or plain JS reaches it
  - Production gzip stays at 852 B. enum instantiations 32,437 → 32,653, `index.d.mts` +0.6 kB
- [x] ~~The Variant-name check (`Fault` in `src/enum.ts`) uses a different set from `Reserved`.~~ Intended. Unlike a Val's
      companion, an Enum's companion has neither `patch` nor `create`, so a Variant can take those names
- [x] ~~**Give the Enum companion a `create`?**~~ Done, 2026-10-24, only when the enum's `implCreate` is written. The output goes through `Shape.seal` (§15.2, "Build with one chain"). `patch` is not needed. `create` is worth considering. If it is added,
      add `create` to the Variant-name check
  - 2026-10-21: the direction is to give a Variant `create` only when `implCreate` is written (the Enum API item below)
- [x] ~~**Rework the Enum API. Undecided, 2026-10-21.**~~ Made it one chain, 2026-10-24 (§15.2, "Build with one chain").
      None of the three ideas was adopted: dropping `implVariant` and per-Variant members, passing Variant constructors through a callback,
      and the ways to write `implSeal`. What follows is the record from then. It followed §6.12, which aligned the entry points on `.seal`
  - The direction was to abolish `implVariant` and per-Variant `impl`. Neither Rust nor Scala's `enum` has per-Variant
    members. Union members and `switch` can express them
  - Keep the per-Variant `implSeal`. The return type differs per Variant (`Square` never fails)
  - No per-Variant parser is needed. The union's `implAssoc` can call a Variant's constructor, which also narrows the return type.
    Pass the Variant constructors to a callback (rather than going through the companion's name)
  - A seal does not take the part that is fixed by which seal was called. `User.seal` takes the whole payload,
    `Shape.Circle.seal` everything but the tag, and `Shape.seal` the tagged payload. A Variant's `implSeal`
    takes its argument without the tag too
  - Give a Variant `create` only when `implCreate` is written. The Variant's current `create` is "a seal that adds the tag",
    which means something different from a Val's `create` (which generates the payload)
  - Add the Enum's `PrivateSeal` here too (§6.12)
  - Remove here the `impl` / `implSeal` left on the `implVariant` frame. `Shape.Circle.implSeal(evil)`
    still passes the types after `.build()` (§6.12, "Close the chain with `.build()`")
  - Ways to write `implSeal`
    - Strings: `implSeal(fn)` and `implSeal("Circle", fn)`. The unqualified one reads as the type itself
    - Modifiers: `implSeal.Circle(fn)`, `implCreate.Circle.noseal(fn)`. This matches `implCreate.noseal`, and completion
      lists the Variants. The cost is that `Fault` forbids the Variant name `noseal`, `implSeal` becomes a Proxy,
      and the linter reads `.implSeal.X(f)`
    - Record: `implSeal({ Circle: fn })`. Weak, because nothing in the name refers to the whole
  - Two of the reasons in §15.2, "Rejected: write one seal for the whole enum", are weak: "the amount of code does not change" and "TS7022 in `match`"
    (it can be written as `switch (p._tag)`). What remains is that the return type does not differ per Variant
- [x] ~~**`unimplemented-trait` ignores traits declared on a variant (§15.2, "Build with one chain").**~~ It reads them,
      2026-11-03. `TraitImplementation.variant` holds the variant of `.Book.implTrait`, and a trait in a variant's
      payload is met only by that variant's implementation. The record from that time follows. There are no false positives, but
      it does not warn about a forgotten implementation. `scan` would need to read the trait in `{ Book: … & Named }` and `.Book.implTrait`.
      Add it in the valof-lint rewrite
- [x] ~~**A lint rule over `implAssoc` members (§6.13).**~~ Added, 2026-11-03: `constructor-name` for naming and
      `unrelated-assoc` for references, both warn. `unused-member` counts `implAssoc` members too. A reference is the
      type's name (the companion shares it) or the name of the `seal` / `create` the step's function receives. The
      record from that time follows
  - Naming: an `implAssoc` member that calls `seal` / `create` is named `from*` / `parse*` / `create*` (matched at a word boundary).
    Warn when an `impl` member uses one of these prefixes. The prefix check is `/^(?:from|parse|create)(?:$|[A-Z0-9_])/`.
    Rejected: `of` (`Val.of` does not go through the seal, while `Money.of` does), `with*` (in JS it means a derived value), `decode*` /
    `try*` / `new*` (overlaps `parse*`; the return type already shows failure; in a type literal it becomes a construct signature)
  - Reference: warn on a member whose parameter annotations and implementation never mention the type. A companion is not a place for helper functions
  - `unused-member` covers `implAssoc` members too
  - **A member passed by name is read through the function in the same file (2026-11-10).** In `exec: scan`, `scan`
    is read as a function declared at the file's top level with `function` or `const`, and a type name inside it
    counts as a reference. Until then only the one identifier was read, and a member that uses the type was reported.
    A function imported from another file is not read
  - **`constructor-name` was dropped (2026-11-11).** Too strict (user). Running valof-lint on itself, the rule would
    have split `Files.fromPaths` out of `Files.read` and `Parser.fromModule` out of `Parser.load`. A name cannot show
    whether a function is pure, and the rule conflicts with naming a construction with side effects by its action
    (`read`, `load`, §14.8). Keeping only the check on the `impl` side was rejected too. It has few false positives,
    but that alone does not justify a rule
  - **`unrelated-assoc` was dropped too (2026-11-11).** It guesses from syntax whether a member belongs to its type,
    and what it guards is a style: a companion used as a place for helpers. It needed a fix for members passed by
    name, and its sibling `constructor-name` was already gone (user)
- [x] ~~**A valof-lint false positive, from §6.12.** `detached-impl` reports a member named `fixed`, called from another file,
      as "a step written outside the chain".~~ Fixed after `fixed` moved to a type argument and left `STEPS`
      (2026-10-22). The types reject a member named like a step, so no other false positive of this kind can occur
- [x] ~~Implement the valof-lint rule `brand-mismatch` (§14.12)~~ Implemented. With `incomplete-disable` (§14.14) and `unused-disable` (§14.15), there are 6 rules
- [x] ~~valof-lint does not know `Trait`.~~ It tracks Trait declarations, companions, `implTrait` and `dyn` from the syntax.
      Two kinds of addition
  - [x] Extend the existing rules to the trait syntax. The judgments are the same; they only recognize more forms. `brand-mismatch`
        (`Trait<"Greetble", …>`), `duplicate-brand`, `companion-mismatch`, `split-companion`,
        `unnecessary-alias`, `unused-member` (a final can be read through two paths, `Greetable.shout` and `User.shout`,
        so either counts as a use)
  - [x] One new rule: it reports a Val that claims a trait but has no companion calling `implTrait` (§15.1). This was also said to close declarations whose payload
        does not satisfy the shape. Since 2026-10-19 a Val brings in the shape, so such a declaration
        cannot occur, and the types reject a contradicting declaration at its position (§15.1, "Vals bring in the shape too")
  - `unnamed-of` / `bypassed-companion` are not extended. A trait does not change anything about construction
- [ ] **Justify two awkward spots in the API early in the docs, one line each.** Both come from TypeScript's limits, but a first-time reader
      reads them as redundant: the two steps of `Val.companion<User>().impl(...)` (no partial inference, §13.1), and
      writing `"User"` twice in `type User = Val<"User", …>`
- [ ] **The name `dyn`.** It is Rust vocabulary, the only exception to the policy of avoiding FP vocabulary. Readers who do not know Rust
      cannot read it. Look at it in real use, together with the demand for `Trait` (§15.1)
- [ ] Survey existing npm libraries (`brand` / `value-object` / `newtype`)
- [ ] **Measure §15.3 `path`.** Before writing it, check whether inference for `glue`'s union handler works. The declaration budget
      went up to 64 kB, so it is no longer something to measure (§16)
- [x] ~~**§15.2 `Enum`: add `tag-mismatch` to valof-lint.**~~ Not needed. When the companion's argument types are
      looked up from the tag name, the types reject a forgotten, misspelled or extra tag. A clash with a payload key
      also fails at the brand position (§15.2)
- [ ] **Ship `hash`? On hold, 2026-09-10.** Nothing happens until a real case appears. Only one question matters: **is there a real case that puts
      many large values into a set?** If not, the canonical key in §8.1 settles it
  - **The canonical key competes with it.** A Val is JSON serializable, so a canonical string key turns `Set<string>` into a value-based
    set. It has no collisions and adds no API. Traversal is O(n), as with hash. hash wins only for large values
  - **It does not fit the budget.** Using it for early rejection in the default `equals` would make users of `Val` alone pay for it. The headroom is 133 B
    (1.12 / 1.25 kB), and a hash implementation is 200-400 B. As a standalone export it would be tree-shaken (like `dyn` in §15.1), but
    then the default equals cannot use it
  - **hash alone must not decide equals.** 32 bits give false positives. Limit it to early rejection, and confirm a pass with a structural
    comparison. Effect does it this way too
  - **The contract with a custom equals is the only design decision.** `implHash` is rejected (most people would not write one). The chosen form
    **treats equals equality and hash equality as different things**. It adds one more rule like §5's "a parent cannot call a child's custom equals".
    `hash` is limited to the default `equals`'s internals and the keys of structural Sets / Maps, and
    **is forbidden inside `implEquals`**. Using `hash(a) === hash(b)` for equality lets every false positive through as an equal pair
  - **The types cannot express the ban.** TypeScript cannot restrict where a free function is called, and branding the return value still lets `===` through.
    Make it a valof-lint rule. `chains.ts` already looks at the position of `.implEquals(...)`
  - **2026-09-15: the custom equals is withdrawn (§5).** The contract and the rule in the two items above are no longer needed
  - **64 / 128 bit cannot be built from built-ins.** `crypto.subtle.digest` returns a Promise, `crypto.hash` is Node only,
    and `BigInt` allocates on the heap. The only way is to line up 32-bit lanes of `Math.imul`, and bytes and time grow with the number of lanes.
    On top of that, 128 bits in hex take 32 characters, longer than the canonical key of a small value. **There is no middle ground**
  - Array hashes depend on order. Effect's `structure` folds with XOR, so permutations get the same hash (its authors call this a
    gotcha themselves). §5 requires order independence only for object keys
- [x] ~~Does the Mutable ↔ DeepReadonly round trip work smoothly with type inference?~~ Yes. A property's `readonly` does not affect assignability, and a mutable array is assignable to `ReadonlyArray`, so with `SeedOf<V>` as the argument type a mutable input can be passed as is
- [ ] **Imports in `.d.ts` keep the `.ts` extension (§18).** `dist/val.d.ts` contains `from "./ns/val.ts"`,
      but `dist` has no `val.ts`. `rewriteRelativeImportExtensions` rewrites only JS. tsc resolves it to the
      `.d.ts`, so it works on 5.9 / 7.0, with or without `skipLibCheck`. Revisit once a tool that reads the path literally
      breaks on it
- [x] ~~**Type-aware lint warns on spreading a Val.**~~ Solved with configuration, 2026-11-03. typescript-eslint's and
      oxlint's `no-misused-spread` report `{ ...user }` as "spreading a class instance". `Phantom` is a
      `declare class`, so the rule sees a Val as a class instance. At run time a Val is a plain object, and
      spreading loses nothing. The docs' Linting chapter gives the configuration
  - **The configuration is `allow: [{ from: "package", package: "valof", name: "Phantom" }]`.** The entry does not export `Phantom`,
    but `dist/val.d.ts` declares it, so the package specifier matches. A bare `"Phantom"` also
    works, but it also exempts users' types of the same name. It clears Vals, variants, Vals that declare a Trait and, in ESLint, the enum union too, while
    ordinary classes still warn (probed with ESLint 10 + typescript-eslint 8.72.1, and oxlint 1.82.0 and 1.90.0)
  - **oxlint keeps warning on the enum union.** tsgolint's `TypeMatchesSomeSpecifier` does not decompose unions.
    typescript-eslint passes a union when every member matches. The union's alias is the user's `Shape`, so a specifier naming `Enum` does not match it.
    Adding `{ from: "file", path, name: "Shape" }` clears it, but the docs do not recommend it (next item)
  - **Spreading a value whose fields are not all known is not recommended, 2026-11-03.** A whole enum, a Trait type and a `Dyn` value are
    such values. The warning is treated as correct, and the docs give no workaround. They say only "match an enum first, and read a trait's fields
    by name". The example allowing `Shape` with `from: "file"` and the advice to silence Trait-typed values with a disable comment were removed
  - **Rejected: allowing `TraitPhantom` too.** It clears Trait-typed values, but also the spread of a `Dyn`. Spreading a `Dyn`
    drops its members, so that warning is correct (the item below)
  - **Rejected: making `Phantom` not a class (a string key `__valof_brand_…`).** The brand would survive a spread and let code bypass the seal,
    a brand could be forged by hand, it would appear in `keyof`, and the reservation of `__valof_` would come back. These are the reasons §2.1, "2026-10-26: back to symbol keys", rejected the symbol-key version
  - **Rejected: intersecting the whole enum with `Phantom` as well.** TypeScript distributes `(A | B) & P` into `(A & P) | (B & P)`, so
    the type stays a union, and oxlint still warns (probed)
  - **Enabled in this repo too.** It allows two: `Phantom` from `src/val.ts` (the tests import from `src`), and the same
    package specifier as the docs (`#valof` is named `valof`). `tests/no-misused-spread.ts` pins each form where the warning disappears or stays, one per line. An unused disable comment is an error, so the test fails whichever way the rule's behavior changes.
    The three disable comments in the tests that silenced spreading a Val are no longer needed
- [x] ~~**Spreading a `Dyn` lies about the type.**~~ Treated as misuse, left to the `no-misused-spread` warning, 2026-11-03.
      The type of `{ ...Greetable.dyn(User, user) }` is `{ name: string; greet: () => string }`, but at run time it is
      `{ id, name }`, with no `greet`. There is almost no use for spreading a box (reading the fields is enough, and the result is neither a Val
      nor a box), so the docs do not mention it
  - **Rejected: closing it in the types.** TypeScript drops from a spread's type only the members a class declares as methods. `Bound` is
    a mapped type, and mapping from a class with `Pick` does not drop them either (probed)
  - **Rejected: making the box a class instance.** Giving the Proxy target a class prototype would make `instanceof`
    pass, but a spread reads the target's own keys, so the result does not change. The members are dropped at run time already. A trait's
    shape exists only in the types, so dropping just `id` is not possible either
- [x] ~~**Restrict `Self` to the first parameter. Type the other parameters with `Payload<T>`, 2026-11-03.**~~ Done, 2026-11-03.
      §15.1, "`Self` only as the first parameter"
  - **The hole.** A `dyn` box replaces `Self` in any parameter but the first with the trait's type. Another Val can be passed, and
    the wrapped Val's implementation receives it. A companion is a concrete type, so it rejects that. Rust also makes a method with `Self` in
    a position other than the first parameter uncallable through `dyn`
    ```ts
    type Same = Trait<"Same", { n: number }, { same: (self: Self, other: Self) => boolean }>;
    Same.dyn(A, a).same(b); // accepted. A's implementation receives a B
    A.same(a, b); // type error
    ```
  - **Type the other parameters with `Payload<T>`.** A check or comparison over common fields reads only the other value's shape.
    A trait cannot reference itself in its own declaration (`other: Same` raises TS2615 in `Declarable`), so write
    `Payload<{ n: number }>`. A bare object is accepted too. ~~A member that reads only common fields has no problem~~
    → It is a problem, 2026-11-04. With the same shape, a value without a brand is accepted too
    - [x] ~~**Accept only Vals that implement the trait, with `Impl<Same>`.**~~ Done, 2026-11-04. §15.1, "`Impl`".
          `other: Impl<Same>`. Breaking
      - **With `Impl` as an interface marker, member parameters do not become circular (probe).** The search for `Self` recognizes it by key alone and stops
        (the same trick as `Rec`), and `Unbound` / `Bound` replace `Impl<X>` with `X`. However,
        `let s: Impl<Same>` stays a marker and does not become the same type as `Same` (`interface Impl<Tr> extends Tr` raises TS2312)
      - **Direction: make a trait a declaration-only type, and write the value type as `Impl<Same>` everywhere.** `Trait<K, S, M>` becomes an interface that only
        holds type arguments, and the member checks move to where it is used (the companion, the Val's declaration). In the prototype it did not become circular, and it
        rejected values without a brand. `Same` can no longer annotate a value's type
      - Open: combining several traits, reworking `Dyn`, `MembersOf` and so on, the depth of replacement, the name being close to
        `.impl()`, cost
      - **Implementation plan (confirmed in a prototype, TypeScript 7.0.2), 2026-11-04**
        - **`interface Trait<K, S, M> extends TraitDeclaration<B, S, V>`.** `TraitDeclaration` is a class with only three protected
          keys. B is a record from names to members (the bare members), S is the shape, and V is a record from names to
          check results. An interface's base resolves only where it is used, so nothing is evaluated on the declaration's line.
          The keys are protected, so they appear in neither `keyof` nor a spread
        - **The checks sit in V.** They are the expressions now at the brand's position (the shape rules and `Declarable`). `AnyTrait` requires V to be
          a record of `Members & Unrejected`, so the gates (companion, `Val`, `Dyn`, `implTrait`) report at the same
          positions as now. B holds the bare members so that `Impl<Same>` reading B does not run the checks
        - **`Impl<Tr> = DeepReadonly<ShapeOf<Tr>> & TraitPhantom<BrandsOf<Tr>>`.** It is the same class as the brand a Val holds,
          so a Val that declares the trait is assignable as is. It is a value type, not a marker, so `Unbound` / `Bound`
          replace nothing. `Impl<Same>` inside arrays, callbacks and return values works as is, and the
          depth-of-replacement problem goes away. Inside an `.impl()` callback, `other` also appears as `Impl<Same>`
        - ~~**Stop `HasSelf` at `TraitPhantom`.**~~ Not added. The brand is private, so even without stopping,
          `Self` is not found inside `Impl<X>`. Removing it changed nothing (test-audit)
        - **Combine as `Impl<Greetable & Weighed>`.** An intersection of traits becomes an intersection of the per-name records, `ShapeOf` becomes
          the intersection of the shapes, and `BrandsOf` holds both names. It is mutually assignable with `Impl<Greetable> & Impl<Weighed>`.
          The docs write it in the same `&` form as a Val's third argument
        - **Writing `Same` as a value's type raises a type error about the missing declaration keys.** `const s: Same = meter`
        - Revision of 2026-11-04 (at the user's direction): the interface becomes a type alias, the keys merge into one message, and
          the type argument rejects `Impl<A | B>`. §15.1, "`Impl`"
  - [x] **Add the payload rule checks to `Payload`.** → Done, 2026-11-03. `Payload<T> = Validate<T>`
    - **`Validate` maps any `Invalid<M>` it meets to `Refused<M>`.** `Invalid` itself is a valid payload, so
      without the mapping, `Val<"U", Payload<{ f: () => void }>>` takes `{ f: Invalid<…> }` as its payload, passes the companion, and
      stays silent until the first seal. With the mapping, the companion raises TS2344 as it does for a bare payload, and the last line carries the message.
      The mapping condition is non-distributive. `T extends Invalid<infer M>` distributed over a union of objects and erased the union rule
    - **For a valid payload, `Validate<T>` is the same type as `T`.** Rebuilding arrays as `ReadonlyArray` made
      `Val.unwrap` return readonly (§3, "do not write `readonly` in a payload"), and adding `| undefined` to optional keys
      made the seed accept `undefined` as a value under EOPT. Arrays are mapped with a homomorphic mapped type, and
      optional keys keep only an `undefined` that was written (`| Extract<T[K], undefined>`). The hover shows the expanded object
    - **Where it reports.** ~~Nothing on the line of `type X = Payload<…>`.~~ → Reports on the type argument, 2026-11-04.
      The use site still reports as before. For a Val's payload, the companion. A trait member's parameter
      (`other: Payload<{ f: () => void }>`) stays silent on both the trait's companion and `implTrait`, and the call's argument raises
      `'() => void' is not assignable to type 'Invalid<"functions are not allowed">'`. A check on the trait's side would have to walk
      member parameters deeply, so it was not added. Reporting on the type argument makes it unnecessary
      - **`Payload<T extends ValidateFields<T>>`.** `ValidateFields` is the object branch of `ValidateValue` cut out as a
        mapped type, shared with `Validate`. `Payload<{ a: { f: () => void } }>` raises TS2344 on the type argument.
        A constraint that contains `Validate<T>` (`Validate<T>`, `ValidateFields<T> & Validate<T>`) still raises TS2313.
        A mapped type alone does not become circular. The same on TypeScript 5.9.3 / 6.0.3 / 7.0.2
      - **Roots the type argument does not catch.** `bigint`, `undefined`, `symbol`, functions, number keys (caught when nested),
        unions of valid objects, `string | null`. The mapped type returns primitives as is, maps functions to `{}`, and
        ignores the kind of key. The use site reports them. A `Date`'s methods are rejected as functions, so the type argument catches it.
        Adding a conditional type that looks only at the root, as `& Root<T>`, does not become circular (probe), but it would duplicate `Validate`'s root
        rules, so it was not added → Added, 2026-11-04 (`Allowed` in §3). It reads the result of `Validate<T>` with a conditional type, so nothing is duplicated
      - **A `Payload` containing a type parameter cannot be written.** Both `type G<T> = Payload<T>` and `Payload<{ left: T }>` raise TS2344
        (even with `T extends string`). The constraint's `ValidateFields` is not exported
        - **Decided: no generic `Payload` and no generic Val, 2026-11-04.** Write a Val per concrete type. Extracting a generic bare type
          (`type Items<T> = { items: T[] }`) and wrapping it is not recommended either. `model-only-in-valof` reports it.
          The docs state the fact in one sentence (allowed-types.md). It only forbids, with no alternative to show, so it needs no section or example.
          A generic Val is rejected on the type definition's line by the same constraint (§3, "2026-11-04: report on the type definition line too"). Both the types and the linter
          agree that data is defined with concrete types
      - **Cost.** The fixtures do not use `Payload`, so instantiations changed by core −51, trait −46, enum −114, and
        `index.d.ts` +0.51 kB (TypeScript 5.9.3). A probe with 20 Vals wrapped in `Payload` went 36,968 → 30,195
        (TypeScript 7.0.2). Why it decreased is unverified
    - **`Invalid` and `Refused` are expressed with symbol keys only, 2026-11-04.** This keeps `__valError` from becoming a reserved name.
      Both keys are unexported `unique symbol`s, so no user payload can take this shape
      - **The hole while they were string keys.** A payload field holding a string literal under `__valError` could not be told apart from `Invalid`
        and was rejected. In `Payload<Payload<{ f: () => void }>>`, the outer layer mapped `Invalid` to `Refused`, and
        the Val accepted the string-keyed `Refused` as an ordinary value
      - **`Validate` maps `Invalid` to `Refused` and `Refused` to `Invalid`.** Without the mapping the symbol-key
        rule still rejects them, but the message changes to "keys must be strings". With it, the original rule's message survives any number of wrappings
      - **`AnyTrait` rejects both markers (`Unrejected`).** A broken declaration puts a marker at the brand map's or the member set's position.
        A string-keyed marker was rejected because its message is not a function, but a marker with only symbol keys fits in
        `Record<string, …>`. Both the brand map's and the member set's positions got `[InvalidKey]?: never` / `[RefusedKey]?: never`
      - **Cost.** Compared with main (#121), instantiations core +107, trait +120, enum +257, `index.d.ts`
        +0.52 kB (TypeScript 5.9.3)
    - **Cost.** The fixtures do not use `Payload`, so instantiations rose only trait +4 and enum +39 (TypeScript 5.9.3).
      About +320 per Val wrapped in `Payload` (probe, 20 of them: 60,719 → 67,072). `index.d.ts` +0.55 kB
    - **Correction: the record that said it "cannot be added".** `feat/self-first-parameter` concluded from a probe that it "cannot be checked" and
      recorded leaving `Payload` as the identity. The observations were correct. `Payload<T extends Checked<T>>` raises TS2313, `Payload = Checked<T>`
      raises TS2456 / TS2615 on a self-referential payload, and with a `Validate` that does not map, the companion stays silent. Only the conclusion was wrong.
      ~~What becomes circular is the comparison outside `Checked` (`[T] extends [Validate<T>]`); `Validate<T>` alone does not.~~
      → Wrong, 2026-11-04. In a constraint, `Validate<T>` alone raises TS2313 too (probe). It does not become circular when written in the body,
      as `Payload = Validate<T>`. Reporting on the type argument was added through `ValidateFields` above.
      The silence goes away with the mapping. The record in §15.1 was corrected to match this item
  - **`HasSelf` stays.** It walks the parameters other than the first and the return value. The depth limit (§15.1, "Capping the search
    depth") is needed for the same reason
  - **Rejected: treating the first parameter specially as a receiver.** Valof avoids method syntax and chains with pipe.
    The first parameter is special because it is the data of a dual (§6.11), and OO vocabulary does not belong there
  - **Rejected: deciding the replacement by which companion the member is called from** (`User` for `User.same`,
    `Greetable` for `Greetable.same`). It removes the positional exception, but the box would have to drop members with `Self` outside the first parameter.
    That creates members whose declaration is accepted but which the box cannot call
  - **Rejected: renaming `Payload` to `Shape`.** In Valof, a shape means a trait's fields (`ShapeOf<Tr>`).
    The `-Of` convention already separates `Payload` from `PayloadOf`
  - **Rejected: adding a Val-only type (`AnyVal & DeepReadonly<Checked<T>>`).** In a probe it
    rejected bare objects, and the box could still call it. Add it when it becomes necessary. Adding it later is not a breaking change

---

## 10. Scope of v1

**In:**

- Branded types + `Val.sealer` / `Val.companion` + `.impl()`
- Restricted allowed types (Primitive / Val / ReadonlyArray / Record)
- No `undefined` as a value (optional keys are allowed)
- DeepReadonly
- The default `equals` and overriding it
- Origin decides whether a constructor exists (through the sealer or not)
- The constructor deep-copies its argument, with an explicit `.nocopy` (§4.1)
- Constructor registration splits into two (`implSeal` = the only gate that seals / `implCreate` = generates a payload and feeds it to the seal, §6.7 / §6.8)
- A `.impl` method's first parameter is fixed to the Val and needs no annotation (§6.5)
- `patch` (independent of Result, goes through the seal, cannot be overridden, §6.6)
- `Unpatchable<K>` and `PrivateSeal` (companion type arguments that exclude keys from `patch` / hide `seal`, §6.12)
- `Val.of` (calls the default seal with the type name, §2.2)
- `Val.unwrap` (the exit that takes out a mutable copy, §4)

**Out:**

TaggedEnum, Map/Set wrappers, Result, run-time freeze (except in dev), Date/Temporal, equals dispatch from a parent, the free-function versions `Val.equals` / `Val.with` / `deepEquals`, gating the constructor, `implSeal` / `implCreate` on the sealer

### 10.1 Supported TypeScript

**valof supports the last release of each major line and later.** The current minimum is 5.9.3, and the README says `TypeScript 5.9 or later`.

The minimum is not "the oldest version that works". Measured, **the 4.x line and 5.0.4 both pass**. valof still raises the minimum because nobody would need support for the edge cases a version in the middle of a line brings (half-landed flags, deprecations not yet in effect). A line's last release is where that line's semantics settle. With TS 7 as the latest line, the last release of the line two back is 5.9.3.

CI runs each line with `vp run ts-compatibility` (`scripts/ts-compatibility/`), **against the declarations in the published `dist`**.

It reads the scripts as fixtures too, but only when the pinned commit builds the same `dist` as now (§19).

#### Why the declaration files and not src

A `.d.ts` is a generated artifact, and another compiler produces it (`dts: { tsgo: true }` in `vp pack`). Type-checking src proves only that this syntax passes this compiler. It proves nothing about the result after emit.

Removing `protected readonly __valof_internal_phantom_types` from `Phantom` gives these measured results:

|                                             |                 |
| ------------------------------------------- | --------------- |
| `vp check` (tsgo, src)                      | pass            |
| `vp test` (285 tests)                       | pass            |
| doc blocks against `dist` (5.9 / 6.0 / 7.0) | fail in 9 files |

Declaration emit **erases the types** of private fields. In src, `private __brand: K` carries `K`, so `PayloadOf` works. After emit, only the `protected` line keeps the type argument. Removing it makes `patch` disappear and `PayloadOf` become `never` for users, yet checking src with any version stays green. **As long as checks look at src, the emit path goes unchecked**. That one fact is why this command exists.

#### The fixtures are the book's code blocks

`public-api.ts` (61 handwritten lines) was removed. It was a second copy of the API surface, and someone had to update it by hand on every API change.

Instead, the ```ts blocks in `docs/src` are written out to `docs/.generated/ts-compatibility/` and run. **The docs are maintained for their own reasons**, so the copying work disappears. The surface it runs also grew from 1 file to 29 blocks. In the measurement above, 9 files failed. That breadth is what makes it catch the change.

The 8 blocks with `// @errors` are excluded. Which error appears with which code shifts from one TypeScript line to another, and bare `tsc` has no place to put an expectation. `vp test` (twoslash, 5.9, against src) covers them. The split is as follows.

|                                               |                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| the doc check in `vp test`                    | Does the prose match the current `src`? Expected errors are checked here too |
| `vp run ts-compatibility`                     | Can users on each line use the published `.d.ts`?                            |
| `tests/val.test.ts` (73 `expectTypeOf` calls) | Type details, in depth, against `src`                                        |

Explicit annotations of the "types you do not write" (`Sealer` / `Sealed` / `CompanionBuilder` / `Companion`) were dropped, and nothing replaces them. `api.md` says there is no reason to import these types yourself, so an example in the book would contradict that chapter, and a test would protect code nobody writes. The doc blocks generate all four implicitly through dist, so if the internals break, those blocks fail.

#### Lines are pinned with aliases, not the registry

`typescript-5` / `typescript-6` / `typescript` sit in devDependencies, and the versions are read from `node_modules`. No npm install, no registry query.

**It used to read from the registry** (fetching the latest of each major above the minimum). The reason was that a written-down list goes stale the moment it is written, and a new major does not enter CI until someone notices. This was reversed. In practice, it cost a network dependency on every PR, and CI turned red without any change on our side. A new major comes in when someone adds one alias.

The 7.x line runs too. It is the same line as tsgo in `vp check`, but that checks src, and this checks dist. Users go through a different path. It is a Go implementation, so the extra cost is close to nothing.

When this rule went in, only 6.0.3 failed. The cause was not the library. TS 6 had removed the fixture's `baseUrl`. **Only running each line catches this kind of thing**.

#### Resolving through `exports`, 2026-10-25

**It used to point `paths` straight at `dist/*.d.ts`.** That bypassed `exports`, so declarations could reference any file in `dist`. The problem of users' declaration output failing (§18.4) stayed invisible. Before the fix, CI was green while 13 of the book's code blocks failed.

Now `dist` and `package.json` are copied into `node_modules/valof` in the working directory. This is the same layout npm installs, and `exports` decides what declarations can reference. `paths` was removed.

- **The working directory gets its own `package.json`.** Without it, `valof` resolves to this repository by self-reference and skips the copy
- **Forms the book does not have go in `scripts/ts-compatibility/fixtures/*.ts`.** They run together with the book's code blocks. There are three now: exporting a builder before build (which references `CallBuildFirst`), and companions given `PrivateSeal` and `PrivateCreate`
- **The fixtures are excluded from oxlint's type checking.** CI runs `vp check` before the build, and the fixtures' `valof` looks for `dist` by self-reference, so it fails with no `dist`

The changes the check catches were measured. With `paths` restored, removing `./internal/*` stays green.

| change                                        | what fails                                                      |
| --------------------------------------------- | --------------------------------------------------------------- |
| remove `./internal/*`                         | 9 book blocks and the fixture's builder                         |
| turn `PrivateSeal` back into an alias         | the fixture's `PrivateSeal` (TS4094)                            |
| turn `PrivateCreate` back into an alias       | the fixture's `PrivateCreate` (TS4094)                          |
| remove the working directory's `package.json` | 5.9 only (TS2209, the root is ambiguous through self-reference) |

#### Declaration round trip, 2026-11-03

**For every export of the book's blocks and the fixtures, the types check that the type from source and the type read from the emitted `.d.ts` are identical.**
Declaration output can lose types without an error. Up to 7.0, it truncates deep types to `/*elided*/ any` (§18.5).

```ts
import type * as S0 from "../fixture-builders.js";
import type * as D0 from "../dts/fixture-builders.js";
export type _0 = Expect<Equal<typeof S0.traitImpl, typeof D0.traitImpl>>;
```

- `Equal` is `(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2`. It tells `any` apart from other types.
  It treats a `type Greetable = Trait<…>` declared separately in the source and in the `.d.ts` as identical (probed on 5.9 / 6.0 / 7.0)
- Values are compared through `typeof`, types as they are. A generic type is wrapped as `<T0>() => S.Result<T0>`. A type argument with a constraint cannot be wrapped,
  so the enumeration throws when one appears (none does now)
- The exports are enumerated with the `typescript-5` checker (`getExportsOfModule`). It follows `export *` too
- With the `dist` from before the fix (`3bf3e34`), `greetableBuilder`, which contains `/*elided*/`, failed on all 3 lines.
  `/*elided*/ any` changes an export's type, so the round trip replaced the string search

**It compares by identity, so two types that mean the same but print differently fail.** When it was added, `byTag`, `circle` and `variantDone` failed.
The `.d.ts` expands and prints unexported aliases (`ByTag`, `Frame`, `VariantSupplied`). Expanding them resolves
`keyof VariantsOf<Shape>` to `"Circle" | "Rect"` and drops the `& {}` from `{…} & {}`. The three are now exported, so they
print by name (`valof/internal/enum`, §18.4). The fixtures' declarations went from 36.8 kB to 33.8 kB, and `index.d.ts`
grew by 0.02 kB.

**Rejected: an exclusion list for exports that do not round-trip.** It would hide an export whose type collapses to `any`. For valof's types,
exporting them so they print by name fixes it.

**The scripts do not round-trip. They search for `/*elided*/` as a string.** Classes that extend `ErrorFactory(…)`, and types that reference them, fail
(20 of 34). The base type is a conditional type alias (`ErrorInstance<…>`), and the `.d.ts` prints it resolved. An alias from another
package cannot be made to print by name.

**What does not round-trip.** An enum, a `unique symbol` and a class with private members are not identical once the `.d.ts` redeclares them
(probed on 5.9 / 7.0). The current book and fixtures have none. When one appears, add a way to compare it.

**Cost.** ts-compatibility went from 4.4 s to 9.1 s (locally). The round-trip tsc takes 2.4 s per line on 5.9, and
1.1 s on 7.0. Most of it is comparing the enum builder. `variantStart` alone takes 620,000 instantiations.

**The lines run in parallel.** Each line writes to `dts/<alias>` and `round-trip/<alias>`, and the report comes out in the order of `aliases`. 9.1 s
became 5.2 s. Nothing checks that each line reads its own output. Every known way to break it fails all 3 lines at once, so
reading another line's `.d.ts` would still pass.

---

## 11. Where to surface type errors

Detecting a rule and making the compiler treat it as a failure are two different things. Computing a marker and putting it in a type checks nothing. There are only two places to put it.

### 11.1 A: parameter position

The check's result becomes the argument's type.

```
Argument of type '{ tag: (x) => string; }' is not assignable to
  parameter of type '"another trait already answers to one of these names"'.
```

The sentence appears as is, so it is readable. Each entry point needs its own, and one is easy to forget.

Putting it in the return type is not A. The failure lands on the line that assigns the companion, away from the call, and reads as a different problem (see the JSDoc of `Takes`).

### 11.2 B: verdict position

The marker goes in the type of a private field, and a constraint elsewhere reads it. `V extends AnyVal` and `Tr extends AnyTrait`
are those constraints.

```ts
declare class Verdict<X> {
  private readonly __valof_internal_verdict: X;
}

export type AnyVal = Phantom<string, unknown> & Verdict<true>;
```

**It cannot share the brand's key.** `Brand<K, T, Tr>` used to be a conditional type that chose between returning `Phantom<K, T>` and
putting `Invalid` in `__valof_internal_phantom_brand`. When a member of an intersection is a conditional type,
it is evaluated when the alias resolves. Comparing a payload with its own image needs the payload's properties, so
a self-referential type (§3.7) raised TS2456 there. Resolving an alias does not read a private field's type, so
the verdict moved there.

The message is more readable, since it carries the key name.

```
Type 'Bad' does not satisfy the constraint 'Phantom<string, unknown> & Verdict<true>'.
  Type '{ f: Invalid<"functions are not allowed"> }' is not assignable to type 'true'.
```

The check also moved out of the value's shape. `Val` is `DeepReadonly<Grounded<T>>`, so an invalid payload's shape stays as written.
`Grounded` turns only payloads that cannot carry a brand (`null`, `undefined`) into an empty object. Without that,
`null & Phantom` becomes `never`, and **`never` passes every gate**.

```
Type 'Wiring' does not satisfy the constraint 'AnyTrait'.
  Types of property '__valof_internal_phantom_trait_brands' are incompatible.
    Type 'Invalid<"a trait member cannot take a name the library wires">' is not
    assignable to type 'Readonly<Record<string, AnyMember>>'.
```

Every entry point goes through the same constraint, so one place covers them all. The message nests by structure. The rules users face are not that complicated, so wrapping them in `Invalid<>` is enough.

### 11.3 The criterion

**What the check reads decides its position.**

If the check reads only the type arguments, it goes in B. Put on the brand, it closes `Val`, `Dyn`, companions and both forms of `implTrait` at once.

- The payload's allowed types (`Phantom`)
- The trait shape's allowed types, and agreement between shape and payload (`Fits`)
- Member names and returning `Self` (`Declarable`)

If it reads state the caller has built up, it goes in A. That state does not appear in the type arguments, so the brand cannot hold it.

|                                   | what it reads                                |
| --------------------------------- | -------------------------------------------- |
| name clashes in `Grown` / `Takes` | `T`, and what `.impl` has added so far       |
| `Complete` / `Shared`             | `G`, inferred from the companion passed in   |
| `Implement`                       | the object passed in                         |
| `CheckedSeal`                     | the parameter type of the function passed in |
| reserved names in `CompanionFns`  | the object passed in                         |

Not everything can move to B. The table above marks the boundary.

### 11.4 A third position checks nothing

The same shape of bug showed up three times. Each one put the marker where nothing reads it.

- `TraitBrand` put `Invalid` in `__valof_internal_phantom_trait_brands`. `AnyVal` looks only at `__valof_internal_phantom_brand`, so a Val whose shape did not fit passed the constructor.
- `Declarable` was referenced only from the return type of `Trait.companion`. `implTrait` without a companion does not pass through there, so members claiming the names `equals` or `patch` landed on the Val. At run time `N.equals(a, b)` called the trait's implementation, which takes only one argument.
- `Checked<Shape>` in `Trait` left the marker on the shape side of an intersection. No constraint reads it there.

None of these was A or B. **When you write a new check, confirm it sits at A or B.** If it sits at neither, the check does not exist.

The way to confirm is mutation. Remove the check and see whether the `@ts-expect-error` becomes unused. If nothing goes red, the test checks nothing.

### 11.5 Dropped alternatives

- **Putting it in the return type** (§11.1). Considered once for `Takes`, and rejected.
- **Writing both A and B.** After `Declarable` moved to B, the A-side gate left in `Alone` was removed. When the same check lives in two places, fixing the B side leaves the A side behind as an unreachable defence. In fact, adding `Fits` made `V extends ShapeOf<Tr>` in `Takes` unreachable, and it was dropped.

---

## 12. Naming

### 12.1 Package name: `valof`

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

### 12.2 Type name: `Val`

**Kept.** It is short, so the declaration `Val<"User", {...}>` adds no noise. Using one name for both the type and the namespace (the `Val` type + `Val.of` / `Val.companion`) is also idiomatic TypeScript.

The concern that "Kotlin/Scala's `val` means immutability of the binding (TypeScript's `const`), not of the value, so the analogy is off" was rejected. TypeScript programmers know that `const` means no reassignment, so there is little room for confusion. Even a confused reader stops at "why do I need a library when I have `const`?", so the README's opening clears up the misunderstanding by itself. A note about it would give the reader a concern they did not have.

A known weakness is that `Val` is a common three-letter word, so it easily collides with local identifiers. Until it is as well known as `_` (lodash) or `z` (zod), some users may have to work around it with `import { Val as V }`.

**Rejected candidates:** `Value` (accurate, but long, and collides worse), `Vo` (cryptic), `Nominal` (does not feel like a value object), `Data` (clashes with Effect)

---

## 13. API shape decisions (during implementation)

A record of the deliberation that settled on `Val.sealer<V>().impl({...})` / `Val.companion<V>().impl({...})`. Each option was actually compiled and checked.

At the time, the smart constructor was named `from` and passed as a key of `.impl`. The text below keeps the spelling of that time. Today it is `seal`, registered with `.implSeal` (§6.9), and writing it in `.impl` is a type error (§6.5).

### 13.1 Why two calls: partial inference of type arguments

The Val type `V` must be explicit (it cannot be inferred from a value), while the methods `M` should be inferred. But **TypeScript does not infer type arguments partially**. Once one is explicit, the rest are not inferred and fall back to their defaults ([microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242), the `_` placeholder proposal, unimplemented since 2018).

So `Val.companion<User>({ ... })` **cannot be written**. Currying is the only option.

### 13.2 Rejected: `M` as the second type argument

```ts
function companion<V extends AnyVal, M extends CompanionMethods<V> = Record<never, never>>(
  methods: M,
): Companion<V, M>;
```

With a default on `M`, it **compiles but breaks silently**. `companion<Age>({ from })` falls back to `M = Record<never, never>`, and

- the user's methods disappear from the companion (`A.greet` does not exist)
- `patch` no longer returns `ReturnType<typeof from>`
- the gate of that time (§6.1) is disabled, and `A(30)` **passes without an error**

Without a default it raises `Expected 2 type arguments, but got 1`, and the caller has to split out a `const` and write `typeof`: `Val.companion<User, typeof methods>(methods)`. That is more verbose than an empty `()`.

### 13.3 Rejected: inferring `V` from a value-level token

```ts
declare const __token: unique symbol;
export type TypeToken<V extends AnyVal> = { readonly [__token]: V };
const TOKEN = {} as TypeToken<never>;
export function type<V extends AnyVal>(): TypeToken<V> {
  return TOKEN as unknown as TypeToken<V>;
}

Val.companion(Val.type<User>(), { greet }); // both V and M are inferred
```

One call infers both, and it actually works. Making `[__token]` optional weakens inference, so it is a non-optional phantom, and the cast stays in one place, inside `type()`.

Rejected on cost versus benefit. The empty `()` goes away, but a public type `TypeToken`, a function `Val.type` and a run-time object are added. Currying is an idiom TypeScript users already know, from zustand's `create<T>()(...)` among others, so it beats adding an unfamiliar concept.

### 13.4 Rejected: inferring `V` from a sealer passed as an argument

This option passes the sealer itself instead of a token. `from` uses the sealer anyway, so it is a real value, and both `V` and `M` can be inferred without another phantom (verified to work).

```ts
const seal = Val.sealer<Age>();
export const Age = Val.companion(seal, { from });
```

Rejected because of **line count**. `Val.of<Age>(n)` does the same lifting, so a private sealer is not really needed. This form forces an extra `const seal = ...` line just to fix `V`. An empty `()` costs less.

### 13.5 Rejected: passing an argument to the first call

The only arguments that fit in the `???` of `Val.companion<V>(???)({ ... })` are **those whose type `V` fully determines**. The first call already has an explicit `V`, so an argument that needs inference of its own runs into exactly the same limit as §13.1.

```ts
declare function companion<V extends AnyVal, R = never>(from: (value: SeedOf<V>) => R): …;

companion<Age>((n: number): Result<Age> => …);
// TS2345: Argument of type '(n: number) => Result<Age>' is not assignable
//         to parameter of type '(value: number) => never'   ← R stays at its default
```

Moving `from` there loses `R`, and with it the type of `Age.from` and the return type of `patch` (breaking §6.3's "the library passes the type through without knowing what is inside the Result"). `from` lives in the second call's object because that call has no explicit type arguments at all, so both `M` and `R` are free to be inferred.

Three-step currying, `Val.companion<Age>()(from)({ ... })`, works, but it is worse than `()()`.

### 13.6 Rejected: a Rust-style builder

**2026-10-23: reversed. Every companion's chain now closes with `.build()` (§6.12, "Close the chain with `.build()`").**
Only one reason for rejection below still holds: the extra length.

```ts
Val.builder<Age>().from(fn).impl({ label }).build();
```

Each step is a separate call, so the return type of `from` is inferred on the spot, and `build(): "from" extends keyof M ? Companion<V, M> : Sealed<V, M>` can express whether the result is callable. It compiled too.

Reasons for rejection:

- Every case gets longer (`Val.sealer<Tags>()` → `Val.builder<Tags>().build()`)
- `.build()` is pure ceremony, and it cannot be skipped. If each step doubled as the companion, `Age.from(30)` would collide with a builder step, so a terminator is needed
- Rust has builders in the first place because it lacks named and optional arguments. In TypeScript, object literals play that role, and `.impl({ from, equals, ...fns })` **already is a TypeScript-style builder**

### 13.7 Adopted: `sealer` / `companion` + `.impl()`

**2026-10-21: `sealer` was removed, leaving only `companion` (§6.12).** The argument-less `.impl()` was removed too. `Val.companion<V>()` is the companion as is. **2026-10-23: it now closes with `.build()` (§13.6).**

- **`sealer`**: the `-er` keeps it from being misread as `Val.of`. The name shows that it returns a function, not a value
- **`.impl()`**: originally the means of attaching members was split in two, `.companion()` (on the sealer side) and `()({...})` (on the companion side), and the only difference was whether the result was callable, which was hard to see. Unifying on `.impl()` moved the difference onto **the one axis that means something**: `sealer` or `companion`. `methods` was not adopted because it suggests a class (values do not get methods). `fns` is a tautology, since everything inside is a function. `impl` also matches Rust's `impl` block

A bare `Val.sealer<V>()` / `Val.companion<V>()` is also a complete companion with the default behavior (`equals` / `patch`). A Val with no methods does not have to write `.impl({})`.

### 13.8 Secondary decisions

- **`-0` and `0` are equal.** `JSON.stringify(-0)` is `"0"`, so a round trip erases the difference. This is the same argument as for `undefined` in §3.5, which makes the difference between the two paths unobservable. The implementation is `a === b` with special handling for NaN only
- **This repository's `tsconfig.json` enables `exactOptionalPropertyTypes: true`.** Having strongly recommended it in §3.5, valof follows it itself. The tests that reject `undefined` for a required key do not pass without it

---

## 14. valof-lint

Investigated 2026-09-03, implemented on the `feat/valof-lint` branch. As of 2026-09-07 it is not merged into `main`. The rules are in §14.4, §14.7, §14.12, §14.14 and §14.15, and §14.8 describes the layout.

A function inside `.impl({...})` is never reported as dead, and never dropped from the bundle. `attach` puts it on the companion with `Object.defineProperty` at run time, so static analysis sees only "an object literal passed to a function".

Measured, not guessed:

- **knip 6.34.0** reports a plain unused `export function`, but says nothing about an unused companion function next to it. Neither the `--exports` shortcut nor any other issue type detects it
- **vite/rolldown** drops an unused exported function from the bundle, and keeps the companion

### 14.1 Why a standalone script

- **A knip plugin cannot do it.** `IssueType = keyof Issues`, and `Issues` is a fixed record in core (files, dependencies, exports, types, enumMembers, namespaceMembers, cycles, ...). There is no category for "a member of an exported object", and a plugin cannot add one. A plugin's hooks (`resolveFromAST`, `registerVisitors`, ...) can return only `Input[]`. They can mark something as used, but cannot report something as unused
- **A lint rule cannot do it either.** ESLint and oxlint both work per file: a rule looks at one file's AST and attaches its reports to that file. A cross-file rule such as `import/no-unused-modules` walks the project on its own, outside the lint model. An ast-grep `sg scan` rule cannot do it either, for the same reason

**Correction, 2026-09-07.** The item above originally said "oxlint runs in parallel, so accumulated state cannot be trusted". The type definitions in `@oxlint/plugins` include `createOnce`, which creates a rule once and reuses it, so **a rule can accumulate state**.

```ts
interface CreateOnceRule {
  createOnce: (context: Context) => VisitorWithHooks; // + before / after
}
```

The conclusion stands, for a different reason: **a rule can accumulate state but cannot report it.** `before` / `after` are hooks around the traversal of one file, not a hook at the end of the whole run. There is nowhere to flush the state, and `context.report` attaches to the file currently being visited. By the time the rule learns about a child's `implEquals`, the parent's file may already have been traversed.

- **A JS plugin cannot use oxlint's type-aware linting either.** A JS plugin receives `ast` / `scopeManager` / `visitorKeys` / `lines` / `lineStartIndices`, and no types. `parserServices`, where typescript-eslint passes in the checker, is always empty, and the type definitions state "Oxlint does not offer any parser services". The types live in a Go binary in a separate process (`oxlint-tsgolint`), and the type-aware rules are built-in rules inside it. No API connects the two

A companion member is reached only as `Companion.member`. Collecting the top-level keys of each `.impl({...})` and counting `Name.key` across the project is enough.

### 14.2 Parser: `oxc-parser`, not `@ast-grep/napi`

We prototyped both, and they gave the same results. On a 400-file corpus, oxc installs at 3.2 MB and runs in 21 ms; ast-grep installs at 7.2 MB and runs in 76 ms. The oxc version is 33 lines longer, because a hand-written ESTree walk replaces ast-grep's pattern DSL (`const $N = $B.impl($OBJ)`). `oxc-parser` exports `visitorKeys`, so the generic descent takes 10 lines. It also shares a lineage with oxlint / oxfmt / Rolldown. The deciding factor is that the optional peer dependency is the only cost a user pays to run this. Halving that cost beats having the DSL.

The first prototype was text-based, and missed `User["greet"]`, renamed imports, destructuring and nested `.impl`. The current version still misses anything name resolution cannot follow: chains of `export { X as Y }`, `import * as ns`, computed keys, and spreads into `.impl({...base})`.

### 14.3 Ship it inside valof

Verified on 2026-09-04 by packing a test package and installing it. A `bin` entry, with `oxc-parser` as an _optional_ `peerDependencies` entry, costs nothing to a user who does not want it. Measured in the user's `node_modules`: valof alone is 36 KB (the parser is not pulled in, the install prints no warning, and the bin asks the user to install the parser and exits 2). Opting in makes it 7.3 MB. `dependencies` stays empty, so the claims of zero runtime dependencies and about 1 kB hold. `scripts/bundle-size.ts` bundles only `./dist/index.mjs`, and `dist/lint-cli.mjs` next to it is not reachable from there.

This beats the two alternatives. A README recipe has no tests and no version, and a separate package adds another package to release. A bin inside valof uses the existing release workflow and is tested here.

#### Re-evaluated 2026-09-07: the reason changed

The decision to ship it inside valof stands. **But none of the three reasons above was decisive.**

The linter was 252 lines at the time of the decision. It is now 1465 lines, larger than the 809-line library itself. The linter is larger in the shipped files too.

```
source   library  809 lines / linter 1465 lines
shipped  library 27.0 kB / linter 36.6 kB   ← linter is 58%
tarball  32 KB
```

**The real reason is that the rules track the library's API vocabulary.** There is evidence. When we merged `main`, the linter followed the rename of `with` to `patch`.

```
BUILTIN = ["equals", "with", "update", "seal", "create"]
       →  ["equals", "patch", "update", "seal", "create"]
```

The linter followed the removal of `update` (§6.4) too. BUILTIN now has four entries, and `update` is once more a member a user can write.

So did `.unpatchable` → `.fixed`, and the new `.implEquals` step. The rule in §14.7 builds directly on how `EqSpec` is spelled (an array per element, a tuple per position, a companion passed as is). The chain's root (`Val.sealer` / `Val.companion`) and the five names `.impl` rejects are library decisions too.

**A separate package would always drift.** Every release would open a window where "valof 0.5.0 uses `patch`, while valof-lint 0.4.x still looks for `with`". Living in the same repository keeps the vocabularies in step implicitly.

#### The cost

- **tarball 32 KB → 39 KB.** This is the growth from shipping `valof/lint`, almost all of it `dist/lint/index.d.mts` (14.9 kB). `Finding` is derived from `RULES`, so the declaration pulls in the rules' whole type graph
- **58% of the shipped files are the linter.** The README's "1 kB gzipped" is the **bundle size**, and `scripts/bundle-size.ts` measures only `dist/index.mjs`, so the claim holds. Download size is different. `npm i valof` puts the 36 kB linter into `node_modules`
- **Release granularity is coupled.** A linter-only fix bumps the library's version. This has not caused a problem yet, because both are still changing

#### When to split

Decided in advance:

- When the library is stable and **linter-only releases keep coming**
- When a linter dependency threatens to leak into the runtime dependencies (it does not now, because `typescript` is spawned without being declared)
- When the linter's share of the shipped files grows further

A split means a monorepo. `pnpm-workspace.yaml` already exists, so the repo divides into `packages/valof` and `packages/valof-lint`, and the release workflow can be shared. Above, a separate package was rejected because it "adds another package to release", but in a workspace that cost is small. In exchange, `valof-lint` carries `peerDependencies: valof`, and **the vocabularies are kept in step by declaration rather than implicitly**.

### 14.4 Rules

Ten rules decide from syntax alone. The remaining one uses go-to-definition (§14.7).

- A companion member nobody reads
- A brand string claimed by more than one **top-level** type alias
- A brand string that does not end with the type name (§14.12)
- A type alias that is a second name for a Val (§14.25)
- A companion bound to a name different from the type's (§14.21)
- A companion of a type declared in another file (§14.22)
- `Val.of` on a type that has a companion (§14.23)
- `Val.of` without a type argument (§14.24)
- A disable comment that names no rule (§14.14)
- A disable comment that silences nothing (§14.15)

Limiting the brand rule to top-level aliases matters. Without the limit, this repository's own tests report 30 collisions from fixtures scoped inside `describe` and `test`.

This repository's `src` uses no companions, so the dead-member rule never fires here. It targets valof's _users_.

### 14.5 Rejected: ts-morph, 2026-09-04

Rewriting both checks with ts-morph takes 50 lines excluding comments, against the current 252. `findReferencesAsNodes()` replaces the whole read-tracking pass, and `getType().getAliasSymbol()` identifies a companion as `Sealer` / `Sealed` / `CompanionBuilder` instead of the name-based root check. The cost: 15 MB installed against 3.2 MB, and 0.31 s against 0.06 s on two files.

**ts-morph does not use TypeScript 7.** `@ts-morph/common` does not depend on `typescript`; it bundles its own compiler (12 MB of the 15 MB). So waiting for the TS 7.1 API means waiting for ts-morph's port, not for a TypeScript release. `typescript@7.0.2` exports only four things: `default`, `module.exports`, `version` and `versionMajorMinor`.

To justify the cost, we prototyped two type-based rules and rejected both.

- **Narrowing the duplicate-brand check by payload assignability is wrong.** With structural subtyping, "different payloads" does not mean "kept apart". `Val<"Id", {a: string; b: number}>` is assignable to `Val<"Id", {a: string}>` (verified). A two-way `isAssignableTo` check works in exactly the direction that misses this leak. This library exists to enforce nominal types, so a brand collision is a defect whatever the payload
- **Detecting a parent that compares a child with a custom `equals` structurally is too strict to use.** It works (verified with local type aliases, arrays, and across two files, and it stays silent on a child with no override). But an override not propagating is the design itself (§5, §7.6), so the rule fires N×M times with nothing the user can do about it. If revisited, it should report once, at the override's definition, and list where it is nested. That points at the "build in canonical form" recipe

Detecting _who overrode_ `equals` is a syntax question under either approach, because `Companion<V, M>` types `equals` as `(a, b) => boolean` whether or not it is overridden.

#### Re-evaluated 2026-09-07: wait for TS 7.1

The `implEquals` spec landed, and §5 assigned the detection of a forgotten entry to the linter. That made a rule needing types concrete for the first time (§14.7), so we re-measured the premises.

**2026-09-15: that rule was withdrawn (§14.7).** No rule needs types now, and valof-lint does not use TypeScript.

**The TS 7 API still has two keys.** The record above still holds.

```
$ node -e "const ts=require('typescript'); console.log(ts.version, Object.keys(ts))"
7.0.2 [ 'version', 'versionMajorMinor' ]
```

This repository itself is on `typescript@^7.0.2`, so adopting ts-morph means **analysing TS 7 users' code with a bundled TS 5-series checker**.

**What 7.1 stabilizes is the Language Service API.** The iteration plan (microsoft/TypeScript#63703, beta 2026-10-06, stable 2026-11-24) lists three items: Language Service / Emit / Content Mapper. **It does not mention the TypeChecker.**

That is enough, because the rule in §14.7 needs go-to-definition, not the checker.

1. "Is the `Money` in this property position a Val?" → follow the reference to its declaration, and read the declaration syntactically. The LS is enough
2. "Did that companion call `implEquals`?" → a syntax question, as above. Having the checker would not change it

`findReferencesAsNodes()` and `getDefinitionNodes()` are both **LS wrappers in ts-morph, not checker wrappers**. Once the LS is stable, plain `typescript` provides the same thing.

**Supporting TS 7 means re-architecting ts-morph.** `@ts-morph/common` is designed to bundle its own compiler instead of depending on `typescript`, so porting it to a Go compiler is not a version bump. ts-morph's API is fully synchronous, so if the 7.1 API is async, it cannot be ported and stay synchronous. We cannot assume it will be ready by 2026-11.

**ts-morph's only remaining advantage is sparing us the `LanguageServiceHost` boilerplate.** Implementing `getScriptFileNames` / `getScriptVersion` / `getScriptSnapshot` / `getCompilationSettings` / `getDefaultLibFileName` takes about 60 lines, written once. The manipulation API is not needed as long as the output is a text suggestion such as "add `total: Money` to the spec".

**The LS is offset-based, which favors oxc.** `findReferences(fileName, position)` returns `{ fileName, textSpan }`, not a node. An API that returns nodes helps when the analysis lives in ts-morph, but nodes are useless when the analysis lives on the oxc AST. The code already handles offsets with `lineIndex`.

**With plain `typescript`, the optional peer dependency is effectively free.** Every TS project already has it, so the 3.2 MB vs 15 MB argument above disappears altogether.

So **ts-morph is off the table.**

#### 2026-09-07, continued: no need to wait

The section above concluded "wait for 7.1, then add plain `typescript`". **Withdrawn.** It works today, on 7.0.

**TS 7.0.2 has `tsc --lsp --stdio`.** Measured:

```
initialize                34 ms
didOpen x200               5 ms
serial 50 queries         76 ms   (1.52 ms/query)
pipelined 200 queries      5 ms   (0.03 ms/query)
non-empty results    200 / 200
```

Sending `textDocument/definition` at the position of `total: Money` returns the type alias declaration in `money.ts`. The capabilities are all there too (`definitionProvider` / `typeDefinitionProvider` / `referencesProvider` / `implementationProvider` / `hoverProvider`).

**There is one pitfall.** The server sends `client/registerCapability` **as a request**. Without a reply, it deadlocks.

**Speed is not an issue.** Warm queries take 0 ms and hit the checker's cache. LSP multiplexes by id, so requests can be pipelined, collapsing the wait into one round trip. The worry that "each query is a round trip, so we need a filtering pass first" is gone.

**5.x / 6.x have no LSP, but have an in-process API.** The two complement each other.

|               | in-process API                                  | LSP                                        |
| ------------- | ----------------------------------------------- | ------------------------------------------ |
| 5.9.3 / 6.0.3 | yes (2244 / 2248 keys, `createLanguageService`) | no (`--lsp` is an Unknown compiler option) |
| 7.0.2         | no (2 keys)                                     | yes                                        |

We measured `getDefinitionAtPosition` / `textDocument/definition` on both.

|       | path                    | cold   | per query                          | results |
| ----- | ----------------------- | ------ | ---------------------------------- | ------- |
| 5.9.3 | `createLanguageService` | 166 ms | 0.15 ms                            | 200/200 |
| 6.0.3 | same                    | 159 ms | 0.20 ms                            | 200/200 |
| 7.0.2 | `tsc --lsp --stdio`     | 34 ms  | 1.52 ms serial / 0.03 ms pipelined | 200/200 |

**The old path is faster per query**, because it has no IPC round trip. tsgo is faster cold. `LanguageServiceHost` took 13 lines; the original estimate of 60 was too high.

Both return `{ file, offset }`, so one function can wrap both.

```ts
type DefinitionAt = (file: string, offset: number) => { file: string; offset: number }[];
```

**As a result, the linter covers everything from the 5.9.3 floor to 7.x without a gap**, in about 100 lines in total. No user is left behind.

#### Do not send `textDocument/didOpen`

Measured during the 2026-09-07 implementation. **Sending `didOpen` for every scanned file makes the first query 10 times slower.**

```
rootUri=repo, didOpen 65 files  init 24 ms | didOpen 2 ms | first query 436 ms
rootUri=repo, no didOpen        init 30 ms | didOpen 0 ms | first query  45 ms
```

The answers are the same. `didOpen` is for buffers an editor holds unsaved, and the linter reads files on disk. The server loads the project from `rootUri` and lazily opens the files a request names. Sending every file makes it build a document for each one, and the first query waits for all of them.

The whole CLI went from 580 ms to 213 ms on 65 files. **The gap widens as the file count grows**, so real projects gain more.

Files in `tsconfig.json`'s `exclude` resolved too (this repository's fixtures are exactly that case), because the server creates an inferred project.

What remains is 30 ms of init and 45 ms for the first query, once per run. **We do not keep the process alive to amortize it.** A lint run starts only one LS anyway, and carrying it across runs needs lifecycle and staleness management. A linter that runs once in CI should not pay that complexity for 75 ms.

#### `typescript` is not a peer dependency

`oxc-parser` is an optional peer dependency because the linter **`import`s it into its own process**. Module resolution has to find the user's copy, and two copies mean two parsers.

`tsc` is different. On 7.x the linter spawns it as a subprocess, and on 5.x / 6.x it `require`s it, but **it never hands a TS object back to the user**, so there is no single instance to share. The binary it shells out to is an external tool, like `git`.

At run time the linter resolves the user's own `typescript` and branches on the major version in `typescript/package.json`. Without one, it skips this rule alone without failing, and says why.

Not declaring it has these benefits: zero install footprint, no peer warnings and no ERESOLVE, no version range to keep up with TS releases, and it works with whatever TS a monorepo pins.

We also measured declaring it as a peer dependency. No nested copy was created (as the definition of peer says), and pnpm v11 stopped at the warning `[WARN] Issues with peer dependencies found`. Nothing breaks the user's code. But `typescript@7` is a thin shim whose real content is a 26 MB platform-specific optional dependency, so a duplicate would cost real space. Since we do not declare it, the issue does not arise.

|              | dependency form                   | when missing                               |
| ------------ | --------------------------------- | ------------------------------------------ |
| `oxc-parser` | optional peer (imported)          | the whole CLI exits 2 and asks for install |
| `tsc`        | not declared (spawned / required) | only the equals rule is skipped            |

#### The AST pass stays

The reason changed from speed to **correctness**. A negative control queried column 0 of `export type Gen0 = ...` and got back the definition of `Gen0` itself. **Pass an imprecise position, and the server resolves some other identifier nearby.** The oxc walk produces the exact offsets. The code that follows usages starting from imports of `valof` is not replaced. It stays **as a filter on query positions**.

### 14.6 Bundle size of the namespace itself

`Val` is itself a companion, so the blind spot of §14 reaches this library's own surface. A bundler cannot drop properties of `const Val = {...}`, so a module that calls only `Val.of` still keeps `sealer`, `companion`, `unwrap`, `attach` and `deepEquals` (the same limit `eqBy` hit in §5).

Splitting the namespace into named exports was considered and rejected on 2026-09-03. It does nothing for users' companions, it duplicates the API, and a library that only wants a brand can write one in a few lines.

#### Measured the split, 2026-09-15

After `equals` became a free function (§5), we revisited whether `of` / `unwrap` / `sealer` / `companion` should follow. Production gzip bytes:

| usage                          | now | only `unwrap` free | all four free |
| ------------------------------ | --: | -----------------: | ------------: |
| `of` only                      | 659 |                650 |       **273** |
| `unwrap` only                  | 659 |                274 |           274 |
| `of` + `equals` (no companion) | 852 |                843 |       **479** |
| `of` + `unwrap` + `equals`     | 852 |                852 |           493 |
| `sealer` only                  | 659 |                650 |           630 |
| `sealer` + `companion`         | 659 |                650 |           636 |
| `sealer` + `equals`            | 852 |                843 |           825 |
| everything                     | 852 |                852 |           842 |

**The 2026-09-03 rejection was right by the numbers.** An app that uses companions goes from 852 to 842, 10 B. Calling `sealer` even once pulls in `build` / `attach` / `patched`, so moving `of` out drops nothing.

**Making only `unwrap` a free function saves 9 B**, less than the 44 B §4 estimated. `detach` is just a second form of `deepCopy`, and `own` always keeps `deepCopy`. This idea is withdrawn.

**Only an app that never defines a companion gains.** 852 → 479, 373 B, more than the 193 B gained by splitting out `equals`. So whether to split depends not on size but on **whether we support types + `of` + `equals` alone as an entry point**. As long as the README starts from `Val.sealer`, those 373 B reach nobody.

`Val.of` stays, for reasons other than size.

- `seal<User>(x)` has the same name as `User.seal(x)` (the custom seal, the only gate in §6.8), and skips it. The `bypassed-companion` rule exists because it can be skipped. `Val.of` looks like a different operation (§2.2)
- `unnamed-of` makes the type argument required, so even as free functions, `seal<User>(x)` alone would be called differently from `equals(a, b)` / `unwrap(v)`. Side by side, they would not line up
- `unnamed-of` relies on `Val.of<User>` being greppable. A free function can be renamed on import, so two rules would need the same import tracking as `aliased-val`
- It is the only place the package name appears in the API (§12)

#### Measured a subpath too. Still no

The idea: ship free functions `of` / `unwrap` from `valof/experimental`, and only minimal users call them. Adding the entry and measuring shows it works. `of` from `experimental` + `equals` from `valof` comes to 476 B, 373 B less than `Val` + `equals` at 849 B. Importing both is 850 B, so there is no duplication penalty.

- rolldown hoists what the two entries share into `dist/val-*.mjs`, and each entry becomes two lines of re-exports. **This is a precondition.** If the shared part were duplicated instead of chunked, there would be two `owned` WeakSets, and `patch` would not see a value sealed through `experimental` as an owned node (breaking, path by path, the basis on which §6.2 separates replacement from merge). Check this every time an entry is added
- The dts is split too, and `dist/index.d.mts` shrinks from 14.84 kB to 321 B. The types budget in `scripts/size.ts` looks at this file's raw size, so adding an entry means switching it to the shared chunk, or to the total of every `.d.mts`

**Rejected, because "Parse, don't validate" is the core of this library.** Using it without defining a companion means using it without a seal. An official entry point for that would promote a path that skips parsing. The 373 B is the price of that principle. A user who wants speed over checks can write their own util. We came back to the same conclusion as on 2026-09-03 ("a few lines to write yourself"), now backed by measurement.

### 14.7 Rule: structural comparison of a child with a custom equals, 2026-09-07. Withdrawn 2026-09-15

**Withdrawn 2026-09-15 (#36).** `implEquals` was removed (§5), so the `structural-equals` rule was removed, along with the TypeScript resolver (`typecheck/`) that only it used. What follows is the record.

When §5 made every key in the spec optional, it assigned the detection of a forgotten entry here. This is the design of that rule. We implemented it the same day, and confirmed it gives identical reports on all three paths, TS 7.0.2 / 6.0.3 / 5.9.3 (§14.5). The rejection in §14.5 as "too strict to use" predates the `implEquals` spec. **Now the fix is one line in the parent, so it no longer applies.**

**Rule.** For each Val position in a parent's payload whose child transitively has a custom equals, the parent's spec must have **some** entry.

The point is that **any** entry is enough. `total: Money`, `updatedAt: () => true` (excluded from equality) and `span: [undefined, Money]` all show the author looked at that position. The syntactic position alone tells them apart.

| spec form                              | reading                         |
| -------------------------------------- | ------------------------------- |
| `Identifier`                           | delegate to the companion       |
| `ObjectExpression` / `ArrayExpression` | descend                         |
| function                               | author's call, stay silent      |
| `implEquals` given a bare function     | hand-written whole, stay silent |

**Syntax alone is enough.** Confirmed on the parser output:

- `typeArguments.params[0]` of `Val.sealer<Order>()` is a plain `TSTypeReference`, which connects the companion to the type alias
- The payload type can be descended in the same shape as the spec. `TSPropertySignature` / `TSArrayType` / `TSTupleType` / nested `TSTypeLiteral` map one to one onto `{k: spec}` / `[spec]` / positional / a plain object

The two sides are matched by **alias name**, not by the companion's variable name. This is simpler than the unused-member rule.

#### Decisions

**Report on the parent**, at the `Val.sealer<Order>()` line. §14.5 proposed "report once at the override's definition and list where it is nested", but we do not adopt it. The fix goes in the parent, not in `Money`, so a report on `Money`'s line does not tell the user which file to open. It also matches the two existing rules.

**Prevent cascades with the transitive closure.** With `Order → OrderLine → Money` where only `Money` has a custom equals, a naive implementation fires only on `OrderLine`, and **fixing it makes the next run fire anew on `Order`**. "Fixing it made more" is the worst experience. Compute the transitive closure. A type needs dispatch if it or any descendant has a custom equals, so both are reported from the start.

**Name collisions are duplicate-brand's job.** If two files both have `type Money`, name resolution cannot tell them apart, and the rule would misfire. The alias → brand mapping already exists, so **report only when the name resolves to a single brand within the scan**. Another rule reports the collision itself, and fixing that is enough.

**The `PayloadOf` path is deliberately out of scope.** This is correct behavior, not a miss.

```ts
type OrderB = Val<"OrderB", { total: PayloadOf<Money> }>;
```

The other rule in §9 says "do not put `PayloadOf` in a field position, write `total: Money`". If the equals rule fired here, it would say "keep the payload and add `Money.equals` to the spec", and **two rules would give contradictory instructions on the same line**. It would also push the fix in the direction that hides the real defect. As §4.3 says, the brand is dropped here, and with it the child's seal and the tracked sharing, so restoring equals alone does not fix it. Changing to `total: Money` makes the rule fire, naturally and correctly. The rule stays silent on a top-level `PayloadOf<User> & { … }` too. A `SuperUser` contains no `User` value, it only reuses the field types, so there is nothing to dispatch to.

**Implementation pitfall.** A naive version stays silent on its own here, so nobody notices, but it breaks the moment `ReadonlyArray<Money>` is treated like `readonly Money[]`. The former requires descending into a `TSTypeReference`'s type arguments, and generalizing that also picks up the `Money` inside `PayloadOf<Money>`. Make the walk **a whitelist of "shapes a spec can map"**: `TSTypeLiteral` / `TSArrayType` / `TSTupleType` / `ReadonlyArray` / `Array`. Any other type reference is opaque, and the rule stays silent. `PayloadOf`, `SeedOf` and `Omit` are all excluded there.

#### Out of reach

All of these are misses, not false positives.

- Generic, conditional and mapped payloads
- Companions outside the scan
- Positions where `typescript` is not found, or resolution fails

**Go-to-definition closes only the reference side.** During the 2026-09-07 implementation this memo once said "going through a helper is covered too". That was wrong. Corrected here.

What it covers is **the paths that reach the child**: renamed imports, re-exports, `interface`, one alias hop, intersections, `Money | null`. Each follows the reference to its declaration, so there is no need to trace it syntactically.

What it does not cover is **the side that recognizes an alias as a Val**. `type Money = Branded<"Money", X>` through `type Branded<K, T> = Val<K, T>` does not enter the candidate set, because collection checks by name that `Val<…>` is written directly. So it is not recognized as a child. **This is the same hole duplicate-brand has, and the whole linter rests on this assumption.** Closing it means identifying `Val` itself with go-to-definition too. It is a miss, not a false positive, so there is no hurry. 2026-11-05: a helper that takes the brand as a type parameter is now a type error, so this path no longer exists (§15.1 "Holes in trait declarations").

#### Why N×M is nothing to fear

Under §5's "build in canonical form" principle, `implEquals` is a discouraged escape hatch. The rule fires only on types that have already taken that escape hatch, so N is small. And N×M firings correspond to N×M **necessary** fixes. They are real counts, not noise.

### 14.8 Rule representation and layout, 2026-09-07

When the third rule went in, per-rule branching was scattered across three places: `lint()`, `--help` and `Finding`. This records how we cleaned it up.

#### A rule is one object

Keep the `kind`, the description and the run in one place. The caller knows nothing about individual rules.

```ts
type Rule<F extends Located> = {
  kind: F["kind"];
  description: string;
  run: (scans: readonly Scan[], context: Context) => F[] | Promise<F[]>;
};
```

**`Context.types` is a function, not a value.** The first rule to ask for the language server starts it, and if no rule asks, it never starts. A skipped rule, and a rule that decides by itself it needs no server, pay nothing. `needsTypes` stays inside the equals rule.

```ts
run: (scans, { types }) => (needsTypes(scans) ? findings(scans, types()) : []),
```

The runner has no per-rule branching.

```ts
for (const rule of RULES) {
  if (skip?.has(rule.kind)) continue;
  findings.push(...(await rule.run(scans, { types })));
}
```

#### `RULES` is an array, not a `Record`

It was once a `Record<Kind, Rule<Finding>>`, so the type would enforce exhaustiveness. But **the key and `rule.kind` repeat the same string.**

Make it an array, and read `Kind` and `Finding` back from it.

```ts
export const RULES = [UnusedMember, DuplicateBrand, BrandMismatch, StructuralEquals] as const;

type ReportedBy<R> = R extends Rule<infer F> ? F : never;
export type Finding = ReportedBy<(typeof RULES)[number]>;
export type Kind = Finding["kind"];
```

The hand-written `Finding` union was removed too. Previously the same fact was written in three places (the keys of `RULES`, `rule.kind`, and the `Finding` union).

**Exhaustiveness does not weaken. It gets stronger.** A rule left out of the array does not appear in `Kind`, as if it did not exist. Confirmed by removing `DuplicateBrand` from the array (`Kind` itself was dropped on 2026-11-04, §14.8):

```
x typescript(TS6133): 'DuplicateBrand' is declared but its value is never read.
x typescript(TS2367): '"structural-equals"' and '"duplicate-brand"' have no overlap
x typescript(TS2339): Property 'alias' does not exist on type 'never'
```

The CLI's output branch falls through to `never` and fails. This catches more than the `Record`'s "fails when a key is missing".

Reading it from `run`'s return type as `Awaited<O>[number]` raises TS2536, so that form cannot be used. `R extends Rule<infer F>` compiles.

#### A rule shares its name with its finding type

```ts
export type UnusedMember = { kind: "unused-member"; ... };
export const UnusedMember: Rule<UnusedMember> = { ... };
```

Types and values live in separate namespaces, so they coexist. **It is the same idiom as a companion taking the same name as its Val**, so it is consistent within this library. One `import { UnusedMember }` carries both the type and the value, so the imports in `rules/index.ts` lost their `type` modifiers and `as` aliases (confirmed under `verbatimModuleSyntax` + `isolatedModules`).

The implementation function is `findings` in every file. The `rule` object has taken the name, so the private implementation has no reason for a name of its own.

#### Turning a rule off from the CLI

`--no-<kind>`. The name matches the disable comment, so there is nothing new to remember.

**Skipping stops the work, not just the report.** `--no-structural-equals` does not start the language server: 212 ms → 109 ms on 65 files.

#### Layout

```
src/lint/
  cli.ts  index.ts  ast.ts
  scan/       extracts syntactic facts
  typecheck/  go-to-definition (lsp / in-process)
  rules/      decides
```

Dependencies flow one way. `scan/` is self-contained, and `rules/` sees only the entry points `scan/index.ts` and `typecheck/index.ts`. `Alias` and `CompanionSite` are parts of `Scan`, so `scan/index.ts` re-exports them. Rules do not reach into the scanner's internals.

`ast.ts` does not go inside `scan/`. `rules/equals.ts` also uses it to walk payloads and specs, so it sits in a lower layer, as a shared tool.

`Scan` has no rule-specific fields. **It holds syntactic facts, and its type does not say which rule reads them.** `aliases` and `brands` come from the same single pass over the same declarations, and two rules take one each. Writing down that ownership would tell the next person who adds a rule to "add a field for yourself".

Keep the exported names few. `src/lint/index.ts` is not in the package's `exports` and serves only the CLI, so it exports nothing but `lint`. Each rule exports exactly two things: its finding type and its `rule` object.

#### 2026-11-03: Rules became a Trait

valof-lint was rewritten in valof. The shape follows css-var-kit's `Rule` trait and `Vec<Box<dyn Rule>>`.

- **`Rule` is a Trait.** Its fields are `kind`, `description` and `warns`, and its member is `run`. Each rule is
  `Val<"UnusedMember", { kind: "unused-member" }, Rule>`, and the companion's `implCreate` builds the rule's value.
  The fields other than `kind` come from the Trait's shape
- **`RULES` is an array of `Rule.dyn` boxes.** `Dyn` erases the concrete Val, so `kind` is `string`.
- **The union of rule names (`Kind`) was dropped, 2026-11-04.** It was kept once, through a lint-side `box`
  (`Dyn<Rule> & Pick<W, "kind">`). The CLI's `--no-<kind>`, disable comments and the plugin's settings all take the
  name as a string and check it against `kinds` at run time. All the union caught in the types was a misspelling in
  the `skip` of `lint()`, which is unsupported. css-var-kit has the same shape. Each rule's own tests catch a rule
  left off the list
- **`Finding` is one shared Val, with `kind` as `string`.** Nobody read the rule-specific fields (`brand`, `alias` and
  so on). Typing `kind` as `Kind` is circular: `Kind` comes from `RULES`, and `RULES` from `run`'s return type. The
  `ReportedBy` above is gone
- **`run` is synchronous.** At the time of the rewrite, a Trait member returning a `Promise` broke the declaration
  (§15.1). It can be written now, but no rule is asynchronous, so it stays synchronous (2026-11-07)
- **Errors are byethrow Results and error-factory classes.** `Arguments.fromArgv` parses the arguments, and `run`
  loads the parser, both returning a Result. The public `lint()` throws at the boundary. A Result in the public types
  would pull the bundled byethrow declarations into `lint.d.mts`. Since lint no longer emits declarations, that
  reason is gone (2026-11-07, below)
- **The scan's facts are Vals too.** `Scan` and `Context` are Vals, and hold Maps and Sets as §8.1's Records
  (2026-11-07). The keys are source names, so one can be `constructor`. Lookups therefore use `Object.hasOwn`, hidden
  in a `has` member on the Val that holds the Record. 2,190 files: 305 ms → 319 ms. `Directive.kinds` went from a Set
  to an array
- **The state during the walk is a Val too (2026-11-07).** The walk `patch`es `Bindings`. `patch` shares structure,
  so the whole is not copied. A position is a `Position` (a Val of `{ line, column }`), held in each fact's `at`.
  `Where` was once a `Payload` intersected into the other facts, but a Val field was enough
- **The run's and the plugin's values are Valof types too (2026-11-07).** `lint()` takes `Options`. The plugin sends
  the worker a `Query` and receives a `Reply` (byethrow's `Result<Finding[], string>`, below). What a disable comment
  silences is `Silenced` (an Enum of `Every` / `Named`). `Parser.load` loads oxc-parser into a module variable, and
  members of the `Parser` Val use it
- **The files a run reads are a Val too (2026-11-10).** A relative import resolves among the files the run reads.
  `moduleResolver`, which returned a closure over that list, became the `Modules` Val. `Modules.create` normalizes
  the paths once, and `Modules.resolve` looks up the target. `Scan.walk` takes `Modules` rather than a function
- **Functions that build or read a Val go on the companion (2026-11-10).** `Scan.walk`, `Parser.load`, `Files.glob`,
  `FilePath.read`, `Aliases.fromProgram`, `Lift.fromCall`, `CompanionSite.fromChain`, `SymbolRef.fromExport`,
  `Bindings.refOf`, `Underline.fromFinding`. Closures that held state became Vals too. Line positions are `Lines`,
  re-export resolution is `Exports`, and each file's disable comments are `DirectiveMap`
  - **Side effects included.** The name shows them. `walk`, `load`, `glob` and `read` are action names, and `from*` is
    only for pure conversions
  - **I/O is separate from conversion (2026-11-11).** `Files.glob` only expands globs, and the pure `Files.fromPaths`
    applies the exclusions and picks the targets. `Parser.load` imports oxc-parser and passes it to
    `Parser.fromModule`. The member that runs the parser went from `Parser.parse` to `Parser.exec`, an action name
  - **Rejected: keeping functions with side effects as free functions.** Part of the type's API would leave the
    companion, and completing `Scan.` would no longer show how to build one. What matters for placement is the
    runtime, not side effects. The whole companion goes into the bundle, so a member that uses `node:fs` does not
    belong on a Val also used in browsers. lint is Node-only, so that constraint does not apply
  - **No optional parameters.** Members reject optional parameters, so `Bindings.refOf`'s `qualifier` is
    `string | undefined`, and the caller passes `undefined` when there is none
  - **Silencing is decided per disable comment.** `Directive.silences` answers for one comment, and
    `DirectiveMap.silences` checks whether any comment in the file silences. `Silenced.widen`, which combined a
    `Silenced` per line, is no longer needed. Rejected: keeping the combined `Silences` in a `Scan` field. That holds
    what `directives` already derives in a second field, and was harder to read
- **The files to report on are called targets (2026-11-10).** `Options.targets` and `FilePath.isTarget`, the same
  word as the CLI's `Arguments.targets`. Until then the files to report on were `report`, and the check `reports`
- **No `readonly` on a Val's arrays (2026-11-10).** A payload's arrays are readonly even inside a `Record`
- **The remaining types became Vals too (2026-11-10).** Running valof-lint on itself found the types written as
  something other than a Val.
  - String Vals: a file path is `FilePath`, a rule name is `Kind`. Both travel from the run's entry to `Finding`.
    `Kind` is a plain string Val, not a union of names (why the union was dropped is above)
  - Sets: rule names are `KindSet`. The names a disable comment lists may include spellings no rule has, so they are
    a separate `NameSet`. `KindSet.find` turns a spelled name into a `Kind`
  - Others: the plugin's underline is `Underline` and `Point`, `dyn`'s box is `DynBox`, and a disable comment before
    its line is known is `DirectiveComment`
- **The plugin's state lives inside the plugin (2026-11-11).** Three things: the connection to the worker, the last
  answer, and the globbed project. `valof()` in `export default valof()` creates them, neither in the module nor on a
  companion (the worker side is a separate file, §14.9). Classes hold them, per "State lives in classes" below. None
  can go. Without the last answer, one file is linted once per rule, and without the glob result, the project is
  globbed again for every file
  - **Not in `Program`.** ESLint calls `create` and `Program` per rule and file pair, so state made there is shared
    neither across rules nor across files. The narrowest scope that shares it is the plugin
  - **Rejected: in a companion's `impl` / `implAssoc` block.** A Val is immutable data, and state inside the block is
    invisible to anyone reading the members (#112's `hidden-state-in-impl` reports it). `Query` became a Val of the question's
    data only
  - **Rejected: a module-level variable, or a module-level higher-order function that encloses the state (such as
    `memo`).** The whole file can reach both. Wrapping it in a higher-order function does not stop the module from
    holding state
  - **"No classes" is retracted (below).** At first a closure with a narrow scope seemed enough
- **`Ask` was renamed to `Query` (2026-11-11).** `Ask` also reads as a verb (user). The function that asks the worker
  is a verb, so it stays `ask`
- **`pipe` moved to `src/shared/pipe` (2026-11-11).** valof-lint now uses `pipe`, and shipped code must not import
  `scripts/`. `pipe` separates the steps where a value changes shape (`Exports.from`'s `flatMap` →
  `Object.fromEntries` → `seal`). Members and functions given type arguments can be steps too (`Path.seal`,
  `Path.expand`). The end of `run` passes a method chain to `R.succeed<Finding[]>`. Without the type argument, the
  overloads make the result `unknown`
  - **Rejected: splitting each method of a chain into a `pipe` step.** Splitting what a chain already expresses only
    adds steps (user)
- **Names read with the receiver as the subject (2026-11-11).** Fixed the names where `Type.member(receiver, …)` does
  not read as "the receiver does …". `Options.sourceOf` → `FilePath.read`, `Options.isTarget` → `FilePath.isTarget`
  (the file is the subject of the check), `Files.read` → `Files.glob` (it does not read its argument),
  `Bindings.isNamespace` → `hasNamespace`, `original` → `originalName`, `builder` → `builderOf`, `Scan.exec` →
  `Scan.walk`
  - **Rejected: `Files.fromGlob`.** It reads the file system, which breaks the rule that `from*` is only for pure
    conversions. Like Rust's `File::open`, a constructor with side effects takes an action name
- **Paths and projects are Vals too (2026-11-11).** A path or glob the user wrote is a `Path` (`isDirectory`,
  `expand`, `excludes`). `expand` returns the `FilePath[]` the run reads, not `Path[]`. An expanded glob is not a
  glob. The plugin's list of settings is `Patterns` (`fromSettings`, `key`, `glob`), and its expansion is a `Project`
  (`FilePath[]`). `Query.fromContext` builds the question the plugin sends the worker, and `Query.key` decides
  whether two questions are the same
- **State lives in classes (2026-11-11).** A visible `new` shows where state is (user). Data is a Val, state is a
  class: no `extends`, state in `#private` fields, plain methods. A method passed as a function is wrapped, as in
  `(q) => this.#worker.ask(q)`. The plugin holds `new LinterWorker(import.meta.url)` (the worker and the last answer) and
  `new ProjectCache()` (the glob results)
  - **Rejected: functions that return stateful functions (`createCachedGlobber` and so on).** They imitate `new`
    through a naming convention, and the call site does not show the state
  - **Rejected: an `AnswerCache` that exposes the last answer to the plugin.** Not sending the same question twice is
    the asking side's concern. The plugin calls only `worker.lint(query)`, and `#lastKey` and `#lastFindings` hold
    the answer
  - **Rejected: arrow-function fields.** They fix `this`, but plain methods are enough with some care (user)
- **`LinterWorker` is not generic (2026-11-11).** There is one worker, it is sent only a `Query`, and it returns only
  a `Reply`. The type arguments `Question` / `Answer` were easy to confuse with `Query` and the last answer. The
  tests' worker also takes a `Query` and returns a `Reply`. Whether a wedged worker stopped is checked by whether a
  file it keeps writing stops changing. It writes and then renames, so a reader never sees a half-written file
- **`LinterWorker` and `serve` are separate files (2026-11-11).** The worker's location is relative to
  `import.meta.url`. With both in one file, the plugin and the worker both import it, and the build splits it into a
  shared chunk (`dist/channel-*.mjs`). `import.meta.url` then points into `dist/`, and it looks for
  `dist/worker.mjs`. When only the plugin's entry imports `linter-worker.ts`, it lands in
  `dist/eslint-plugin/index.mjs`. The URL and the patience can then be defaults, and the plugin writes only
  `new LinterWorker()`. Superseded the same day (below)
  - **Rejected: embedding the relative path at build time (`define`).** Running from source needs a separate branch,
    and nothing exercises the shipped side until #114's check
  - **Rejected: one class with `serve` as a static method.** The two ends run on different threads. One class for
    both is harder to follow (user). Retracted (below)
- **`serve` is a static method of `LinterWorker` (2026-11-11).** A free function `serve` hides that it is the other
  end of `LinterWorker` (user). `Query` and `Reply` sit beside them in `linter-worker.ts`. The worker's entry now
  imports the class too, so the build puts it in a shared chunk (`dist/linter-worker-*.mjs`), where its own
  `import.meta.url` points into `dist/`. So the caller passes its own `import.meta.url`, and the constructor resolves
  `worker` beside it, with the caller's extension. The plugin writes `new LinterWorker(import.meta.url)`, and the
  entry is always in `dist/eslint-plugin/`, so the chunk `LinterWorker` lands in no longer matters
  - **The tests pass their own URL,** with a fixture `worker.ts` beside them. A constructor that resolved from its
    own URL would start the real worker, and the tests would fail. One test passes a `.mjs` URL, since every other test
    passes a `.ts` one
  - **Rejected: the plugin builds the worker's URL and passes it.** Every caller would repeat the rule for the
    extension, and the constructor can apply it to one argument
- **`Reply` is a byethrow Result (2026-11-11).** The `Found` / `Failed` Enum reinvented Result. A failure is sent as a
  message string, because error classes are lost in the copy between threads. `R.unwrap` throws the failure value
  as is, so `R.mapError((message) => new Error(message))` wraps it first. vitest's `toThrow("…")` passes even when a
  string is thrown, so the tests check for an `Error`
  - **`model-only-in-valof` is silenced on `type Reply` (2026-11-11).** The alias stays. Both thread ends import the
    one name, and the receiving end reads the message with `as Reply`, which no type check covers. Written out in
    each place, the sending end could change alone, and nothing would fail
  - **Rejected: writing `R.Result<Finding[], string>` in place.** Five copies, and the two ends can drift (above)
  - **Rejected: not reporting an alias of a library type.** `Reply` declares no data shape, but the change widens
    what the rule lets through, which is a decision about the rule rather than about `Reply`
- **A worker that does not start returns why (2026-11-11).** A script that failed to load made the plugin wait out its
  full patience and say "no answer in 60s". The waiting thread is blocked, so it cannot listen for the worker's
  `error`. A small start-up module imports the script, and if that fails, answers every question with the reason
  - **Rejected: an `eval: true` worker.** The host's `--import` (a loader) does not apply to it. It does apply to a
    data: URL module. The test that removes oxc-parser fails on this difference
- **The patience stays at 60 seconds (2026-11-11).** One run over `src` (48 files) takes about 0.12 s, and the plugin
  rereads the whole project for every file. Too short, and a normal lint of a large project times out every time,
  so the plugin stops working. Too long hurts only when the worker really is wedged, and only once
  - **Rejected: making it configurable.** It adds a user-facing setting (the same reason as for the
    environment-variable idea)
- **Only the last answer is kept (2026-11-11).** The answer depends on the whole project's contents, not only on the
  question. Saving a different file in another tab changes the correct answer to the same question. ESLint calls one
  file's rules back to back, synchronously, with nothing in between, so the same answer holds only for that span
  - **Rejected: keeping every answer.** ESLint reports neither file writes nor buffer changes. `fs.watch` does not
    know unsaved buffers, and inferring from the lint calls misses changes to files that are not open
  - **Unresolved: unsaved buffers in other tabs.** Only the file being linted goes in as the overlay, so a file being
    edited in another tab is read from disk. Remembering every buffer that arrives and passing them all would fix
    it. To be addressed if it causes trouble
- **Not a Val (2026-11-07).** The `{ port, signal }` the worker receives at start-up. A `MessagePort` and an
  `Int32Array` cannot go in a payload
- **A timed-out worker is stopped and recreated (2026-11-10).** Until then, requests after a timeout went to the same
  worker, so later ones queued behind the wedged worker, and each file waited 60 seconds to time out. The port and
  the signal are passed once at start-up, and a request sends only the `Query`. The `{ ask, port, signal }` type sent
  per request is gone. The waiting and answering ends were split into `LinterWorker` (`linter-worker.ts`) and
  `serve` (`serve.ts`), and a fixture worker tests them. `serve` became `LinterWorker.serve` on 2026-11-11 (above).
  Rejected: making the patience configurable through an environment variable for the test. It adds a user-facing
  setting, and a reliable way to wedge the worker is needed anyway
- **valof-lint is run on itself.** `tests/lint/self/` checks that it reports nothing in `src/` and `scripts/`. The
  first run had `unused-member` report every rule's `run`, because a `dyn` that passed through `box` was not
  tracked. A `dyn` that leaves the expression that built it (passed to a function, put in an array) counts every key
  read anywhere as a read of its first argument's Val (or, if none is named, of every Val implementing the trait)
- **Time.** On 1,810 files (the fixtures copied 10 times), 95 ms → 101 ms (the development freeze)
- **`lint.d.mts` inlines valof's declarations (17 kB → 73 kB).** tsdown pulls in `../../index.ts`. The inlined
  `unique symbol` differs from the one in `valof` itself, so passing lint's `Finding` to a `valof` function is a type
  mismatch. The harm is small, so it stayed. No longer emitted (2026-11-07, below)
- byethrow and error-factory stay in devDependencies and go into dist through `deps.onlyBundle`. Bundling valof adds
  no dependency either
- **Declarations only for the plugin (2026-11-07).** valof-lint provides only the CLI and the plugin, not a library.
  `dts.entry` narrows to `eslint-plugin.ts`, and `lint.d.mts` and `lint-cli.d.mts` are not emitted. The plugin's
  declaration stays, since `eslint.config.ts` reads it
- **The plugin's export is a minimal hand-written type (2026-11-07).** The inferred type had `meta.type` as `string`
  and `create`'s parameter narrower than ESLint's type, so `plugins: { valof }` in `eslint.config.ts` was a type
  error (v0.12.0 has it too). The implementation is written against ESLint's types (`Rule.RuleContext`), and the
  export declares only what a config file reads. Inferred, ESLint's types go into the declaration at 93.7 kB.
  Hand-written, 525 B. `vp run type-perf`'s budget is 2 kB. If ESLint's types get into the declaration, the build
  (`deps.onlyBundle`) stops before the budget does

#### 2026-11-07: The syntax tree became an Enum

- **`Node` is an Enum.** Each node type the walk reads has a variant holding only the fields it reads. The other
  types are `Other` (only `nodeType`). Typed reads replaced `child` / `children` and the casts on `node[key]`. It
  also serves as an example of Enum in use
- **`Parser.exec` converts oxc-parser's tree once.** Fields nobody reads are dropped. A `Literal`'s `value` keeps
  only strings, and anything else becomes `null`. A value a payload cannot hold, such as a `RegExp` or a `bigint`,
  does not survive
- **Sealing a recursive Enum took 2^depth.** The development seal snapshots its input before and after, and went
  into children already sealed. That is a valof bug, fixed in #144. The snapshot stops at a value already sealed
- **The lint build sets `NODE_ENV` to production.** lint holds no user code for the development checks to guard.
  The command runs without `NODE_ENV`. Converted nodes are built with `create.nocopy`
- **Cost.** On 230 files, the shipped command went from 0.14 s to 0.21 s. Left in development, the replacement cost
  about 300 ms
- **Return values that hold nodes are Vals too (2026-11-10).** With `Node` an Enum, a payload can hold a node. A
  type's name and its namespace are `TypeName`, the enum and variant a `VariantOf<E, "N">` points to are
  `VariantName`, and a variant read from a builder, with its builder, is `NamedVariant`

### 14.9 Editor integration, investigated 2026-09-08. Implemented up to overlay

**Conclusion first.** From oxlint's `jsPlugins`, **call `lint()` directly** across a Worker. valof exports only `lint` and `Options.overlay`, with no `--server` and no protocol. **Not on this branch.**

At one point the design was "wrap the CLI, keep it resident with `--server`, and exchange newline-delimited JSON". That history is kept below. **The reasons for rejecting it are in the "Rejected" section below.**

**2026-09-15 (#36): there is no resolver.** `structural-equals` was withdrawn (§14.7), so the scan alone decides every rule. `lint` and `Options.overlay` remain. What follows about the resolver, `tsc --lsp` and `needsTypes` is the record.

#### A plugin that wraps the CLI is possible

§14.1's "a lint rule cannot do it" was about **writing** a cross-file check **as a rule**. Calling the CLI and distributing its results runs outside the lint model, so that objection does not apply.

On the first file, run the CLI once over the whole project, store the results in module scope, and hand them out to each file. About 30 lines. Measured with both ESLint and oxlint.

```
src/order.ts
  6:1  error  structural-equals: Order.total holds Money, which has its own equals  valof/findings
```

- **The CLI starts only once.** ESLint runs on the main thread by default (`--concurrency` defaults to `off`). oxlint also starts it once, even with 43 files and `--threads 8`, because JS plugins run in a single process on the Node side
- **`eslint-disable-next-line` works**

§14.1's "state cannot be trusted under parallelism" does not apply to this approach either. That was about accumulating state and reporting **later**. Here, results collected outside are just attached to the current file.

#### ESLint cannot run on TS 7. oxlint can

```
typescript-eslint does not support TS 7.0.
https://github.com/typescript-eslint/typescript-eslint/issues/10940
```

`@typescript-eslint/parser` does not support TS 7, so the ESLint demonstration above was run on TS 6.0.3. valof-lint itself runs on TS 7, but the parser that reads TS on the ESLint side has not caught up.

**oxlint's `jsPlugins` worked as is in a TS 7 environment.** The config schema says it "allows usage of ESLint plugins with Oxlint", and a plugin written for ESLint runs with almost no changes. This approach uses no type information, so the restriction that a JS plugin cannot reach `parserServices` (§14.1) does not apply.

#### A one-shot wrapper breaks under LSP

We linted twice in one process, fixing the file in between so that the finding should disappear.

```
1st run                : 6: structural-equals: Order.total holds Money, ...
2nd run, after saving fix : 6: structural-equals: Order.total holds Money, ...   ← does not disappear
spawns                 : 1
```

There are two defects, and they are different.

1. **The cache goes stale.** The module-scope results live as long as the resident LSP server
2. **Unsaved buffers are invisible.** valof-lint reads the disk. Even if the cache is dropped every time, the result does not change until the file is saved

A TTL or an mtime check only eases 1 and does nothing for 2. Re-running every time removes 1, but costs 206 ms on every keystroke.

**The Worker approach removes both** (below). For 1, it can run every time while keeping the resolver (23 ms), so no cache is needed at all. For 2, the overlay solves it. The breakage described here was specific to the "spawn the CLI and store its results" shape.

#### Where the time goes: cache the process, not the scan

```
one CLI run (67 files)          206 ms
  Node startup                  ~93 ms
  import oxc-parser               5 ms
  scan 67 files                  11 ms
  LSP spawn                        3 ms
  structural-equals (init+query)  105 ms

resident
  1st run (LSP cold)             96 ms
  2nd run (LSP warm)             29 ms
  3rd run (after rescanning 1 file) 23 ms   rescan 0 ms of it
```

**96% of the gain comes from keeping the process and the LSP session alive.** Caching the scan buys 11 ms, and an incremental scan buys 0 ms. The conclusion: **on any change, re-read everything. It is the simplest, and fast enough.** No `fs.watch`, and no invalidation granularity.

(The 11 ms is from a first run, warm-up included. The steady state is 1.70 ms; see "No scan cache" below. The conclusion stands, and gets stronger.)

#### `didOpen` for one file costs 0 ms

§14.5 dropped `didOpen` not because sending it is bad, but because sending **every** file is bad.

```
didOpen 65 files → first query 436 ms
didOpen  1 file  → send 0 ms, query 2 ms
```

We also confirmed the server actually uses what is sent. We wrote a type only into the buffer, not on disk, and a reference resolved to it.

```
on disk as is, `total: Money`                  -> plain/money.ts:2
after overlay, `total: Cash` (not on disk)     -> plain/order.ts:3
after overlay, look up `Money` at old position -> EMPTY (lines shifted)
```

So the design is "disk by default, `didOpen` only for files that have a buffer". The same content has to reach both the scan and the LSP, so the overlay lives in one place.

#### Rejected: `--server` and newline-delimited JSON

This shape was designed first. The aim was display in the editor, not CI (CI can call the CLI directly, with no reason to embed it in lint).

```
$ valof-lint --server 'src/**/*.ts'
< {"overlay":{"/abs/src/order.ts":"…being edited…"}}
> {"findings":[{"file":"src/order.ts","line":6,"column":22,"kind":"…","message":"…"}]}
```

**Not taken.** The Worker approach below asks valof for no protocol and no dispatch. This idea's premise, "no editor extension to build", holds for the Worker approach too, and so does the reason for rejecting valof-lint speaking LSP itself. There is no capability negotiation, no URIs, no position encodings, no `publishDiagnostics` and no initialization sequence, and the only client is the one plugin we write ourselves.

**`--server` does not make tests faster either.** The tests were slow because of process startup, and `--server` was a mechanism for crossing that boundary. Tests can remove the boundary itself (by calling `lint()` in the same process), so it has no role there. Doing exactly that took the tests from 4.40 s to 748 ms. The `Options.types` added then also becomes the way to keep the resolver in the Worker approach below.

#### oxlint owns the display

There is **no need** to write elaborate output ourselves (a source excerpt + caret). oxlint's default format is miette-like, and **it applies to plugin diagnostics the same way**.

```
  x valof(findings): structural-equals: Order.lines[] holds OrderLine, which has its own equals
   ,-[src/order.ts:6:15]
 5 |
 6 | export const Order = Val.sealer<Order>();
   :               ^^^^^
   `----
```

The caret lands on `Val` because the finding carries a `column`. The squiggle in the editor appears at the same place. The whole `--format` set (json / sarif / github / gitlab / junit / checkstyle / stylish / unix) comes with it, as does the handling of terminal width and color.

Writing our own wins only when running valof-lint by itself in a terminal, and the one-line format is enough there. In CI the one-line format is actually easier to read.

**This does not generalize to ESLint.** Its built-in formatters are just stylish / html / json / json-with-metadata, and none shows a source excerpt (`codeframe` left the core in ESLint 7 and became `eslint-formatter-codeframe`).

```
ESLint default (stylish)
  src/line.ts
    6:26  error  structural-equals: OrderLine.total holds Money, ...  valof/findings
```

`column` works in both, and the editor squiggle lands in the right place in both. Only the terminal display differs. Anyway, typescript-eslint does not support TS 7, so ESLint cannot run on it, and oxlint is the practical path for users.

**A note on verification.** The default format is graphical only when stdout is a TTY. Piped, it falls back to something like `unix`, so measuring with a `| grep` in the pipe makes it look like the one-line format. We drew a wrong conclusion from that once. `vp check` also runs oxlint with `unix`, which adds to the confusion. Check in a pty with `-f default` stated explicitly.

#### Writing the protocol: export type definitions, no RPC framework

We looked into "typed RPC" on 2026-09-08.

```
birpc           v4.2.0   deps 0    25 kB   transport-agnostic, used by vitest
json-rpc-2.0    v1.8.0   deps 0    58 kB
rpc-anywhere    v1.7.0   deps 1   124 kB
vscode-jsonrpc  v9.0.2   deps 0   220 kB   underlies LSP
@trpc/server   v11.18.0  deps 0  2043 kB   assumes HTTP, needs a custom transport
```

**`birpc` is clearly the best.** It takes just `post` / `on` / `serialize` / `deserialize`, so it works over any transport, stdio included. We ran it round trip with a child process, and confirmed the types catch misuse.

```ts
export interface Lint {
  lint(overlay: Record<string, string>): Promise<Finding[]>;
}
```

```
rpc.lint(123)          -> TS2345 argument type
rpc.linnt({})          -> TS2551 Did you mean 'lint'?
const n: number = f[0].kind  -> TS2322 return value property
```

**We still do not add it.** Three reasons:

1. **There is only one method.** A framework's value is that the types guarantee the mapping between method names and signatures. With one method to map, that barely does anything
2. **The dependency ships.** Both the server (valof-lint) and the client (the plugin) need it, so it goes into `dependencies`. 25 kB against a 32 KB tarball is not a negligible ratio, and it conflicts with §14.3's "zero runtime dependencies"
3. **The types work without a dependency.** Export the type definitions, and the client only needs `import type`. Of the three errors `birpc` caught, plain types catch the argument and return ones. Only a misspelt method name slips through, and with one method that does not matter

```ts
// Export only the types, as `valof/lint-protocol`. Dispatch is about 20 lines.
export type Request = { id: number; overlay?: Record<string, string> };
export type Response = { id: number; findings: Finding[] } | { id: number; error: string };
```

**Switch when there are more than three methods**, that is, once `shutdown`, config changes or partial re-lint turn out to be actually needed. As long as the protocol is JSON, migration is easy. `birpc` uses its own envelope, so the wire format changes, but the only client is the one plugin we write ourselves, so both can be swapped at once.

#### Adopted: call `lint()` directly across a Worker

**The obstacle was not process lifetime, but sync versus async.**

```ts
create: (context: Context) => VisitorObject     // the rule API is sync
BeforeHook = () => boolean | void               // so are the hooks
export async function lint(...)                 // lint is async
```

`lint()` must stay async, because the TS 7 backend is an LSP in a child process (the TS 5 / 6 in-process side is synchronous, but on 7 there is in principle no way except to wait).

**Node's main thread can block with `Atomics.wait`.** Browsers forbid it, but Node allows it. Run `lint()` in a Worker, and have the rule wait synchronously. This is the standard technique among ESLint plugins, and `synckit` (95 kB, deps 1) and `make-synchronized` (68 kB, deps 0) provide it. A minimal implementation confirmed the round trip: 5 synchronous calls in 106 ms, 21 ms each, all of it the work itself.

**Process lifetime actually helps.** The plugin's module scope lives as long as the ESLint / oxlint process, so the Worker can re-check in 23 ms while keeping the resolver. That is faster than spawning the CLI every time (206 ms), and the "results go stale when resident" defect disappears too, because it can run every time. oxlint officially supports JS plugins in its LSP too (alpha).

Compared with `--server`, valof needs less.

|         | `--server`                        | Worker                                   |
| ------- | --------------------------------- | ---------------------------------------- |
| valof   | server mode, protocol, dispatch   | **just exporting `lint`**                |
| types   | protocol types defined separately | work naturally, it is the same TS module |
| overlay | serialized to JSON                | passed as is via structured clone        |
| deps    | none                              | 68 kB on the plugin side; none in valof  |

The cost is that `lint` becomes public API. Today `src/lint/index.ts` serves only the CLI and is not in `exports`. "A larger API surface" joins the §14.3 argument about shipping inside valof.

#### The overlay is just the current buffer

**A plugin can only hold the content of the file being linted.** Measured:

```
files visible in lintFiles: [ 'order.ts' ]
content of other open files: not visible
```

One could approximate by accumulating buffers, but **unsaved edits in other buffers should not be reflected in the first place.**

- It fits the lint model. That is why the plugin API passes only the current file's content
- The cause of a diagnostic stays on screen. A diagnostic that changes because of an unsaved edit in another tab is impossible to trace
- The reaction users want most appears immediately. structural-equals reports on the parent, so it disappears the moment `.implEquals({ total: Money })` is written in the parent. That unsaved edits in the child do not take effect hardly matters in practice

So each file's diagnostics are computed from "that file's buffer + every other file on disk". The overlay is a single file, so there is no accumulation and no `didClose`: **pass it on every call and use it for that call only**. Nothing is kept, so lifecycle management disappears entirely.

```ts
lint(files, { types: shared, overlay: { [context.filename]: context.sourceCode.text } });
```

#### Ignoring other buffers is right for this entry point

We checked whether ignoring unsaved edits in other buffers is unusual. **It depends on whether the tool does cross-file analysis, and even within one tool it depends on the layer.**

**TypeScript's LSP reflects them.** Measured: without even opening `order.ts`, shifting the `money.ts` buffer by two lines moves what `order.ts` resolves to.

```
look up Money from order.ts (both on disk)  -> money.ts:2
after shifting money.ts buffer by 2 lines   -> money.ts:4
```

Type resolution is cross-file, so without reflecting them, type errors would be wrong. Reflecting them is a requirement.

**ESLint's LSP does not reflect them.** Also measured (see "A one-shot wrapper breaks under LSP" above). Rules are file-local, so the API has no way to pass other files.

**rust-analyzer splits by layer.** Native analysis (completion, go-to-definition, type display) reflects unsaved buffers, while the diagnostics from `cargo check` read the disk under `checkOnSave` (default `true`). **valof-lint sits in exactly that position: a tool that does cross-file analysis, but whose heavy diagnostics are disk-based and triggered on save.**

|                                       | unsaved edits in other buffers    |
| ------------------------------------- | --------------------------------- |
| TypeScript LSP                        | reflected (measured)              |
| rust-analyzer native analysis         | reflected                         |
| rust-analyzer cargo check diagnostics | **not reflected** (`checkOnSave`) |
| ESLint LSP                            | **not reflected** (measured)      |

By nature valof-lint is on the TypeScript side (cross-file analysis), but its entry point is a lint plugin, so it is bound by the ESLint model. **There is no way to pass the buffers, so it cannot reflect them even if it wanted to.** The choice is between "use a lint plugin as the entry point and not reflect them" and "speak LSP ourselves and reflect them". The latter needs an extension per editor and was already rejected. Not reflecting them is a consequence of the former, not a defect, and rust-analyzer's diagnostics layer is a precedent.

#### Consistency with the CLI

**The API is the same.** Both the CLI and the plugin call `lint(files, options)`; the only difference is whether `overlay` is passed. Both get back findings for every file, and the plugin reports only the ones for its own file. An option to "return only this file's findings" is not needed. The analysis is cross-file, so the computation needs every file anyway, and only the amount returned could shrink.

**The semantics become asymmetric.** The CLI sees one world, "every file on disk", but through the plugin each file's diagnostics are computed on a different premise.

```
order.ts diagnostics = order's buffer + the rest on disk
money.ts diagnostics = money's buffer + the rest on disk   ← a different world
```

The set of diagnostics corresponds to no single world. **They agree once every file is saved**, so in practice this is not a problem. It shows up like this: a read written in `order.ts` does not clear the unused-member finding in `user.ts` until `order.ts` is saved. If the README says anything about this, it should be this.

**With N files open, the work runs N times.** Each run builds every finding in 23 ms, and the plugin uses only one file's share. If that starts to matter on a large project, we will consider a cache keyed by the overlay, but that brings back stale caches, so measure first.

#### The language server follows the disk, with a delay

For a file without `didOpen`, we rewrote it and queried again.

```
first (disk as is)           -> money.ts@42,  money.ts@116
right after rewriting disk   -> money.ts@42,  money.ts@116   ← still stale
after waiting 300 ms         -> money.ts@115, money.ts@13    ← follows, shifted by 2 lines
```

The server watches files itself, so **valof needs no watcher**. But a lint that runs right after a save can get a stale answer. The straightforward fix is not to wait, but to send that file with `didOpen` / `didChange`. For one file that costs 0 ms, so it is reliable and cheap. The overlay mechanism solves both the unsaved-buffer problem and the race right after a save.

#### No scan cache

We suspected re-reading every file on each `didChange` would be costly, but the measured cost is small.

```
readFileSync 67 files      0.59 ms
parseSync only             0.33 ms
full scan (read+parse+walk) 1.70 ms   ← walk dominates
```

The "11 ms" recorded earlier was a first run, JIT warm-up included. The steady state is a tenth of that, just 7% of one 23 ms lint.

**Invalidation always carries a correctness burden.** Covering files that change on disk without being touched in the editor (`git checkout`, formatters, generated code) needs `didChangeWatchedFiles` or `fs.watch`. That would take on the burden to save 1.7 ms. By the same reasoning that dropped the incremental scan in "Where the time goes" above, we drop this too. **Re-reading everything every time is the simplest to implement, and structurally never goes stale.**

Reconsider if the scan starts to matter at around 1000 files. Until then, measure first.

#### Order of work

1. ~~Pass the overlay through internally~~ → done (below)
2. ~~Export `lint` as `valof/lint`~~ → done. Adding `src/lint/index.ts` to `pack.entry` is all it takes; `vp pack` writes `exports`
3. ~~The plugin~~ → done (below)

~~`--server`~~ is rejected. ~~`column`~~ and ~~`Options.types`~~ are in. oxlint owns `--format=json`, so whether valof-lint needs it is undecided.

**The plugin ships inside valof.** This reverses the "README recipe" stated above. None of the "when to split" conditions §14.3 set in advance (linter-only releases keep coming / runtime dependencies leak / the share of the shipped files) applies, and the plugin's own dependencies are just `node:worker_threads` and valof. For the same reason, no monorepo either. Flat config and `jsPlugins` both take a module specifier directly, so the `eslint-plugin-` name prefix is not needed.

#### The plugin, implemented 2026-09-09

`valof/eslint-plugin`. **One rule per kind**, so the host can set a severity for each, or turn it off.

```ts
// oxlint.config.ts
export default defineConfig({
  jsPlugins: ["valof/eslint-plugin"],
  extends: [valof.configs.recommended],
});
```

At first it had a single `findings` rule. One run answers every kind, so we thought splitting it would do the same work six times. **It does not.** The host `create`s every rule for a file before traversing it, so six `Program` visitors are called in a row on the same text. Remembering the last result alone is enough.

```
6 rules x 2 files  →  2 calls to lint()
```

`skip` was dropped. The host already has an on / off per rule, so adding a second mechanism means nothing. The project to read moved to `settings.valof.project`; as a per-rule option, six places could disagree. **We measured that both hosts pass `settings`.**

The kind prefix was also removed from messages. The host shows it as the rule name, as in `valof(structural-equals): Order.total holds …`.

**Rejected: building `skip` from the order of `create` calls.** The enabled rules are known by the time `create` is called, so they could be collected and `Program` could "skip all others". We confirmed that order on both hosts too. Still not taken. The order is not guaranteed by any spec, and the only gain is when structural-equals is off, and that rule does nothing by itself when there is no `.implEquals` anywhere (`needsTypes` in §14.8).

**`make-synchronized` was not added.** At 68 kB and deps 0, its quality is fine, but the table above called it "a dependency on the plugin side" assuming the plugin lived outside valof. Shipped inside, it would become one of valof's `dependencies` and break §14.3's "zero runtime dependencies". `Atomics.wait` + `receiveMessageOnPort` takes about 30 lines: the worker increments a version in a `SharedArrayBuffer` and notifies. The wait has a timeout, so if the worker does not answer, the plugin says so after 60 seconds.

**The worker is this same file.** `new Worker(new URL(import.meta.url))`, with `isMainThread` separating the two roles. As a separate file, it would be `./worker.ts` in the source tree and `./worker.mjs` in the shipped files, and the code would have to guess which one is running. (Split on 2026-11-11, below.)

**The worker became a separate file, 2026-11-11.** Two roles in one file are hard to read (user). The extension is not guessed. It is the plugin's own (`extname(import.meta.url)`). The plugin and the worker sit together in `src/lint/eslint-plugin/`, and ship in the same layout under `dist/eslint-plugin/`. `Query` and `Reply`, which both use, were in `messages.ts`, and have been in `linter-worker.ts` since 2026-11-11 (§14.8). The underline's `Underline` is in `underline.ts`.

- **No test checks where the shipped worker is.** The tests read the plugin from source, and a URL right only there
  passes them, such as one that hard-codes `.ts`. Which chunk `LinterWorker` lands in no longer matters (§14.8,
  "`serve` is a static method of `LinterWorker`"). `vp pack` rewrites
  `package.json`'s `exports` even with a different output directory, so a test cannot build it. #114's `check-dist`
  gets a check that runs the built plugin

**What is passed: one overlay + `report` for one file.** The computation covers the whole project and returns everything, but only the current file's findings are reported. `report` already existed, so the plugin needs no filtering. A finding's column is 1-based and `report`'s is 0-based, so subtract 1.

**Measured on both hosts.**

```
oxlint 1.77 + TS 7      src/order.ts:6:22 valof(findings): structural-equals: …   0.14s
ESLint 10               3:3 error unused-member: Id.shout is never read  valof/findings
```

On the ESLint side, typescript-eslint does not support TS 7 (above), so we checked with a `.js` fixture to show the plugin does not depend on the parser. The rules never look at the AST; in `Program` they use only their own file name and text, so this is enough to show the host API fits.

**Test against the real hosts.** `tests/lint/hosts`. The rule API is a contract valof cannot protect with types, and neither host is a dependency. A mismatch only shows up as a shape that does not fit, so running the real thing is the only way to notice. Mutation testing confirmed that both tests fail when either the column +1 or the key names in the plugin's `rules` are broken.

- **eslint and oxlint are pinned as devDependencies**, so the versions the findings are compared against do not move. See §14.19
- **The tests run the source plugin.** The shipped files exist only after `vp pack`, so those were checked by hand

On both hosts the column appeared at the finding's position. `report` is 0-based and output is 1-based, so the round trip returns to the original.

**Each file triggers one pass over the whole project.** During verification, linting a whole directory that contained a symlink to `node_modules` got stuck. Hosts exclude `node_modules` by default, so this does not happen in real projects, but it is where this shape's cost shows.

**The entries got names.** Derived from the path, it would be `valof/lint/eslint-plugin`. Users write this name in config files, so `pack.entry` in `vite.config.ts` became an object, giving `valof/eslint-plugin` and `valof/lint`. The bin moved to `dist/lint-cli.mjs`. tarball 39 KB → 41 KB.

#### `Options.overlay`, implemented 2026-09-08

```ts
lint(files, { overlay: new Map([["/abs/src/order.ts", "…being edited…"]]) });
```

`ReadonlyMap<string, string>`, keyed by absolute path. Paths not in `files` are scanned too, so a file that has never been saved can be passed as is.

On `Resolver` it is `overlay(sources)`, not `setOverlay`. **It is called once per run, even when empty.** A resolver the caller carries around still holds the previous run's version, so there is no need to tell "not passed" apart from "passed empty".

As expected, this is the only place the backends differ.

- **LSP (TS 7)**: `didOpen` the first time, `didChange` with a bumped version when the text changes, `didClose` when a file drops out. The line map is rebuilt from the overlay text. Notifications go on a single promise chain that continues from `initialize`, and `resolveAll` waits on the same chain (order matters)
- **in-process (TS 5 / 6)**: bump `getScriptVersion`, and `getScriptSnapshot` returns the overlay. `fileExists` / `readFile` also check the overlay, so an import of a file that exists only in the overlay resolves from other files

**Write the test by shifting lines.** A test that "covers it with a spec and the finding disappears" does not work. The scan alone decides that, so it goes green even without passing the overlay to the resolver (we wrote it that way once, and it did not fail under mutation). Instead, prepend `//` lines to text identical to the disk, shifting it line by line, and check that the finding moves with it. Then breaking any of `didOpen` / `didChange` / `didClose` / discarding the line map makes it fail.

The in-process side has no automated test (still the hole in §14.10). We installed TS 5.9.3 in a temp directory, called `inProcess` directly, and checked by hand that the shifted position resolves to the same declaration, and that it does not resolve without the overlay.

### 14.19 Pinning the oxlint version, measured 2026-09-09

We did not want a vite-plus update to silently move the oxlint version the integration tests (§14.9) compare against. It turns out **it can be pinned, and the config can have a single source of truth.**

#### `vp lint` looks for the project's oxlint first

```js
// vite-plus/dist/constants-*.js
function resolve(path) {
  return require.resolve(path, { paths: [process.cwd(), import.meta.dirname] });
}
```

cwd comes first, the copy bundled with vite-plus second. With `oxlint@1.82.0` as a devDependency, the process caught while `vp lint` was running was 1.82.0. So **once pinned, the tests and `vp lint` use the same single copy**. There is no room for drift.

Vitest alone differs. It uses `resolveBundled` (vite-plus side first), because `vite-plus/test` does `export * from 'vitest'`, and the tests break if the runner's vitest differs from the one they import.

#### `vp lint` does not read a standalone config

```
vp lint  +  oxlint.config.ts     26 hits (config ignored)
vp lint  +  .oxlintrc.json       26 hits (same with JSON)
oxlint   +  oxlint.config.ts      2 hits (found even without -c)
```

**No warning is printed.** The only way to notice is the difference in results. Capturing argv shows `vp lint` passes no `-c`; instead it sets `VP_RESOLVING_CONFIG_METADATA=1`, which switches oxlint's config source to `vite.config.ts`. So the normal lookup never happens.

#### Adopted: make `oxlint.config.ts` the source of truth, imported from `vite.config.ts`

```ts
// vite.config.ts
import lint from "./oxlint.config.ts";
export default defineConfig({ lint /* … */ });
```

```
vp lint              0 hits (via vite.config.ts)
oxlint (no -c)       0 hits (its own lookup)
```

`typeAware` / `typeCheck` work on both paths too (confirmed with a file that raises `TS2322` and `no-floating-promises`). These two are the only `options` on the oxlint side, and Vite+'s `lint.options` just passed them through.

Now the config stays in one place even when `.bin/oxlint` becomes the real binary. When an editor launches `.bin/oxlint --lsp`, the `OXLINT_TSGOLINT_PATH` the wrapper injected is lost, but 1.77.0 found tsgolint without the env var.

#### Fix tsconfig before adding rules, 2026-09-09

While adding `reportUnusedDisableDirectives`, we tried every category. Only two type-aware rules reported real problems, and **both pointed at a hole in tsconfig.**

```
no-unnecessary-type-assertion   19 hits   `starts[mid] as number`
no-unnecessary-condition        10 hits   `&& argument` after `const [argument] = children(…)`
```

The rules were right. Without `noUncheckedIndexedAccess`, `starts[mid]` looked like `number` and `argument` like `Node`. At run time both can be `undefined`. **The guards were written correctly, and only the types were wrong.**

After enabling it:

```
tsc --noEmit         1 error (one test line with a deliberate unsafe cast)
2 rules              29 hits → 2 hits
dist/index.d.mts     no diff; public declarations unchanged
```

Both of the remaining two were real. In `(id["start"] as number) ?? (node["start"] as number)`, the `as` makes its own fallback unreachable; the other was an unreachable `?.` in a test.

**Not one of the 19 `as` casts was removed. With the flag on, every one became necessary.**

Rules not added, and why: `no-useless-concat` (deliberate splits to fit 100 columns), `no-array-sort` (`filter().sort()` already produces a new array, and `toSorted` would copy twice), `consistent-function-scoping`, `no-undefined` / `no-non-null-assertion` / `no-async-await` (these are this codebase's own choices), `prefer-readonly-parameter-types` (174 hits), `no-shadow` (one of its two hits is a naming convention in tests).

#### Not added: `no-unsafe-*`, 2026-11-03

Applying `no-unsafe-assignment` / `-return` / `-call` / `-member-access` / `-argument` to `tests/` and the book's blocks gave 23 hits on 15 lines. **None of them is a place where valof's types return `any`.**

- 15 hits are on `@ts-expect-error` lines, where the erroring expression's result becomes `any`. A disable comment would compete with `@ts-expect-error` for the same next line
- 5 hits pass `JSON.parse` to a seal. `new Function`, `expect.objectContaining` and `Reflect.get` account for 1 each

It would need disable comments on 15 lines, and would find nothing. The fixtures have 0 hits, but cannot be removed from `ignorePatterns` (§10.1).

#### Severity: broken, or doing nothing, 2026-09-09

`configs.recommended` had everything at error. **Split by "does it break Valof?"**

| rule                  |       | reason                                                                                          |
| --------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `structural-equals`   | error | equals returns the wrong answer at run time                                                     |
| `duplicate-brand`     | error | two types share a brand, and the type system stops telling them apart                           |
| `brand-mismatch`      | error | §14.12. Not a style rule: "two things that must agree disagree", and the compiler never notices |
| `unnecessary-alias`   | error | §14.25. Likewise, "one Val or Trait has two names"                                              |
| `unimplemented-trait` | error | a Val that declares a Trait must implement it in the same companion chain                       |
| `companion-mismatch`  | error | §14.21. Likewise, "two things that must agree disagree"                                         |
| `split-companion`     | error | §14.22. The shape cannot be exported under the type name                                        |
| `bypassed-companion`  | warn  | §14.23. The resulting value is correct; what was bypassed is the type's entry point             |
| `unnamed-of`          | warn  | §14.24. The lifting itself is correct; what is lost is a greppable name                         |
| `incomplete-disable`  | error | see below                                                                                       |
| `unused-member`       | warn  | dead code; everything around it works                                                           |
| `unused-disable`      | warn  | a directive that silences nothing; the code does not change                                     |

Severity lives next to each rule as `Rule.warns`, so whoever adds a rule cannot avoid deciding it. The CLI does not read it (there is only one kind of finding, and a single finding makes it exit 1).

**`incomplete-disable` is an error because of the `-next-line` form.** One rule covers three forms, and they do not behave the same.

```
-next-line, no rule name    silences every kind on that line, including rules added later
-whole-file, no rule name   silences nothing
valof-lint-disable          silences nothing
```

The last two expose themselves. The finding the writer wanted to hide still appears, so the writer notices. Only the first is dangerous, but without splitting the rule there is one severity, so it follows the dangerous one.

(That `-next-line` silences every kind is by design. If it silenced nothing, the finding it was meant to suppress would appear, and the directive would mean nothing. See `effect` in `scan/directives.ts`.)

#### Checked in editors, 2026-09-09

We set up one oxlint project and one ESLint project in `~/tmp/valof-editor-check`. Both are set up **the way a user who installed `valof` from the tarball would have it**. Inside the repository, the root `oxlint.config.ts`'s `ignorePatterns` and nested configs interfere, and what the editor shows differs from the real thing.

**oxlint 1.77's LSP panics on JS plugin diagnostics.**

```
thread '<unnamed>' panicked at crates/oxc_linter/src/fixer/disable_fix.rs:52:22:
range end index 316 out of range for slice of length 0
```

It dies without returning a single diagnostic, so in the editor it looks like "nothing shows up". The CLI shows them, and the LSP shows built-in rules. **Only the combination of a JS plugin and the LSP triggers it.** Fixed in 1.82.0, so the pin went up to 1.82.0. The version was pinned in one place, so that was the only fix needed (§14.19).

**Reports pass a range, not a point.** A finding has only one position, so reporting it as is puts the squiggle under a single character. The plugin measures the word at that position: on a word, it passes the whole word; otherwise (the `//` of a disable comment), it passes up to the end of the line.

We do not add an end to the core `Finding`. All six rules would have to carry an end offset around, while only rendering needs it. Reconsider once a single finding spans several tokens.

**Messages do not state the rule name.** We added it once, because Helix 25.07's inline diagnostics render only `message`, and `code` (`valof(unused-member)`) only appears on hover. **Rejected: VSCode and Zed show the rule name by default** (checked on real installs 2026-09-09). ESLint, oxlint and TypeScript all leave the rule name out of the message by convention, and one host's rendering is not reason enough to break from it.

```js
// eslint core / no-unused-vars
unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.";
```

**ESLint needs TS 6 to read TypeScript.** typescript-eslint refuses to start with TS 7 installed (§14.9). The ESLint version of the check project installs `typescript@6`, and the side-by-side setup Microsoft recommends works as the workaround. As a by-product, **it became the only place the TS 5 / 6 in-process backend runs on a real host** (the hole in §14.10; still no automated test).

### 14.20 Host integration tests over LSP, 2026-09-09. Withdrawn 2026-09-15

**Withdrawn 2026-09-15 (#36).** `tests/lint/lsp` was removed along with the resolver (§14.7). `tests/lint/overlay` covers the unsaved-buffer path. What follows is the record.

`tests/lint/lsp`. It **starts both hosts as language servers** and runs the same test body from two describes. Through the CLI, `tests/lint/hosts` covers only that the rule API has the right shape. The editor path (unsaved buffer → `overlay` → `tsc --lsp`) never runs there.

```
open → findings as on disk
type → fixing only the buffer clears it
type → a member written only in the buffer shows up
save → follows disk changes to files not open
```

**ESLint has no language server.** We added the VS Code extension's server (`vscode-eslint-language-server` from `vscode-langservers-extracted`) as a devDependency. Its settings belong to the extension, not to ESLint, and are returned through `workspace/configuration`. Set `experimental.useFlatConfig` to **false**. True is the name of an ESLint 8-era experiment. With it, the server tries to import `FlatESLint` from `eslint/use-at-your-own-risk`, and ESLint 10 has no such export. With false, it loads the plain `ESLint` class, which no longer accepts anything but flat config.

**Rejected: `@typescript-eslint/parser`.** With TS 7 installed, it throws at import time (§14.19). And the server swallows that and returns 0 diagnostics, so **the test goes green even when the plugin is not running**. The worst possible outcome.

**Rejected: installing TS 6 alongside.** It works as a workaround (§14.19), but it brings in a different type system from the one under test, just for the tests. What valof actually uses is TS 7's `tsc --lsp`.

**Rejected: making the fixtures `.js`.** The ESLint side of `tests/lint/hosts` does that. But `structural-equals` reports only at the parent Val's declaration site, that is, inside a `.ts` file. Falling back to JS drops the whole type-resolution path, and nothing this section wants to check remains.

**Adopted: a parser that returns an empty Program.** Ten lines in the fixture's `eslint.config.mjs`. The rules read only `context.filename` and `context.sourceCode.text` from the host and never touch the AST (they re-parse the text with oxc-parser). As a by-product, the test pins down "does not depend on the host's AST".

**Pull the diagnostics.** Both servers answer `textDocument/diagnostic`. Waiting for pushes would make the test guess how many more are coming.

**Compare only the message body.** The position and the spelling of the rule name belong to the host (`valof(unused-member)` / `valof/unused-member`), and `tests/lint/hosts` covers those on both hosts. Normalization came down to one line.

**The disk-following test looks at the scan, not the resolver.** When `.implEquals` disappears from `money.ts`, `needsTypes` becomes false, and the rule goes silent without touching type checking. The resolver follows the disk 300 ms late (§14.9), so a test that touches it would be flaky.

**The oxlint side of `tests/lint/hosts` now uses JSON.** The default reporter draws either a one-line compact form or a framed excerpt, depending on the environment. It failed with the former locally and the latter on another machine. Passing `--format json` makes the test look at findings, not at the renderer. The ESLint side was JSON already, so both now have the same shape.

#### Two bugs found

**The plugin's cache lived across passes.** Its key is "the open file + its text + project", so it matches even after another file changes on disk. Fixing and saving `money.ts` left `order.ts`'s diagnostics stale. The entry is now dropped with `queueMicrotask`. The six `Program` visitors run synchronously one after another, and `ask` blocks the thread with `Atomics.wait`, so no microtask can run in between. **Batching within one pass is kept; only the carry-over disappears.**

```
2 rules in the same tick   → 1 ask (unchanged)
re-run across tests        → asks to order.ts: 2 → 4
```

We first confirmed that disabling the cache turned both hosts green, which showed the cause was neither the hosts nor the resolver.

**The LSP client told requests and replies apart by id alone.** Both sides number their messages independently, so when the id of the server's `client/registerCapability` matched one of our pending queries, the query resolved with `undefined`, and the server stalled waiting for an answer. Route on whether `method` is present first. `src/lint/typecheck/lsp.ts` had the same shape, so it was fixed too.

#### No child processes from inside oxlint, measured 2026-09-09

CI failed with `spawn ENOMEM`. **It is not a memory problem in valof. From inside an oxlint JS plugin, not even `/bin/echo` can start.**

```
PROBE VmSize: 28,189,900 kB | VmRSS: 92,912 kB | MemAvailable: 7,614,808 kB
PROBE echo: Error: spawnSync /bin/echo ENOMEM
```

oxlint reserves about 6.4 GB of address space per thread. It does not use the real memory (RSS 90 MB), but Linux counts a copy of that reservation on `fork()`, so it refuses to spawn from a process whose reservation exceeds the installed memory. macOS does not count it this way, so it passes locally.

| `--threads` | VmSize  | child process |
| ----------- | ------- | ------------- |
| 1           | 8.9 GB  | starts        |
| 2           | 15.3 GB | ENOMEM        |
| 4 (default) | 28.2 GB | ENOMEM        |

**Same root cause as upstream [oxc#20331](https://github.com/oxc-project/oxc/issues/20331).** The symptom there is "oxlint itself fails to allocate its arena and panics"; here it is "the allocation succeeds, and then the reservation stops the plugin from spawning a child process". Only the victim differs. Windows was fixed in 1.65.0 by moving to `VirtualAlloc`, and the plan for Unix is to move to `mmap(MAP_NORESERVE)`. Once the reservation stops counting toward `Committed_AS`, this is fixed at the same time.

**Tests run on one thread.** The CLI with `--threads 1`, the LSP with `RAYON_NUM_THREADS=1`. `--threads` is a flag of the run and does not reach the language server's pool, and there is no `OXLINT_THREADS` / `OXC_THREADS`. The pool is rayon, so rayon's variable limits it.

**The workaround is not universal.** Even one thread reserves 8.9 GB, so it does not help on machines with less than that (the Android report upstream panics even with `--threads=1`). It passes only because GitHub runners have 16 GB. Remove it once upstream is fixed.

**Users hit it too.** On Linux + oxlint + TS 7, every file gets `spawn ENOMEM`. ESLint (plain node, VmSize 1 GB) and TS 5 / 6 (in-process, no child process) are fine. The README's Caveats describe it along with the workaround, and `explain()` now explains the error.

**Reproduced in Docker.** It is faster than a CI round trip. oxlint alone, without `vitest`, failed too, which showed that parallelism was not the cause. The first suspect, "test parallelism", was wrong, and `maxWorkers: 2` was reverted.

#### README

**The "buffer and disk" paragraph was dropped from the README.** This reverses §14.9's "if the README says anything about this, it should be this". A plugin user does not need it before writing the config. The record stays in this section and in §14.9.

### 14.10 Test holes, inventoried 2026-09-08

**The method first.** Use **mutation testing**, not coverage percentages. Break one spot in the source and check whether `vp test tests/lint` fails. If it does not, no line of the tests protects that spot.

```sh
cp src/lint/rules/equals/paths.ts /tmp/m.bak
perl -0pi -e 's/const found = \[path\];/const found = [path];\n  return found;/' src/lint/rules/equals/paths.ts
vp test tests/lint    # if it still passes, the spot is uncovered
cp /tmp/m.bak src/lint/rules/equals/paths.ts
```

This found three "tests that cannot fail". `d827e00` closed them.

#### Closed, round 1 (d827e00)

- **Run the equals fixtures from the CLI.** The in-process `lint()` was always given `types`, and the CLI side only ran fixtures without `.implEquals`. The path in `index.ts` that "opens its own resolver and closes it in `finally`" never ran.
- **The `ignore/not-a-block` fixture.** The directive landed on line 3 and the finding on line 4, so the test passed even with the whole block check deleted. Changed to four lines: directive, blank line, another comment, code.
- **`equals/array-spec` and `equals/covered-above`.** The `ArrayExpression` branch of `specPaths` matters **only for a top-level array payload**. In the `{ charges: [...] }` shape, `covered.add(path)` adds the parent path at the entry, so even with the branch removed, the `charges` prefix covers it and the mutant survives.

#### Closed, round 2

- **`ARRAY_LIKE` in `paths.ts`.** Added `refunds: ReadonlyArray<Money>` to the `equals/array` payload. It lands on `charges[]` / `refunds[]`, the same as `readonly Money[]`.
- **The namespace form in `fromVal` in `chains.ts`.** Added a fixture for `valof.Val.sealer<User>().impl({…})` (now `bindings/namespaced-value`, §14.13).
- **`--help` / `-h` in `cli.ts`.** Checks the descriptions and padding too.
- **The "oxc-parser not installed" message in `cli.ts`.** `--import tests/lint/no-oxc-parser.ts` uses a resolve hook to make only `oxc-parser` fail with `ERR_MODULE_NOT_FOUND`. On a machine that has the parser, the test exercises the exit path of a machine that does not.
- **`needsTypes` and `--no-structural-equals`.** Replace the resolver with a spy and count the queries it receives. Two tests that only checked `[]` now observe what they claim.
- **TS1361 in `equals/covered/order.ts`.** Changed `import type { Money }` to a value import.

#### Remaining holes (confirmed by mutation)

| location                                   | what                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `unused.ts` `declaredName`                 | **chains** of `export { A as B }`. One hop is covered by `re-export` |
| `directives.ts` `widen`                    | two directives in one block, "the empty set beats every kind"        |
| `equals/index.ts`                          | two chains for one alias, "the first one wins"                       |
| the trim clause of `directives.ts` `joins` | **code** between comments. The blank-line case is closed             |

#### Remaining holes (from reading the code)

| location                     | what                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `typecheck/in-process.ts`    | the TS5/6 backend. The dev machine has TS 7.0.2, so `overLsp` is chosen and **none of it runs**. Goes together with adding TS5/6 to CI (§10.1) |
| `paths.ts` payload walk      | `TSTupleType` / `TSUnionType` / `TSIntersectionType` / `TSOptionalType`                                                                        |
| `unused.ts`                  | the deliberate over-approximation "a read of same-named companions credits both"                                                               |
| `duplicate-brand.ts`         | collisions within one file, collisions of three or more                                                                                        |
| the sort in `index.ts`       | the tiebreak by kind at the same file/line/column                                                                                              |
| argument parsing in `cli.ts` | multiple `--no-` flags. Covered on the in-process side                                                                                         |

#### Redundancy

`cli()` spawns went from 9 to 10. Merging the double lint in `[cli().status, cli().stdout]` and the two `dead-member` tests removed 2, and `--help` / `-h` / missing parser added 3.

`equals/covered` and `equals/excluded` take the same path through `specPaths`. **Keep both.** They record the intent "any entry covers the position, whatever its value".

#### Open: should the fixtures be type-checked?

`tsconfig.json` has `exclude: ["tests/lint/**/fixtures"]`. Removing it gives **112 errors**. The breakdown decides the question.

|                      | errors                   |
| -------------------- | ------------------------ |
| `structural-equals/` | **0** (TS1361 was fixed) |
| `mixed/`             | 1                        |
| `unused-member/`     | 73                       |
| `ignore/`            | 21                       |
| `duplicate-brand/`   | 16                       |

structural-equals only works when go-to-definition resolves, so its fixtures had to be realistic from the start, and they almost all pass. **The likely choice is to add `tests/lint/rules/structural-equals/fixtures/tsconfig.json` and check that subtree alone.** The rest stays excluded.

**Rejected: type-checking `unused-member/`, `ignore/` and `duplicate-brand/` too.**

- Some fixtures must fail type checking. The subject of `unused-member/builtins` is "input that `.impl` rejects at the type level". For `./elsewhere.ts` in `bindings/shadowed-type` and `no-cross-file-credit/reader.ts`, and `some-other-library` in `unused-member/foreign-impl`, the point is that they **do not exist**.
- `noUnusedLocals` flags exactly what the unused-member rule tests (companions nobody reads): 12 TS6133 errors.
- Passing would need a `Val` import, payload types, declarations of `user` / `id`, and parameter type annotations. A 6-line fixture would more than double, burying the 3 lines that matter.
- Fixtures would have to satisfy the real `EqImpl` / `Sealer`, so touching the equality design (§5) would break unrelated lint fixtures.

**Rejected: passing with `as any`.** In `(Val.sealer<User>() as any).impl({…})`, `rootPath` cannot follow `TSAsExpression`, so `fromVal` returns false and it is not recognized as a companion site. Findings drop to 0. Rewriting the expectation to `[]` makes it "pass", but that is exactly a test that cannot fail. Confirmed by measurement.

**Rejected: sprinkling `@ts-expect-error`.** It does silence everything, TS6133 included. But `@ts-expect-error` is not a suppression; it is **an inverted assertion**, and fails with TS2578 (`Unused '@ts-expect-error' directive`) once it is no longer needed. Putting it on 110 lines makes 110 claims that "this fixture is broken", the exact opposite of what type checking should give us (whether `implEquals([Money])` is a valid form).

**Rejected: `@ts-nocheck`.** It avoids the TS2578 churn, but nothing below that line is checked. It just scatters `exclude` across files where it is harder to see.

**Rejected: a lenient tsconfig for fixtures.** `strict: false` breaks `Val` itself (24 errors of `Type 'Money' does not satisfy the constraint 'AnyVal'`). A lenient project does not work.

#### Suggested order

Next: the `declaredName` chain, `widen` and `joins` in `directives.ts`, and "the first one wins" in `equals/index.ts`. Mutation confirmed each as a hole, and one fixture closes each. `in-process.ts` is a question of adding TS5/6 to CI, so it is separate.

### 14.11 Where the tests live, 2026-09-08

With fixtures apart from the tests, reading each test means jumping to another tree. The work in §14.10 is "one hole = one fixture + one test", so this round trip is the most frequent one. We colocated them.

```
tests/lint/
  support.ts          fixtures() / spy() / cli()
  no-oxc-parser.ts    resolve hook passed via --import
  rules/
    unused-member/      {fixtures/, index.test.ts}
    duplicate-brand/    …
    structural-equals/  …
  bindings/ …    added in §14.13
  ignore/   …
  skip/     …    fixtures in mixed/
  command/  …
```

**`tests/lint/` mirrors `src/lint/`.** Rules are grouped under `rules/`, and each directory is named **after the rule kind itself** (`duplicate-brand/`, not `brand/`). It is redundant, but it matches the expected strings and the `--help` list character for character. The four cross-cutting mechanisms stay one level up. `ignore/` corresponds to `scan/directives.ts` and `bindings/` to `scan/bindings.ts`, but `ignore` and `skip` are names of **features as users see them**, and `directives` is exposed nowhere. Rules alone show their names in `--help`, so for them the source structure and the users' vocabulary coincide.

**The boundary is three rules + four cross-cutting mechanisms.** The old `turning a rule off` held three unrelated things: the API's `skip`, the CLI's `--no-` parsing, and the cost claim "TypeScript is not started". The first two moved to `skip/`, the cost to `equals/`. `skip/` checks **what is reported**, `equals/` **what is paid**.

**Duplicate fixtures are allowed.** The subject of `command/` is the output's shape, so it has its own three: one finding, zero findings, and one with `implEquals`.

**`describe` blocks were removed.** The directory is the subject, so `describe("duplicate brands")` repeats the path. Test names already read as sentences on their own. Only `rules/unused-member/` keeps two. `what name resolution cannot reach` (`computed-key` and `spread`) records "deliberately not looked at", and is worth placing beside the tests that find things.

**A single-file fixture drops its folder.** `dead-member/a.ts` → `dead-member.ts`. `a.ts` says nothing about what it tests. Multi-file fixtures are named after their content, as `billing.ts` / `orders.ts`. Findings are reported relative to `fixtures/`, so the first line of the expectation names the fixture being looked at.

**Only `rules/structural-equals/` has a resolver.** The layout shows which tests need a language server.

There used to be an `unused/` directory too. Its `builder-chain` wrote `.implEquals`, and no test observed that. We kept two steps (`implSeal` and `fixed`) and dropped only `.implEquals`, then added the missing step to the chain in `equals/plain`. Mutation confirmed both.

- `rootPath` descending only one call step → only `unused/builder-chain` goes red (1 of 58)
- `readChain`'s walk stopping at a step without arguments (`fixed<"id">()`) → `equals/plain` goes red. A fixture that expects `[]`, such as `covered`, loses the whole site and stays green, so only a fixture **that produces a finding** can pin this down

**Three config entries.** In `vite.config.ts`, the lint / fmt `ignorePatterns` have `tests/lint/**/fixtures/**`; `tsconfig.json`'s `exclude` has `tests/lint/**/fixtures` (once `rules/` was inserted, `*/` no longer reached it). We confirmed `vp check` stays silent with type errors and broken formatting in a fixture. Get these wrong, and the fixtures get checked.

**Self-lint was removed.** `cli()` with no arguments linted `src/**/*.ts`, and `command/` had one test claiming "zero findings". It first moved out of `command/` (whose subject is the output shape) into `self.test.ts`, but there was no way for it to go red at all. Every `Val.sealer` / `Val.companion` in `src/` is in a comment or a string, with zero real uses. `src/val.ts` implements `Val`, so it does not call itself. **Until this repository uses valof for domain logic, the claim is empty.** Adding a use by hand turns it red, but that is not a mutation; it is building another repository.

When `src/` starts using valof, restore it at `tests/lint/self.test.ts`. Rejected making it a `vite.config.ts` task, because, like `vp run bundle-size`, nobody would remember to run it.

**Only `--help` lists the rules.** The `--no-typo` error in `skip/` builds `kinds` from the registry. It used to be three literals, so `--help` and two other places held the same list. When `brand-mismatch` from §14.12 was added, only one place went red. Mutation confirmed that breaking the message's shape (the preamble, the indent, the `, ` separator) turns the test red.

#### Expectations reference the rule, 2026-09-09

A finding's expectation was a single string: `"mismatched.ts:3:13  brand-mismatch  EmailAddress claims …"`. **That copied kind names into the tests 94 times.** It is now an object, with the rule itself in the kind's place.

```ts
{ rule: BrandMismatch, at: "mismatched.ts:3:13", message: 'EmailAddress claims the brand "Email", …' }
```

`rules/index.ts` exports each rule by name, and `support.ts` re-exports them. `skip` also takes an array of rules instead of `Kind[]`. **Renaming a kind is now a one-place change.** `support.ts` reads `RULES` to look up the rule for a kind, so it throws on an unknown kind.

**Messages were dropped from the expectations**, for the same reason as kinds: the wording would be copied into the tests. `lint` returns only `{ rule, at }`, and the wording comes separately from `messages`.

What stays are **only messages that say something the position cannot** (7 files).

| rule                                       | what the position does not show                                    |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `structural-equals`                        | the path (`Order.total`, `lines[]`); the position is the companion |
| `bypassed-companion`                       | three branches (constructor / `.seal` / no fix)                    |
| `brand-mismatch`                           | the brand it should claim                                          |
| `unnecessary-alias` / `companion-mismatch` | the name it resolves to                                            |
| `unused-disable` / `incomplete-disable`    | the rule the directive named, the spelling to write                |

50 were dropped. `User.shout` in `unused-member` and the type name in `split-companion` are exactly what the position points at.

**CLI output stays a string.** The subject of `command/` is the line's shape (position, kind, message, their order and the two spaces), and turning it into a structure would remove the test. Only the kind became `${UnusedMember.kind}`.

**The `--help` list stays a literal.** It has a role as the one place that goes red when a rule is added (above). Building it from the registry would remove that canary.

**Rejected: keeping one file and adding describes.** It does not bring the fixtures any closer.

**Rejected: referencing other directories' fixtures from `command/`.** It removes all duplication, but breaks colocation for that one file. We accepted the 5 lines of duplication.

**Rejected: keeping the hook as `.js`.** `--import` also goes through type stripping, so `.ts` works. The reason for `.js` was "it stays out of type checking", which also means one file in the repository goes unchecked.

**Moved to `module.registerHooks`.** `register()` is deprecated (@types/node 26 prints `@deprecated Use module.registerHooks() instead`). `registerHooks` is synchronous on the same thread and takes the hooks **as functions**. The body no longer has to be embedded as a string in a `data:` URL, and the body is typed now. Still one file. Confirmed by mutation: changing the specifier it watches turns `command/`'s "asks for oxc-parser" red.

### 14.12 Rule: a brand that does not match the type name, 2026-09-08

**Adopted.** `brand-mismatch`. Report when the part of the brand after the last `/` does not match the type name. On by default.

```
check  brand.slice(brand.lastIndexOf("/") + 1) === alias
```

```ts
type UserId = Val<"UserId", string>; // passes
type BillingId = Val<"billing/BillingId", string>; // passes; the part before / is ignored
type EmailAddress = Val<"Email", string>; // reported
```

#### Rationale: the brand is a duplication the language forces

From `type X = Val<...>`, TypeScript cannot infer "this is named `X`". So the brand string is **the type name, written a second time by a human**, and adds no information.

"State a fact once, at the canonical site" is the one thing that cannot be followed here. Since it cannot be followed, only lint can guarantee the two do not disagree. Like the existing three rules, this detects "two things that must agree disagree". It is not a style rule.

A rename exposes it. An LSP rename does not rewrite string literals, so renaming `OrderId` to `PurchaseOrderId` leaves the brand as `"OrderId"`. The compiler never notices. The cost lands in error messages: the deepest line, where the reader looks for "why", points at a type name that does not exist.

```
Type 'PurchaseOrderId' is not assignable to type 'UserId'.
      Type '"OrderId"' is not assignable to type '"UserId"'.   <- here
```

#### Rationale: the README already says so

> **Name the brand after the type it brands.**

The rule creates no new convention. **A machine just enforces one that already exists.** This is also why it is on by default.

#### Rationale: being able to choose the brand is itself a cost to think about

Accept `type EmailAddress = Val<"Email", string>` as valid, and the decision "how much abbreviation is allowed" falls to the user. That is the cost we do not want users to pay, so we do not accept it. A `UserV2` during a migration is the same: a different type should have a different brand. **There are effectively no false positives.** Non-literal brands and things that are not `Val` are excluded by the same `original(bound, typeName) !== "Val"` guard as duplicate-brand.

#### Rejected: two forms mixing the type name and a namespace

To let `type BillingId = Val<"billing/Id">` pass, we considered "the last segment matches, or the PascalCase concatenation of all segments matches". **There is no reason to let it pass.** If the type is named `BillingId`, the brand can be `"billing/BillingId"`. The namespace and the type name are orthogonal, and never needed mixing.

"The type name ends with the brand's last segment" (`BillingId`.endsWith(`Id`)) is rejected too. It would let `type UserId = Val<"Id">` pass, defeating the rule's purpose.

#### Rejected: a convention before the `/`, or recommending namespaces by default

**The part before the `/` is ignored.** Two reasons for not setting a convention there:

1. **Cross-boundary collisions effectively happen only in a monorepo.** valof does not recommend building libraries with it (the README's Caveats). In a monorepo, scanning every directory lets duplicate-brand see them as is. The brand rules do not use the resolver, so widening the target costs only the scan.
2. **What to use as a prefix depends on the project's structure.** It cannot be a convention.

As a by-product, **nobody pays the thinking cost until a problem appears.** Do not write a namespace until one is needed. When a second `UserId` appears and duplicate-brand fires, that is the time to decide how to divide them.

Accordingly, §2.1's "recommend a naming convention with a namespace, such as `"app/User"`" was revised. The README (`Id` in two domains of a monorepo) was written for monorepos only from the start, and §2.1 alone made it a general recommendation.

#### The message states the fix

The correct answer can be derived mechanically, so this rule can do what the existing three cannot.

```
EmailAddress claims the brand "Email", which should be "EmailAddress"
BillingId claims the brand "billing/Id", which should be "billing/BillingId"
```

It uses the same structure as `Id claims the brand "Id", and so does another type`; only the second half becomes "what it should be".

#### Implementation

`BrandClaim` already has `alias` / `brand` / position. It takes one `Rule` object and one line in `RULES`, with nothing added to `Scan` and no resolver (§14.8). The bundle budget is unaffected, because `scripts/bundle-size.ts` measures only `dist/index.mjs`, which does not include lint.

**Implemented 2026-09-08. `rules/brands.ts` was split into `duplicate.ts` and `mismatch.ts`.** With two rules in one file, the implementation functions' names collide. §14.8's "`findings` in every file" assumed one rule per file. The file names follow `unused.ts` / `equals/`, taking only the distinguishing word of the kind.

**Seven existing fixtures violated it.** The fixtures that observe duplicate-brand had the form `OrderId = Val<"Id">`, carrying both a duplicated brand and a type-name mismatch. Fixed by renaming the alias to `Id`. Now two files declare the same `Id`, exactly the monorepo example the README gives. Only `namespaced` got the brand `"orders/OrderId"`.

**Mutation confirmed three things.** Removing the `Val` guard turns `bindings/not-a-val` red; comparing the whole brand instead of the last segment turns `duplicate-brand/namespaced` red; dropping the namespace from the message turns the new `namespaced.ts` red.

---

## 15. v2 candidates

### 14.14 Rule: missing disable comment, 2026-09-08

**Adopted.** `incomplete-disable` (renamed from `bare-disable` on 2026-09-08, §14.18). It reports a directive that names no rule.
On by default.

#### Rationale: the silenced scope drifts away from what the writer decided

A bare directive silences **every rule** on the next line, including rules added later. On the day `brand-mismatch` was added,
a bare directive written for `unused-member` silently widened its scope. The writer decided nothing.

#### Rejected: fail the CLI (exit 2)

This proposal treated a bare directive like `--no-typo`, as a run that could not start. **It adds a round trip.** No other rule's findings appear until
the bare comment is fixed. With two things to fix, the user runs the linter twice. A finding with a location
shows everything in one run. It also works unchanged in the editor integration (§14.9).

**Only the message came from the exit 2 proposal.** It is an imperative, as `--no-typo` says "these are the rules I know".

```
valof-lint-disable-next-line names no rule; name the ones it silences
```

**The message does not list rule names.** To read `kinds`, the rule would have to import `rules/index.ts`,
and the registry and the rules would depend on each other in a cycle (the reverse of §14.8's "keep rule knowledge out of the caller").
It also keeps §14.11's decision that only `--help` lists the rules.

#### Rejected: make a bare directive do nothing

This proposal reports nothing and simply silences nothing. It is the smallest to implement, but **the reader cannot tell why the finding came back.**

The rule reports, and **keeps silencing**. The line below is written the way the writer wanted. Making the directive silence nothing here
would bury the original finding under the one about the bare directive.

#### Several rules on one line

`// valof-lint-disable-next-line duplicate-brand brand-mismatch`. **This already worked.** `directive()`
splits on `/[\s,]+/`, so either whitespace or commas separate the names. There was no test and no README entry, and no mutation (take only the first name /
split on whitespace only / split on commas only) went red. One fixture (`ignore/two-kinds`) turns all three
red. The `--help` example also named only one rule, so it now names two.

#### Implementation

Added `Scan.bare: Where[]`. `disabled` maps line → kind, and its key is **the line after the directive**, so it does not
hold the directive's own position. `disabledLines` returns both.

**Only effective directives count.** A directive written after code (`ownLine` is false) silences nothing, so
there is nothing to say about it. `ignore/after-code` staying green guards this.

**It cannot silence itself.** The finding is on the directive's line, and the directive silences the next line, so a bare directive
never removes its own report.

**Correction, 2026-09-08.** This section said "a named `// valof-lint-disable-next-line bare-disable` removes it", but
that worked **only because of a bug**. `byLine.set(blockEnd + 1, kinds)` was rewritten for each comment, so an entry
was left on a line in the middle of the block (that is, the next comment's line). It disappeared when §14.15 rebuilt this per block.
The only way to silence a finding about a directive is now `--no-<kind>`.

### 14.15 Rule: ineffective disable comment, 2026-09-08

**Adopted.** `unused-disable`. It reports each name a directive lists that silenced nothing on that line.
On by default.

```
valof-lint-disable-next-line names unused-member, which reports nothing here
```

**One finding per name.** When only one of `unused-member, duplicate-brand` is doing anything, the finding names
the one to remove. Bare directives are out of scope and left to `incomplete-disable`: there is no name to point at, and the fix it asks for is the same.

#### It needs the other rules' findings

This is the one rule that `Scan` cannot decide. "Did this directive silence anything" is a function of what the other rules reported,
and `run(scans, context)` could not see that. **`Context` gained two fields.**

```ts
reported: readonly Located[];      // what earlier rules reported, before silencing
notRun: ReadonlySet<string>;       // kinds that could not report
```

The order of `RULES` now matters for the first time, because it is the run order. This rule **goes last**.

**`notRun` holds only `--no-<kind>`.** A rule left out makes a directive look "ineffective", but the directive is not at fault.

**The remaining false positive comes from the glob.** duplicate-brand needs the partner file in the same run. Linting one file at a time
reports directives that do work across the whole project. The README says so.

#### Without TypeScript it does not run

At first, "`structural-equals` in a project without TS" was treated as one more false positive. `types()` was wrapped per rule,
and each kind that "asked and got `undefined`" went into `notRun`. **Dropped.** The path where `resolver()` returns
`undefined` was removed, and it now throws instead (`code: ERR_NO_TYPESCRIPT`). The CLI catches it and exits 2.

- **Nobody writes Vals without TypeScript.** A missing TypeScript is a broken install, not a setup to support
- **Reporting nothing silently is the worst outcome.** It cannot be told apart from a clean run
- **Three branches disappeared.** `Resolver | undefined` on `Context.types`, `if (!resolver) return []` in the equals rule,
  and the runner's per-rule wrapper. The `null` in `Options.types` became unnecessary too

**The check runs once, at startup.** At first it threw when a rule asked for name resolution. **Dropped.** Whether the run failed
depended on "whether these files contain an `.implEquals` right now". The day someone adds one `.implEquals`, CI on a machine without TS
fails for the first time. TypeScript is required even with `--no-structural-equals`.

**The check does not launch anything.** It only calls `require.resolve`. The language server still does not start until a rule
asks for it, so §14.8's 212 ms → 109 ms holds.

The test is `tests/lint/no-typescript.ts`. Like `no-oxc-parser.ts`, it uses a `module.registerHooks` resolve hook to make
only the resolution of `typescript` fail. A machine with TS can run the exit path of a machine without it.

#### Implementation: `Scan.disabled` / `Scan.bare` → `Scan.directives`

Each directive is now `{ line, column, covers, kinds }`. `disabled` (line → kind) is derived by `silences()`.

**Rebuilt per block.** Before, each comment called `byLine.set(blockEnd + 1, kinds)`, rewriting the entry every time the block
grew. **The entries for lines in the middle remained.** They were stale entries pointing inside the block rather than below it,
and `unused-disable` would read them as "effective directives". The entry is now written once, when the block closes
(see also the correction in §14.14).

#### File names match the kinds

`unused-disable.ts` next to `unused.ts` was hard to read. `rules/` now holds `unused-member.ts` /
`duplicate-brand.ts` / `brand-mismatch.ts` / `incomplete-disable.ts` / `unused-disable.ts` /
`structural-equals/`. This matches the layout `tests/lint/rules/` adopted in §14.11, and the vocabulary of `--help`.

### 14.16 Whole-file disable, 2026-09-08

**The spelling always states the scope.** There are four.

```
// valof-lint-disable-next-line unused-member       line
// valof-lint-disable-whole-file unused-member      file
// valof-lint-disable-all-whole-file                file, every rule
// valof-lint-disable ...                           no scope = an error. Silences nothing and is reported
```

`-all` comes before the scope, so if a line-level `-all` is ever wanted,
`valof-lint-disable-all-next-line` remains available. **Not added now.** No case wants "everything" on a line.

#### Rejected: make a bare `valof-lint-disable` mean the whole file

This was the first implementation, following ESLint's `/* eslint-disable */`. **Dropped.** It is the line spelling with
`-next-line` dropped, so the writer does not think about the scope. Worse, a bare directive silences every rule,
so **it also silences the `incomplete-disable` about itself**. The writer is told nothing.

#### "Names no rule" means different things per scope

This is the one asymmetry, and it has a reason.

- **Line**: silences everything, and reports (§14.14). If it stopped silencing, the original finding would be buried under the finding about the directive
- **File**: silences nothing, and reports. If it silenced, **the report itself would disappear**. Taking a whole file out is
  the job of a different spelling, `-all-whole-file`

`-all-whole-file` also silences findings about itself. That is what taking a file out of the run means,
so it is not a special case. **As a side effect, the guard in `incomplete-disable` that excludes `-all` cannot be observed.** Removing it turns nothing red,
so a code comment records it (CLAUDE.md: "When nothing can, the comment is the only record").

#### Implementation

`Directive` holds a `spelling`, separate from `covers: number | "file"`. `effect()` decides what is silenced
from the spelling and the names. **The convention "empty set = every kind" is gone** (`Silenced = ReadonlySet | "every"`).
Now that the meaning splits by scope, an empty set cannot carry two meanings.

`silences()` returns a predicate, not a Map, so the caller does not assemble the two levels, file and line.

**Only whitespace may follow the spelling** (`(?![-\w])`). This stops a typo such as `valof-lint-disable-nextline`
from turning into "a directive that silences the whole file". The fixture `ignore/misspelled` guards it.

### 14.17 Rules that do not accept `--no-<kind>`, 2026-09-08, withdrawn 2026-09-09

**Withdrawn, 2026-09-09.** The `always` flag was removed too. What follows records how that decision was reached.

The reason is that **a host can turn them off**, as measured below. The same two rules could not be removed in the CLI but could be
in the plugin. To a user that difference has no basis, and only the CLI was "protecting" anything.

In hindsight, the protection failed for a simple reason: **the criterion for an escape hatch was wrong.** `-all-whole-file`
was allowed because "it is written there and can be grepped". A `--no-unused-disable` written in a `package.json` script or a CI config
meets that condition too. The line between a flag typed by hand for one run and a committed setting
is not the line between a flag and a config file.

Removed: `Rule.always`, `skippable`, `isSkippable`, the CLI's rejection branch, and the filtering of skip in `lint()`.
`skip` now removes exactly the named kinds.

---

The original record follows.

`incomplete-disable` and `unused-disable` cannot be removed with `--no-`. `Rule` gained `always?: true`.

**Reason.** A switch that turns off "the reports about silencing" becomes a way to **silence everything and hear nothing**.
These two rules exist to prevent exactly that, so they must not have a way to remove themselves.

The escape hatch stays only on the file side. `valof-lint-disable-all-whole-file` takes the file out, findings about itself included.
Unlike a global switch, **it is written in that file and can be grepped.**

**Cost.** For `unused-disable`'s glob-driven false positive (linting one file at a time reports a duplicate-brand directive
whose partner is missing as "ineffective"), there is no longer a global switch. The only escape hatch is `-all-whole-file` in that file.
If this is revisited, remove `always` from `unused-disable`.

**Solved, 2026-09-08. Separate arguments for the set to read and the set to report on.**

```
valof-lint src src/billing/id.ts                         the first argument is the project, the rest are report targets
valof-lint --report-on src/billing/id.ts --project src   passed by name, in any order
valof-lint src                                           without report targets, the whole project
valof-lint 'src/**/*.ts' '!src/generated/**'             ! excludes
```

This section once said "solve it in practice, and fix it together with the editor integration". **The reason for waiting, that it had no users, no longer holds.**
lint-staged is one. It appends paths at the end, so positional arguments as report targets fit it better.

**The first argument must be a glob or a directory, or it is an error.** `valof-lint one.ts` can no longer be written. A single-file run
is exactly the form where three rules give wrong answers, so the arguments make it impossible. Adding only a `--project` flag (every positional argument a report target)
also worked, but **forgetting to pass the project would go unreported.**

**Accepting a directory means owning two policies.** `<dir>/**/*.{ts,tsx,mts,cts}`, with `node_modules` excluded.
Until now the glob decided everything. `valof-lint .` walking `node_modules` is an accident that really happens, so the exclusion is needed.
The fixture `project/pkg/node_modules/dep.ts` guards it (removing the exclusion turns it red).

`Options.report` is a set of resolved paths. `lint()` drops the rest in the last filter, the same one that applies silencing. **The scan covers
`project ∪ positional arguments`.** When a new file the project glob does not pick up is passed as a report target, the linter must not say
"nothing here" without reading it. The fixture `project/outside/fresh.ts` guards this (removing the union turns it red).

**Added exclusion with `!`, 2026-09-09.** Both sets could take several entries from the start (`--project` and the positional arguments both collect into arrays), but there was no exclusion. A path starting with `!` goes into neither the project nor the report targets but into the exclusions, which **are expanded and then subtracted from both sets.**

Excluded files also drop out of the scan, so the aliases and reads they held no longer affect the answers for other files. A user who excludes generated code wants it out of the run entirely, so this is correct. If "scan but do not report" is needed, the exclusion can subtract from the report side only. That waits until someone asks.

No glob matcher is needed. Subtracting the result of `expand("src/generated/**")` is enough, and an excluded path resolves with the same semantics as a positive one.

**Renamed `--target` to `--report-on`, 2026-09-09.** What the internal API calls `Options.report` was `--target` in the CLI, so one thing had two spellings. The help text already said "what the run reports on".

Rejected names: `--files` (the project is files too), `--only` (reads as "lint only these", the misreading this design most wants to avoid, since narrowing the scan changes the answers), `--report` (one word, and measured to clash little, since `--format` is the usual flag for the output format; still, `--report-on` reads better with its verb and preposition). `v0.4.0` has no `bin` and the CLI is unreleased, so the rename cost nothing.

The linter does not guess whether a run is complete. Guessing what it cannot determine leans toward missing directives that really are ineffective.
**The user knows where their project ends, and can say so in the arguments.**

The editor integration (§14.9) needs the same shape: the plugin passes the whole project to `lint()`, and makes only the file
currently open a report target.

A file with `-all-whole-file` is not affected by this. It is in the run, it counts as evidence for other files' findings,
and only its own findings are not reported. A directive removes reports, not facts.

**Implementation.** `lint()` only filters the skip set through `isSkippable` (no rule-specific branch). The CLI returns a separate message for `--no-`.
The `--help` line "Leave a rule out of the run, but not …" is also built from the registry.

**A host can turn them off. Measured 2026-09-09.** With `"valof/unused-disable": "off"` the diagnostics drop to 0
(oxlint, JS plugin). **A plugin has no way to block this.** Severity is the host's mechanism, and neither ESLint nor oxlint has an API to make a rule mandatory.
Anything registered as a rule can be turned off. Avoiding that would mean mixing the two into other rules'
reports, which would produce duplicate findings for each rule.

This is the basis for the withdrawal above.

### 14.18 How the rules about directives appear, 2026-09-08

**The two-group display was removed too, 2026-09-09.** Once they accepted `--no-`, the two became rules like the others
(§14.17). Without the "always run" caveat, the only reason left to separate the groups is "these are rules about comments",
and `description` already says that. The heading is now
`Reports what the type checker cannot, and what a disable comment does not do:`, in one list.
`Rule.directives` (a flag added once as the key for the split) was removed too. The record of the rename (below) stays.

**The README table lists both too.** If they are rules like the others, they belong in the same table. The Disable comments section
keeps one sentence, "a comment answers to these two rules", and the table carries the explanation.

The original record follows.

**Internally still Rules, split into two groups in `--help`.**

```
Reports what the type checker cannot:
  unused-member       …
  duplicate-brand     …
  brand-mismatch      …
  structural-equals   …

And about the disable comments themselves, which always run:
  incomplete-disable  …
  unused-disable      …
```

To a user, these two differ from the other four. **They point at comments, not code**, cannot be silenced on a line,
and do not accept `--no-` either (§14.17). The discomfort came not from the names but from **listing them in the same column**, so the layout solved it.

**Rename.** `bare-disable` → `incomplete-disable`. One word covers both "names no rule" and "states no scope".
It pairs with `unused-disable` (nothing missing, but no effect).

#### Where other linters draw the line (measured on oxlint 1.77.0)

```
a.js:1:1: warning: Unused oxlint-disable directive (no problems were reported).
```

**It has no rule ID.** It is the linter's own diagnostic, off by default and enabled with `--report-unused-disable-directives`.
A bare `/* oxlint-disable */` is not reported. What flags it is `no-unlimited-disable` in `eslint-plugin-eslint-comments`,
a **plugin rule**, which has an ID. **The industry draws the line as "unused = diagnostic,
unlimited = rule"**, and our two span both.

#### Rejected: merge into one kind (`disable-comment`)

Accurate as a name, but **two defects with different fixes collapse into one word** (name a rule / remove the directive).

#### Rejected: leave the column empty, as ESLint does

This proposal removed the kind from the output. **It puts a rule-specific branch into the printer** (the kind §14.8 removed). Without an ID,
there is also less to search for. Off by default is rejected too. On by default was decided in §14.14 / §14.15.

### 14.13 One place for how `Val` is spelled, 2026-09-08

"Recognize `Val` however it is spelled" is a shared fact that three places depend on: `brands.ts:41` (type position), `aliases.ts:76`
(type position, collecting equals aliases), and `fromVal` in `chains.ts` (value position). Their fixtures were scattered across per-rule directories,
so they were gathered in `bindings/` (matching `src/lint/scan/bindings.ts`).

Moved: `renamed-val` / `namespaced-val` / `shadowed-val` / `not-a-val` from `brand/`, and
`namespaced-val` from `unused/`. The names now state the position (`renamed-type` / `namespaced-value`).

**Gathering them exposed two holes.** One fixture closed each, and a mutation confirmed each goes red.

- **`Val` renamed in value position.** `import { Val as V }` + `V.sealer<User>()`. The only form that goes through
  `original(bound, first)` in `fromVal` was not covered. → `renamed-value.ts`
- **A qualifier that is not a namespace import.** `other.Val<"Id", string>`. Removing `namespaces.has` from `valName` left
  `namespaced-type` green (the right-hand side is `Val`, so it passes). Only a fixture on the **rejecting side** guards that check.
  → `not-a-namespace/`

**The expected findings span two rules.** Type position expects `duplicate-brand`, value position expects `unused-member`. Putting both in a directory
named after no rule says "this is not about a rule". The subject is binding resolution, and each
finding comes from **the rule that observes it most cheaply**.

**Rejected: move `unused/`'s rename tracking too.** `renamed-import` / `re-export` / `same-name` /
`no-cross-file-credit` exercise `exportedAs` → `declaredName` in `unused.ts`. They exist only in unused, and
no other rule calls them. They are a feature of the rule, not a shared mechanism, so they stay in `unused/`.

### 14.21 Rule: companion whose name differs from the type, 2026-09-09

**Adopted.** `companion-mismatch`. It reports binding `Val.sealer<X>()` / `Val.companion<X>()` to any name other than `X`.
On by default, error.

```ts
const User = Val.sealer<User>().impl({ ... }); // passes
const Account = Val.sealer<User>().impl({ ... }); // reported
```

#### Rationale: declaration merging needs the names to match

Because `type User` and `const User` share a name, one `User` serves as the type, the constructor and the namespace (§2).
When the names split, the reader has to remember two, and `Account.greet(user)` never mentions the type's name.

Like brand-mismatch (§14.12), this is a disagreement between two things that should match, and the compiler will never notice. It also
surfaces on a rename in the same way. The type and the const are separate symbols, so an LSP rename changes only one.

#### The check reads the code as written. It does not resolve aliases

`const Account = Val.sealer<Account>()` next to `import type { User as Account }` passes. It is consistent to a reader of that file,
and there is nothing to fix. A type living in another file is what §14.22's rule checks.

#### Holding the builder in a variable is reported too

```ts
const seal = Val.sealer<User>(); // reported
export const User = seal.impl({ ... });
```

**Rejected: follow through to the name `.impl` is bound to.** At first this form passed (after the walk, "the builder's local name" was replaced
with "the name its `.impl` is bound to"). **The form gains the user nothing.** `Val.sealer<User>()` is a callable constructor before `.impl`,
so `seal` becomes a second name for `User`'s constructor. Splitting it gains no capability at all, and folding the chain into one `const User`
removes it.

The rule fits in one sentence, "bind the chain to `X`", and the tracking machinery (the `implemented` map and the rewrite after the walk)
was removed too. `unused-member`'s `held-in-a-variable` fixture now has two findings. unused-member itself
still has to see through this form (it reports correctly as long as the form exists in users' code).

A destructuring (`const { greet } = Val.companion<User>().impl({...})`) has no name, so it stays silent.

#### The location is on the const name

The finding points at the bound name, not the head of the chain. The editor underlines the word at the finding's location
(`over` in `eslint-plugin.ts`), so pointing at the head underlines `Val`. A finding about a name points at the name.

### 14.22 Rule: companion in a different file from its type, 2026-09-09

**Adopted.** `split-companion`. It reports when the `X` of `Val.sealer<X>()` / `Val.companion<X>()` is an imported name.
On by default, error.

```ts
// user.ts
export type User = Val<"User", { id: string }>;

// companion.ts
import type { User } from "./user.ts";
const User = Val.sealer<User>().impl({ ... }); // reported
```

#### Rationale: splitting them prevents exporting under the type's name

Declaration merging works only within one file. Measured (TS 7.0, `--strict`):

```
type and const in separate files, both exported                TS2395 must be all exported or all local
type re-exported from a second file + const                    TS2323 Cannot redeclare exported variable
```

What remains is either "a companion under another name" (which §14.21 reports) or "a companion that cannot be imported under the type's name".
So this rule creates no new convention. **It names, before the error appears, a form the type system already rejects.**

#### The check is one import lookup. No resolver

`bound.imported.has(typeName)` is all of it. It does not resolve types, so the language server does not start (better not to start it,
for the same reason `structural-equals` starts it only when an `.implEquals` exists).

How `Val` is spelled does not matter. Even with `import { Val as Value } from "valof"`, the chain is found through `fromVal` →
`original(bound, …)` (fixture `renamed-val/`). The rule only checks whether **the type argument's name** is imported.

A namespace-qualified type argument (`Val.sealer<ns.User>()`) is reported too. Going through a namespace import already means another module,
so the check needs no import table. `CompanionSite` holds the qualifier in `qualifier`, and `typeName` is the declared
name (`ns.User` → `User`). Until then `companionSite` accepted only an `Identifier`, and the site itself was not
recorded. **`companion-mismatch` and `structural-equals` were missing it too.**

**Rejected: compare declaration files with go-to-definition.** It would see aliases through a helper (`type Local = Imported`),
but it would start TypeScript just for this rule. It misses only that one form, and staying silent is the safe failure. A local
alias fits better on the brand-mismatch side (§9).

### 14.23 Rule: `Val.of` on a type with a companion, 2026-09-09

**Adopted.** `bypassed-companion`. It reports `Val.of<X>` when X has a companion. On by default, warn.

```ts
Val.of<User>(p); // User = Val.sealer<User>()            → bypasses User, the constructor for it
Val.of<Age>(n); // Age = …implSeal(check)                → bypasses Age.seal, which checks the payload
Val.of<Row>(r); // Row = Val.companion<Row>().impl({…})  → brands a payload that no seal checked
Val.of<Token>(s); // no companion                         → silent
```

#### Rejected: stay silent only for a companion without a seal

This proposal was the first recommendation. `Val.of` is the only way to build a value of a companion without a seal (§6.5), so
a warning there would point at something with no fix. **Withdrawn, because lifting a value across a boundary is orthogonal
to whether a seal exists.** When a verified `Age` payload arrives over RSC, `Age.seal(p)` runs the check twice and adds
`Result` handling, so the code to write is `Val.of<Age>(p)`. A "legitimate `Val.of`" therefore happens on types
with a seal too. **Both proposals need a disable comment at the boundary**, so this split buys nothing.

Instead, the message comes in three forms that say "what the type has". A companion without a seal has no fix,
so its message gives none.

#### A legitimate site keeps a disable comment

A value can be said to arrive verified **only on a path where both sides ship in the same deployment** (the correction in §8.3): RSC /
Server Functions, JSON-RPC between processes of the same app, and Electron's chromium ↔ node IPC. Database rows do not count.
Writing that path after `--` in the comment keeps in the code why skipping the check is safe. This is why the rule warns. The value itself
is correct. What it bypassed is the type's entry point.

#### A companion without a seal does not get noisy, examined 2026-09-09

The question checked: "a type without a seal can only be built with `Val.of`, so won't the rule warn every time?" **It won't.**

- **`patch` works without a seal.** It goes through the default seal (brand + copy), so values derive normally
  (`Derive` in `val.ts`). `equals` too
- **For a companion that registers only `implCreate`, the entry point is `X.create(…)`.** It does not need `Val.of`, so no warning appears

What remains is only "a type with neither seal nor create, whose values come from a boundary", which is exactly the place
to write the path in a disable comment (§8.3). **No rule forbids a companion without a seal at the declaration.** §6.5's three reasons for rejection
still hold.

#### Matching by name, with no resolver

It matches names the way `unused-member` resolves reads. The rule turns the type argument into the declared name (`original` for a renamed import,
the right-hand side for a namespace qualifier) and matches it against the companion sites. **§14.22 makes this work.** It can assume
the type and the companion are in the same file, so a name clash reduces to the same problem as a brand clash.

`Val.of(payload)` without a type argument (the form inferred from the assignment target) is not checked. There is no name here to use as the key.

### 14.24 Rule: `Val.of` without a type argument, 2026-09-09

**Adopted.** `unnamed-of`. It reports `Val.of(…)` without a type argument. On by default, warn.

**Renamed `inferred-val-of`, 2026-11-11.** `unnamed-of` said neither that the rule is about `Val.of` nor what is
missing (user). The new name says that the lift takes its type from inference. A breaking change for a disable
comment or a config that refers to the rule.

- **Rejected: `implicit-val-of`.** "Implicit" covers more than the type argument
- **Rejected: `untyped-val-of`.** It reads as `any`, and the type is in fact fixed by the target

`Val.of<Age>(x)` is allowed as an escape hatch because **the required type argument makes it greppable** (§2.2).
Without the type argument that justification no longer holds, and `bypassed-companion` cannot see it either. **Right after a new rule was added,
a way to bypass that rule silently remained.**

#### The check is syntax only. No types needed

There is no need to confirm with types that "it reports only when the return type is known". **If it is not known, compilation fails**
(measured with TS 7.0, `--strict`).

```ts
const a: User = Val.of({ id: "x" }); // passes (contextual typing)
take(Val.of({ id: "y" })); // passes (argument position)
const c = Val.of({ id: "x" }); // TS2345 parameter of type 'never'
```

The signature is `of: <V extends AnyVal>(value: SeedOf<V>) => V`, and `SeedOf<V>` is in a position TypeScript cannot infer from. `V` comes
only from the context, so without one the parameter becomes `never` and the call fails. The rule fires only on forms whose type is
already determined.

#### Out of reach: `const { of } = Val`

A destructured `of` is not tracked. It is treated like `const { greet } = …` in §14.21: a form name resolution cannot follow,
out of scope since §14.1.

#### The location is on `of`

There is no type argument, so there is no name to point at. Pointing at `Val` would underline `Val` (the same reason as §14.21).

#### The README no longer shows a disable example

The `Val.of` section once had code showing "silence it like this at a boundary". It was removed. **It is an escape hatch, not
a recommendation.** An example reads as a recommendation. The valof-lint section explains how to write a disable comment, and that is enough.

### 14.25 Rule: a second name for a Val / Trait, 2026-09-09

**Adopted.** `unnecessary-alias`. It reports a top-level `type A = B` where `B` is a bare reference that resolves to a Val or a Trait.
On by default, error.

```ts
type Account = User; // reported: Account is a second name for User; use User
type Either = User | Order; // not checked
type Ro = Readonly<User>; // not checked
type Wrap<T> = T; // not checked
```

**One Val, one name.** A second name separates the type from its companion. It is the same failure as `companion-mismatch` (§14.21)
seen from the other side: the error message says `User`, the code says `Account`, and the reader looks for
`User.greet`.

#### Not added to brand-mismatch

At first this went into §9 as "resolve to the brand and compare with the type name". **The brand string is not what is broken.**
The brand of `type Local = ImportedUser` is `"User"`, which is correct. What is broken is having two names, and the rule cannot tell the user
to fix the brand either (the alias is in another file, so it cannot be fixed there). It became a separate rule whose message says
"use the original name".

#### Unions are not walked

**Only bare references are followed.** `type Either = User | Order` does not claim a single brand, so it is not an alias of a Val,
and `Readonly<User>` is a different type in its own right. The rule does not walk type expressions, so the cost is one map lookup per alias.
Reading declared types through the LSP was rejected. The resolver has no way to read types (only go-to-definition),
it would break the design where the brand rules do not use the resolver (§14.12), and it would end up visiting every type declaration.

#### Chains are followed

If `type B = User` sits above `type A = B`, both are reported. Reporting only the nearer one would surface the next one each time one is fixed
(the same reason as §14.7). `seen` stops cycles.

#### By-product: the `split-companion` hole closed

Writing a companion next to `type Local = ImportedUser` was invisible to §14.22, because the type is a local declaration.
This rule reports the second name, so that path is closed. The fixture `companion/` has that form, and
its one finding is `unnecessary-alias`.

### 14.26 Rejected: `Rec` that is not self-referencing, 2026-09-19

**Not adopted.** This proposal reported `Rec<X>` where `X` is not the declaration's own type name. Types cannot block it (§3.7), so it went to a rule,
but **there was nothing to block.**

```ts
type Forest = Val<"app/Forest", { roots: Rec<Tree>[] }>; // the same type as `Tree[]`
type Odd = Val<"app/Odd", { n: Rec<number> }>; // the same type as `number`
```

`Rec` unwraps, so the type is the same with or without it. There is no motivation either. `brand-mismatch` makes the error message show a type name
that does not exist, and `unnecessary-alias` separates the type from its companion. This has no such harm.

**The symptom appears only for a `Rec` outside a declaration**, and that is unrelated to whether it is self-referencing. The types already reject it.

```ts
declare function walk(node: Rec<Tree>): void;
walk(tree);
// TS2345 Property '__valof_internal_rec' is missing in type 'Tree'
```

The message shows the name of an internal key, so a rule would make it easier to read. The docs show `Rec` only inside a declaration,
so nothing leads a user to write this form. Revisit it if a real case appears.

### 14.27 `unused-member` and names the types reject, 2026-10-14

**A name the types reject does not count as a member.** `unused-member` does not report it even when it is written in `.impl`.

This started with something #36 left behind. `equals` and `update` remained in the scan's `BUILTIN`, so an unread
`equals` was not reported. Fixing it showed that `unused-member` handled invalid names in three different ways.

| Name written in `.impl`        | Types  | `unused-member` before |
| ------------------------------ | ------ | ---------------------- |
| `patch` / `seal` / `create`    | reject | silent                 |
| `then`, `implFoo`, `__valof_x` | reject | reports "never read"   |
| Enum `match`, Variant names    | reject | reports if unread      |

"Never read" is the wrong diagnosis. Adding a read does not fix it.

**Rejected: report invalid names in a dedicated rule.** It would duplicate the type check. valof-lint looks at what the type check
cannot catch.

**Rejected: remove `BUILTIN` and report everything.** The wrong diagnosis would spread to `patch` / `seal` / `create` too.

#### Where the check happens

| Name                                   | Where | Basis                                     |
| -------------------------------------- | ----- | ----------------------------------------- |
| `Reserved` (rejected by every `.impl`) | scan  | the core types                            |
| `match` in an Enum's `.impl`           | scan  | `keyof EnumCompanion`                     |
| `dyn` in a Trait's `.impl`             | scan  | `keyof TraitCompanion`                    |
| Variant names in an Enum's `.impl`     | rule  | the `Enum<…>` declaration (`enumAliases`) |

Variant names depend on each Enum, and the declaration may be in another file. The scan reads only one file, so
the rule drops them. For an Enum whose declaration does not determine its Variants, nothing is dropped. Staying silent there would mean
no member of that Enum's `.impl` could ever be reported.

The types accept `equals` and `update`, so they are reported when unread.

#### `Reserved` and the regular expression strings

```ts
type Rejected = Partial<Record<Wired, never>> &
  Steps & {
    [key: `__valof_${string}`]: never;
    then?: never;
    nocopy?: never;
  };
export type Reserved = keyof Rejected;
```

```ts
const RESERVED = reserved([
  "patch",
  "seal",
  "create",
  "then",
  "nocopy",
  "impl",
  "implSeal",
  "implCreate",
  "implTrait",
  "implVariant",
  "__valof_.*",
]);
```

On 2026-10-19, `` `impl${string}` `` was replaced with a list of step names (`Steps`). "Dropping the `impl` prefix match" below explains why.

2026-10-26: `then` was removed too (§15.2 "Remove the reserved names"). `Rejected` is now only `Partial<Record<Wired, never>>`, and
`RESERVED` is now three names: `patch`, `seal` and `create`.

- **`Reserved` is read from the keys of `Rejected`.** The two cannot drift apart. The comments giving the reasons can also stay next to the names.
  `CompanionMembers<V>` became `Rejected & { … }`. The type a user sees is the same, and an audit confirmed that the error codes,
  locations and hovers did not change
- **`"__valof_.*"` is assignable as a string to `` `__valof_${string}` ``.** The regular expression pattern passes the type
  check unchanged. The names in `Wired` and `Steps` are valid regular expressions too
- The parameter type of `reserved` checks two things: each pattern is a name in `Reserved`, and every member of `Reserved` has
  a pattern. Missing either is a type error
- **For `__valof_`, the type checks only the prefix.** `"__valof_x"` also satisfies `` `__valof_${string}` ``. Fixtures pin down that the pattern
  keeps its breadth, with `__valof_traits` and `__valof_x`. The types accept `implFoo`, so it is reported when unread. `implTrait` is
  not reported
- At run time the patterns are wrapped in `^(?:…)$`. Unwrapped, `"patch"` would match `dispatch`

The name is `Reserved`. **Rejected: `Builtin`.** `then` and the prefix are not built-ins. The existing JSDoc and the Trait
error text also say "reserves".

#### Dropping the `impl` prefix match, 2026-10-19

`` `impl${string}` `` also rejected lowercase words: `implicit` (an OAuth grant type), `implied`, `implement`.
This hits Enums that use lowercase strings directly as tags, as when external values flow into
`E[Tag].match(input.tag, …)`.

**The types reject only step names.**

```ts
type ValStep = "impl" | "implSeal" | "implCreate" | "implTrait"; // val.ts
type EnumStep = "impl" | "implVariant" | "implSeal" | "implTrait"; // enum.ts
type Steps = Partial<Record<ValStep, never>> & Partial<Record<EnumStep, never>>;
```

- Each entry point has its own list, and an intersection combines them. Val members, Trait members and Variant names all reject the whole of
  `Steps`. A Variant named `implCreate` is rejected, and so is a Val member named `implVariant`
- Only Variant names cause an overwrite at run time. The Enum's Proxy (`get` in `src/enum.ts`) reads `impl` /
  `implVariant` / `implSeal` / `implTrait` by exact match, and every other name falls through to the Variant slot. Val
  members overwrite nothing. `.impl` creates a new object, and the chain is closed
- `` `__valof_${string}` `` stays a prefix match. It is where the library keeps its internal names, and it does not
  overlap user names
- **Cost: adding a step gives a type error to users who used that name.** Nothing breaks silently. Before 1.0 a
  minor release allows this. `Steps`'s JSDoc says "a step added later may take a name starting with `impl`"

**Rejected: `` `impl` | `impl${Capitalize<string>}` ``.** `implicit` passes. But `Capitalize<string>` matches
"starts with a character that capitalizing does not change", so it also rejects `impl_x`, `impl1` and `impl$`. It rejects
`implFoo`, which is not a step, too. TS 7.0.2 / 6.0.3 / 5.9.3 gave the same result.

**Rejected: a lint rule that warns on names where an uppercase letter follows `impl`.** Both things it would protect are weak, and it does not pay for its maintenance.

- Readability. Naming something `User.implFoo` is the user's decision
- Clashes with steps added later. These do not break silently: adding a step to the list makes every such name a type error. A warning ahead of time
  is needed only where something breaks silently

**Rejected: mix `impl[A-Z].*` into `RESERVED`.** `RESERVED` holds the names that "the types reject, so `unused-member` does not report".
Mixing it in would stop reporting an unread `implFoo`, which the types accept.

`index.d.mts` grew from 62.62 kB to 62.96 kB. Most of the increase is `Steps`'s JSDoc.

#### Other names tied to the types

The same PR tied the core names that the lint had spelled out directly to the types.

| Name in the lint                        | Read from                                             |
| --------------------------------------- | ----------------------------------------------------- |
| `STEPS` (6, such as `impl`, `implSeal`) | keys on the builder but not on the finished companion |
| `sealer` / `companion`                  | keys shared by `Val`, `Enum` and `Trait`              |
| `of`                                    | `keyof typeof Val`                                    |

`Declarable` in `src/trait.ts` also wrote out `Wired | __valof_… | impl…` again. It now uses `Reserved`.
This duplication was inside the core, unrelated to the lint.

- **`STEPS` is read as a difference.** The form `Exclude<keyof CompanionBuilder<V>, keyof Companion<V>>` also picks up steps that do not start with `impl`,
  such as `fixed`. It follows the 5 exported builder pairs and does not read the Variant slot. Every step in the slot
  exists on another builder
- **Enum is read through a concrete type.** With `AnyEnum` the keys collapse to `string`. The lint side has one `Sample`
- **An exported type does not use the core's types.** Using one for `CompanionSite.root` made `dist/lint.d.mts` import the core's
  60 kB chunk. The match goes in a `satisfies` on a non-exported constant, and the exported type is written directly as
  `"sealer" | "companion"`. The JS never imported the core in the first place. Since lint no longer emits declarations, this constraint is gone (2026-11-07, §14.8)
- **The entry-point check only checks that the names exist.** A rename is a type error. Dropping a name from the lint's list is caught
  by the tests

Two things are not tied.

- The set `Fault` in `src/enum.ts` uses for Variant names. It partly overlaps `Reserved`, but it is a different set on purpose (§9)
- The type names the lint looks at (`Tag`, `VariantOf`). Type-only exports do not appear in `keyof typeof`

The root cause is that the lint fixtures are not type-checked. The fixes above go name by name, and whether to type-check the fixtures was
reopened in §9.

#### Remaining false positives and misses

- **Variant names when the builder is held in a variable.** `const b = Enum.sealer<Shape>(); const Shape = b.impl({ Square })`
  reports `Shape.Square`, because the scan records the site under `b` and the members under the name `Shape`. The types reject
  this member, and `companion-mismatch` fires at the same time
- **`implTrait` overrides.** Among the members an Enum overrides, those with the same name as a Variant are not reported.
  The overrides and the members go into the same array
- **A Trait's `.impl`.** Keys missing from the declaration and payload field names are rejected by the types but reported. They were left
  out of this change

#### Cost

Production gzip stays at 852 B. The lint chunk was not measured.

|               | main     | after    |
| ------------- | -------- | -------- |
| core          | 5,655    | 5,661    |
| trait         | 13,777   | 13,784   |
| enum          | 32,437   | 32,456   |
| `index.d.mts` | 58.77 kB | 58.90 kB |

### 15.1 `Trait`

Raised 2026-09-03; the shape was settled 2026-09-09. Targeted at v2, not v1.

**Public only through an experimental subpath** (dropped 2026-10-27; see "Removed experimental" below). Trait and its related types are not added to the root export.
They are exported only from `valof/experimental`. Users write
`import { Trait, type Dyn, type Final, type Self } from "valof/experimental"`.
This boundary is separate from the versioning policy that a 0.x minor release may break the API. It
distinguishes the stable API from Trait at the import site. Each public export also carries `@experimental`, which tells the IDE and
the generated docs that it is experimental. The tag does not stop TypeScript users from using it, though.

Implemented 2026-09-15. The entry is `src/experimental.ts`. It does not point at `src/trait.ts` directly but
re-exports only what is public, because `trait.ts` also holds internal types such as `Unbound` and `Shared`.

#### The shared-chunk condition of §14.6 does not apply to Trait

That section says to check the condition every time an entry is added. Checked: this entry does not trigger it.
`src/trait.ts` imports **only types** from `val.ts`, so `dist/experimental.mjs` is a self-contained 637 B
module, and no path exists that could duplicate the `owned` WeakSet. The measured bundles also match the sizes before the split
(`Val` 710 B, `Val` + `Trait` 804 B).

#### Rejected: a subpath per feature, such as `valof/experimental/trait`

The benefit: once more experiments arrive, an import line says which experiment it depends on. **Not split for now.**
The most likely motive for splitting, separating the cost of the declarations, does not hold.

`val.ts` imports 10 types from `trait.ts`, such as `AnyTrait` / `MembersOf` / `Unbound`
(for the third argument of `Val<K, T, Tr>`, and for `implTrait` on `Sealer` / `CompanionBuilder`). tsdown emits that shared part
as one chunk, so `dist/index.d.mts` and `dist/experimental.d.mts` **load the same `trait-*.d.mts`**.
A user who imports only `valof` already parses every trait declaration, however the subpaths are cut.
Only the 637 B at run time can be separated.

The cost, on the other hand, is certain. Each new subpath must be registered in 4 places: the entry in `vite.config.ts`,
the paths in `docs/tools/twoslash`, the paths in `scripts/ts-compatibility`, and `scripts/type-perf/tsconfig.base.json`.
Forgetting any one of them breaks docs or ts-compatibility.

**Split when `Enum` (§15.2) arrives.** Only then does the barrel stop saying which experiment an import relies on.
The name is singular, matching the type name (`valof/experimental/trait`). Since it is experimental, the move is not a breaking change.

#### 2026-10-27: removed experimental

**`valof/experimental` is removed, and Enum and Trait are exported from the root.** Every `@experimental` tag was removed too.
No compatibility re-export remains. A breaking change in v0.11.

- Reason: Val is not experimental, yet it keeps receiving breaking changes. A marker on Enum and Trait alone suggests that Val is
  stable. While the library is pre-1.0, it is enough to state strongly, for the library as a whole, that breaking changes may come
  (user, 2026-10-27). The pre-1.0 warnings in the README and the book now tell readers to read the release notes before upgrading
- Declaration cost: `val.ts` already imports the enum / trait types, so `import "valof"` already loaded both declarations
  (the same reason as "a subpath per feature" above). After the change, `index.d.ts` is 87.88 kB (budget 96 kB)
- Run time: with `sideEffects: false`, a bundle that imports only `Val` stays at 965 B. Its contents confirm that it includes neither `enum.js` nor
  `trait.js`
- The lint ignores where an import comes from (`src/lint/scan/bindings.ts` turns every non-relative specifier into `package:<source>`),
  so no rule changed

**What is missing.** There is no way to declare associated functions or fields that several Vals share. A companion's functions are
bound to their own Val, so `User.greet(superUser)` is rejected even when `SuperUser` is built from `PayloadOf<User>`.
To share one, the only option is a plain exported function over a structural type. That makes it the only thing in valof with
no place in the companion shape. It relies implicitly on TS structural subtyping, and nothing records what is shared.

Measured: annotating the first parameter with a wider type makes the check _pass_ even inside `.impl` (`greet(u: Named)` is assignable to
`(value: User) => unknown` by parameter contravariance). `User.greet(superUser)` compiles too.
The pattern is rejected anyway. It operates on one type through another type's companion, and loses contextual typing.

#### Shape

```ts
type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; toWire: (self: Self, sep: string) => string }
>;

// Default implementations. A member written here may be left out of implTrait
const Greetable = Trait.companion<Greetable>().impl({ greet: (g) => `Hi, ${g.name}` });

type User = Val<"User", { id: string; name: string }, Greetable>;

const User = Val.companion<User>().implTrait(Greetable, {
  toWire: (u, sep) => `${u.id}${sep}${u.name}`, // required, since it has no default
});

const Admin = Val.companion<Admin>().implTrait(Greetable, {
  toWire: (a, sep) => `admin${sep}${a.name}`,
  greet: (a) => `Sir ${a.name}`, // override
});
```

**One kind of member.** The trait's `.impl` supplies default implementations, and `implTrait` overrides any subset of them.
A member with a default may be left out of `implTrait`. Everything is registered on the companion, so `User.greet(u)` and the box's
`p.greet()` both always call that Val's implementation. Only members marked `Final` cannot be overridden.

**`Greetable.greet` does not exist.** A function that may be overridden does not appear in the trait's namespace. Only `Final`
members appear there, and those cannot be overridden.

#### Rejected: making `Trait` itself callable

The idea: `companion` is the only method, so `Trait<Greetable>()` could replace it.

**`Trait` is already a type name, with a different number of type arguments.** The same spelling would take a different argument list depending on where it appears.

```ts
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>; // 3
const Greetable = Trait<Greetable>(); // 1
```

`Val` is not callable to avoid exactly this: `Val<K, T>` and `Val.of<V>` are spelled differently.
The idea also loses the symmetry with `Val.companion<V>()`, and leaves no place for a second entry point if one is ever needed.

The trait/companion pair also makes sense semantically, and the reader can map it to Rust's `impl Trait for T`.

#### `Final`: a member that cannot be overridden

```ts
type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    shout: Final<(self: Self) => string>; // the trait implements it, and no Val can override it
  }
>;

const Greetable = Trait.companion<Greetable>().impl({
  greet: (g) => `Hi, ${g.name}`, // default; implTrait can override it
  shout: (g) => g.name.toUpperCase(), // Final; it cannot
});

Greetable.shout(user); // only finals appear in the namespace; it takes a Val or a box
User.shout(user); // a member, so it appears on the companion too
Greetable.dyn(User, user).shout(); // and on the box
```

**`Final<F>` is a marker on the declaration side.** It is a phantom, `F & { [FinalMark]: true }`, and disappears at run time.
The declaration decides which side implements a member and whether a Val can override it. One step that takes the implementations is enough.

**Not a union of strings.** `Trait<K, Shape, M, "shout">` could carry the same information, but the declaration would not show
which members are final, and the reader would have to trace the type signature. The marker sits next to the member.

##### Rejected: two steps, `implDefault` / `implFinal`

Since the marker disappears, the run time cannot split `impl({ greet, shout })`. Two places needed the split,
so at first the builder had two steps, and the split came from which one was called. Types cover both places.

The rule that **only finals appear in the namespace** can be kept by types alone. Make `TraitCompanion` `Pick<G, FinalsOf<Tr>>`,
and the defaults stay in the run-time object but cannot be reached through the type. Narrowing at run time actually costs more (it needs
code to narrow). What §15 rejected is a **typed** `Greetable.greet(u)`, and that does not appear.

**The layering order of `implTrait`** is also covered by types, but a hole had to be closed first. When `Implement` only
`Omit`s the finals, it rejects them **only through the excess property check on object literals**, and a variable
passes.

```ts
const carried = { toWire, shout }; // a variable, so the excess property check does not run
User.implTrait(Greetable, carried); // was accepted
```

Adding `Partial<Record<FinalsOf<Tr>, never>>` rejects it structurally (the same shape §6.10 chose with `seal?: never`;
`never` rather than a message string, because the optional modifier makes the error say `undefined`). With the hole closed, the run time can use
a plain merge, `{ ...traits, ...shared, ...impl }`.

With one step, the run time shrank by 11 B with `Trait` included (smaller than before the rename). The declarations also shrank by 630 B.
Making the implementing side write `Trait.final(fn)` duplicates the marker on the declaration, and costs more for the wrapping.

**`impl` can be called any number of times and stop anywhere,** because the builder doubles as the companion. Implementing the same member
twice is rejected.

**A final reaches callers through the same path as other members.** `implTrait` copies the trait's record into `__valof_traits`,
so `User.shout(u)` and the box's `p.shout()` both appear. The only purpose of `Final` is to forbid overriding.
Reducing paths is not part of that purpose. The name checks (field names, wired names, payload keys, other traits) apply
unchanged, as for any member.

##### Rejected: putting finals outside `M`

The idea: infer finals only from the functions passed to `impl`, without writing them in the trait's type. The first parameter needs no
annotation when declared in `M` either (a member is exactly that), so the idea saves only one line of the declaration. That saving does not justify the cost.

**They would not reach `Dyn<Tr>`.** `Dyn` is built from the trait's **type** alone. A function missing from the type does not appear on the box.
Widening only the return type of `dyn` to `Dyn<Tr> & …` loses it from the type as soon as the box goes into a `Dyn<Greetable>[]`, leaving it
only at run time. That breaks the very motive for the box.

**Implementing without a companion would stop working.** The `implTrait<Tr>({…})` below relies on reading "the trait implements
nothing itself" from the type. Outside `M`, the type cannot say so.

**The call paths would diverge.** `User.shout(u)` from a Val, `Greetable.shout(box)` from a box. Final or
default, it is a function of the trait, so it should be callable the same way. Not needing dynamic dispatch is no reason
to cut a path.

**The type machinery grows too.** Outside `M`, the return of `implTrait` needs an extra `& S`, and the checks for finals
(wired names, the trait's own keys) would have to be reimplemented. Inside `M`, `Unbound<MembersOf<Tr>, V>` and
`Declarable` apply unchanged. **It also needs two steps** (see the rejection above).

The candidate names were `final` / `derived` / `static`. `derived` collides with "derived" in `patch` / `update`.
`static` is the most accurate axis (members dispatch dynamically, these statically), but it brings in class vocabulary.
Confusion with `seal` is unlikely: `seal` is an operation on a value, and `final` describes a property of a function. With no inheritance,
Kotlin's `sealed` / `final` contrast does not carry over either.

The name moved to the marker on the declaration side. `.impl` now has the same spelling and meaning as on the Val side (it takes implementations),
so the trait side no longer needs a spelling of its own.

The `R` type argument was dropped. The `R` in `Sealer<V, T, R>` / `CompanionBuilder<…, T, R>` existed only to reserve the final names
from `.impl`. Finals now live in `T`, so `keyof T` is enough.

The trait companion buys two things: **contextual typing of the first parameter** (the same reason as §6.5; a plain function needs `(g: Greetable)`), and
**grouping under one namespace**. The run time actually shrank by 11 B (dropping to one step outweighs adding the marker and `__valof_shared`).
A user who imports only `Val` pays 3 B, for `implTrait` reading `__valof_shared`.

#### Removing the need for a companion: `implTrait<Tr>({…})`

→ Removed 2026-10-20 ("Removing the type-argument form" below). The rest records the state before the removal.

```ts
type Wired = Trait<"Wired", { id: string }, { toWire: (self: Self, sep: string) => string }>;
// no const Wired needed

const Row = Val.companion<Row>().implTrait<Wired>({ toWire: (r, sep) => `${r.id}${sep}${r.n}` });
```

**A trait that implements nothing itself needs no run-time value.** `implTrait` takes only two things from the companion,
`defaults` and `finals`, and when both are empty there is nothing to take. The type argument is enough. A contract-only trait
exists only as a type, and the `Trait` import disappears too.

**Rejected for a trait with `Final`.** Accepting it leaves a hole. `D` and `S` are both empty, so the type **requires** an implementation
of the final as well, and once written, `User.shout` becomes that function and disagrees with `Greetable.shout`. The marker lets
`[FinalsOf<Tr>] extends [never]` decide this, so the error can say "pass its companion". A trait with only defaults may
pass. The Val writes every member itself, so nothing is missing at run time (it just does not use the defaults).

**Every check carries over.** The declaration, shape and name-collision checks are factored out into `Takes<V, Tr, T, Ok>`, shared by both forms and
both entry points. The companion form puts it on the first argument, the type-argument form on its only argument. **Where the message appears,
the argument loses its contextual type**, so tests of the failing forms need annotations on the implementations.

**The run time adds only `?? trait`:** `{ ...traits, ...(trait.__valof_shared ?? trait), ...impl }`. Without a companion,
the object in the companion's position is merged in as it is.

##### Calls where `Tr` cannot be inferred, 2026-09-10

A one-argument call can go wrong in two ways, and both answered **"the type does not declare this trait"**.
It said "not declared" about a trait that was declared.

```ts
Val.companion<Member>().implTrait(Greetable); // forgot to pass the members
Val.companion<Row>().implTrait({ toWire }); // forgot the type argument
```

`Tr` is inferred through a conditional type. Inference works **only when a branch names `Tr` structurally**. The companion form's
`TraitCompanion<Tr, G>` does, but the type-argument form's `Implement<Tr, …>` is a mapped type over `MembersOf<Tr>`
and infers nothing. Both calls above fall to the type-argument form (the one-argument overload), and `Tr` stays at its constraint,
`AnyTrait`. `NamesOf<AnyTrait>` is `string`, so `[string] extends [TraitsOf<V>]` failed and the
declaration check's message appeared.

`Takes` now starts with `string extends NamesOf<Tr>`, which catches first that `Tr` could not be inferred.
The message names both mistakes: "pass the members this trait leaves open, or name the trait as the type
argument". The overloads did not change. With one argument, the companion form drops out by arity, so the chosen
overload cannot be moved.

**The test pins the message.** `@ts-expect-error` alone is not enough. Before the fix, **an error already appeared** (only its text
differed), so the directive would stay green. The message is the parameter's type itself, so a line that passes that string
pins it.

```ts
const unnamed = "pass the members this trait leaves open, or name the trait as the type argument";
Val.companion<Member>().implTrait(unnamed); // fails here if the message changes
```

Declarations went 31.0 → 31.4 kB, trait instantiations 12,449 → 12,514. The budget then was 32 kB, leaving 2%.
Comments were trimmed twice here. §16 records fixing the budget instead.

**The cost.** The overloads double at each of the two entry points. The declarations grew 2.1 kB from before the rename, to 29.6 kB
(8% left of the 32 kB budget), and trait instantiations went 9,632 → 11,933. The run time does not grow.

#### Removing the type-argument form, 2026-10-20

`implTrait<Tr>({…})` is removed. A trait is implemented only by passing its companion, `implTrait(Tr, {…})`. A trait that implements nothing itself also needs the one line `const Wired = Trait.companion<Wired>();`. A breaking change in v0.10.

- **The type-argument form cannot reject an optional argument through types (§6.11).** With `Tr` written by hand, partial inference does not work, so the implementation cannot be received as a type argument. The implementation is checked as an assignment to the declared type, and a function with a default argument is assignable. A data-last call silently runs as data-first
- **Matching the argument types cannot reject it either.** A function taking an optional argument is assignable to a function type taking a required argument (probed with TS 7.0.2)
- **The companion form does reject it.** Even for a trait that implements nothing itself, `Trait.companion<Tr>()` is a companion. `implTrait(Sized, { toWire: (w, sep = "/") => … })` fails with TS2322 (probed)
- **One way to write it.** No need to pick a form by whether a companion exists. The message from "Calls where `Tr` cannot be inferred" above ("…or name the trait as the type argument") is no longer needed either
- **The cost.** A contract-only trait also needs a run-time value and the `Trait` import. This is what "Removing the need for a companion" above bought
- **Rejected: a two-step `implTrait<Tr>()({…})`.** The second step can infer the implementation, but two ways to write it remain

#### Rejected: putting overridable functions in the namespace

The original idea put "whatever can be computed from the shape alone" on the trait side and made it non-overridable. Most other languages
allow overriding as a matter of course, and the only reason to forbid it was implementation convenience.

Allowing it makes `Greetable.greet(u)` answer with the default and `User.greet(u)` with the override. The trait's namespace has
no way to dispatch, which is exactly the problem §7.6 hit when it rejected "equals from parent to child".

**Rejected: closing it with valof-lint.** When the `x` in `Greetable.greet(x)` is a concrete Val, the lint can follow its type, but
not for `Dyn<Greetable>`. Dropping the concrete type is the whole job of `dyn`, so it cannot be followed in principle, and the hole remains.

Anything that may be overridden is called through the companion. Only members marked `Final` appear in the trait's namespace.
**Whether a member appears in the trait's namespace matches whether it can be overridden.**

#### `impl` takes a callback form whose argument holds only the finals, 2026-09-18

**Adopted.** A trait member calling another member of the same trait is common. The object form alone hits three
separate errors.

```ts
const Named = Trait.companion<Named>()
  .impl({ shout: (s) => `${s.name}!` })
  .impl({ greet: (s) => Named.shout(s) });
```

1. **TS7022.** `Named` is read inside its own initializer. The same as §15.4
2. **Adding an annotation gives TS2339.** A non-final has no name on the companion (the "Rejected: putting overridable functions in the
   namespace" above)
3. **Even a final gives TS2345.** A final exposed on the companion takes `Tr`, but a shared member receives `ShapeOf<Tr>`

Making the callback's argument **the finals implemented so far, bound on the shape side** removes all three.

```ts
impl: <H extends Shared<Tr, keyof G, H>>(fns: H | ((self: Finals<Tr, G>) => H)) =>
  TraitBuilder<Tr, G & H>;

type Finals<Tr extends AnyTrait, G> = Unbound<
  Pick<MembersOf<Tr>, FinalsOf<Tr> & keyof G>,
  ShapeOf<Tr>
>;
```

**Contextual typing survives.** In `base.impl((self) => ({ greet: (s) => self.shout(s) }))`, `s` resolved to
`ShapeOf<Named>` (read out of TS2322). Neither the self-referencing constraint `H extends Shared<Tr, keyof G, H>` nor
the union `H | ((self) => H)` affects it. The measurement in §15.4 holds for the trait form too.

**Non-finals drop out with no rule written for them.** Once `greet` is implemented, `Finals` is `Pick<…, never>`, which is empty.
The type enforces the rejection above (a namespace that looks as if it dispatches) on its own.

At run time, `build` just passes `impls` to the callback. `make` already holds that object, so no laziness or proxy is
needed, and `implTrait` in val.ts does not change. The cost: production gzip 946 B → 959 B (**13 B**, paid only by users who import
`Trait`), trait instantiations 13,356 → 13,378.

#### Rejected: making the argument the implementing companion

The callback form does not cover Rust's default method calling a required method, that is, a shared member calling a member the trait
left open. That would need the implementing side's companion.

**Rejected.** It reverses the direction of the dependency a trait creates (the Val knows the trait, and the trait does not know the Val). Types cannot express it either.
Write such a member on the Val side, not in the trait.

**A static self is wrong as well.** It would call the trait's own implementation instead of the override. Since `implTrait` allows
non-finals to be overridden, that is a bug. Finals cannot be overridden, so calling them statically is correct.

#### Name collisions are forbidden by types

The prototype lacked the check, and one name had three answers (the version of the rejected idea above). Even after collapsing to one kind of member,
a hole remained: the companion's `.impl` could overwrite what `implTrait` registered.

```ts
Val.companion<User>()
  .implTrait(Greetable, { toWire })
  .impl({ toWire: ... }); // error: something already answers to this name
```

The check must sit **in the argument's type, not in a constraint**. In a constraint, `M & T` stops satisfying `CompanionFns<V>`,
and `equals` breaks.

Two traits bringing members of the same name into one Val are also forbidden. The record is flat, so nobody could tell
which implementation got registered.

**Names the library wires are forbidden too.** Implementing a trait with a member named `equals` let `attach`'s
registration overwrite the wired structural comparison, and `Box.equals(b, b)` returned `false`. On `.impl`, `CompanionFns` rejects
these 5 (`equals` / `patch` / `update` / `seal` / `create`), but the trait path let them through.
The same holds for `__valof_traits`, which holds the record.

**`dyn` is forbidden in the declaration.** Steps carry the `impl` prefix and wiring lives under `__valof_`, so `dyn` is the only name left.
Every implementation is spread into the trait namespace, so any member could overwrite it. The check lives in `Declarable`, because forbidding it as a member
name across the board makes a shorter rule than a check that looks only at finals.

**What a trait registers takes no member names.** At first it published two keys, `defaults` / `finals`, and
five names were forbidden. Those were only wiring that `implTrait` reads, so they are hidden in a single `__valof_shared`.
Fewer names are forbidden, and the `Greetable.defaults.greet(u)` hole closes too. **That hole was exactly the idea §15 rejected**: the
namespace answered with the default. `Declarable` now rejects every name starting with `__valof_` at once, so
`__valof_traits` could be removed from `Wired`. Adding internal keys adds no checks.

**The trait list written in the type is the source of truth.** `implTrait` checks not only that the payload satisfies the shape but also that the Val
declares the trait. A version that skipped this let a Val implement a trait it did not declare, producing a mismatch:
`Floor.scaled` appeared, yet `Floor` was not assignable to `Sized`. Together with valof-lint's rule for a missing
`implTrait`, the correspondence between declaration and implementation closes in both directions.

Read the declaration with a conditional type, not an index. Intersecting a bare Val with `AnyTrait` and indexing a key returns `string`,
and every trait looks declared.

**Field names are part of the namespace too.** A member cannot take the name of a field in that Val's payload. The box
forwards non-member keys to the value, so a member shadowing a field collides with the dev freeze and fails with
`TypeError: 'get' on proxy: property 'greet' is a read-only and non-configurable data property`.
Production does not freeze, so the member silently wins. `Trait.companion` rejects the fields of the trait's own shape,
and `implTrait` rejects the fields of the Val's payload.

Several traits requiring **a field of the same name** is fine. One payload just has to satisfy both, and the second `implTrait` rejects
a combination no payload can satisfy (`name: string` and `name: number`). The same goes when one is wider
(`string` and `string | null`): it fails on whichever the payload does not satisfy.

**The only place a box does not stand in for its value** is `JSON.stringify` on a primitive payload. The target is `{}`,
so it gives `"{}"`. A box over an object gives the same JSON as the value, and `Object.keys` returns the value's keys too.

#### Brands take a form that intersects

```ts
{ readonly __valof_internal_phantom_trait_brands: { Greetable: true } }
```

Several traits compose by intersection, and the structural subtyping that assigns `User` to `Greetable` works as is. **Rejected: an array**
(`["Greetable"]`). The order would carry meaning, and arrays do not compose by intersection.

##### Keeping brands out of spreads, 2026-09-15

The type of `{ ...user }` still had the brand key. `Val`'s brand is a private member of `declare class Phantom`,
so it appears in neither `keyof` nor a spread. The trait brand now takes the same form.

```ts
declare class TraitPhantom<B> {
  private readonly __valof_internal_phantom_trait_brands: B;
  protected readonly __valof_internal_phantom_trait_types: B;
}
```

A private member is nominal per declaration, so assignability requires "sharing the same single declaration". Both traits and Vals
intersect `TraitPhantom`, so the structural subtyping that makes `User` assignable to `Greetable` still works. The brand maps of
intersected traits still intersect, as before. The protected line is there for the same reason as in `Phantom` (§10.1): declaration emit
erases private types, so without it `BrandsOf` cannot be read after emit.

The brands are now read through a conditional type instead of an index. A private key cannot be read with `Tr["__valof_internal_phantom_trait_brands"]`.
`BrandsOf` lost its constraint. A broken declaration does not satisfy `AnyTrait`, so with the constraint, tests could not read the brand's
`Invalid`. `ShapeOf` became `Pick<Tr, keyof Tr>`. Private members are not in `keyof`, so no name is left for `Omit`
to remove.

Trait instantiations went 12,727 → 13,341 (11% left of the 15,000 budget), declarations 30.43 → 30.85 kB.
The increase comes from `BrandsOf` moving from an index to a conditional type, which `NamesOf`, `MembersOf` and `TraitsOf` all go through.
The message for an `AnyTrait` constraint violation still shows the property name (§11.2).

##### `|` is rejected from the type argument alone, 2026-09-10

A declaration that wrote `|` where `&` was meant **passed the payload check**. `ShapeOf<Tr>` is
`Omit<Tr, brands>`, so on a union only the keys the two share remain. With no shared key,
the shape is empty, and a payload satisfying neither shape passes.

```ts
type Empty = Val<"Empty", { id: string }, Greetable | Weighed>; // was accepted, with neither `name` nor `kg`
```

The failure appeared only at the first `implTrait`, and it said "the type does not declare this trait". It said "not declared"
about a trait written in the declaration. This is exactly the misplacement §11 describes. The check reads only the type argument,
so the brand position (B) is the right place.

`Fits` becomes `true | message`, and rejects a union before reading any field. The test is
`[Tr] extends [UnionToIntersection<Tr>]`. A union collapses to an intersection through function parameter contravariance,
so whatever differs from its collapsed form is a union. A single trait, an intersection and `never` all collapse to themselves.

Declarations went 30.7 → 31.1 kB (3% left of the 32 kB budget), trait instantiations 12,150 → 12,404.

**"In the declaration" describes where the check reads, not the line where the error appears.** Measured 2026-09-15.
The type alias `type Bad = Val<"Bad", P, A | B>` itself passes. It fails at the first place that requires `AnyVal`:
`Val.sealer<Bad>()` gives TS2739. And the message is about a property missing from `Phantom`, so
"declare several traits with `&`, not `|`", placed in the brand, is visible only on hover.
The docs said "the declaration rejects it", which was wrong, so that part was cut to one sentence.
The branch for `Tr` being `never` comes first, so a Val that declares no trait pays nothing (core stays at 5,846).
It is type-only, so the run time does not grow.

##### Rejected: declaring with a tuple

`Val<"Both", { name: string }, [Greetable, Sized]>`. The idea: nobody could mix up `&` and `|`.

**The intersection is not a spelling but the core of the mechanism.** `Dyn`, `ShapeOf<Tr>` and the payload check all rely on
"the Val is assignable to `Greetable`". Accepting a tuple would still mean folding it into `Greetable & Sized` on the first line of `Val`,
only rewrapping the very thing the tuple hid. The reason for rejecting the array above applies as is (the order carries meaning, and it does not
compose by intersection).

**The cost does not pay off.** `Val` is the most instantiated type in the library, and a recursive fold would sit
on it. Keeping the existing `Val<K, T, Greetable>` would need a branch too. Only 3% of the declaration budget is left.

**It does not close the hole either.** `[Greetable | Sized]` can be written. Rejecting unions names the same mistake
directly, with a narrower check.

#### `Self`

A trait member must be able to refer to its own Val. Making `Self` a type that references the trait would be circular, so
it is **an opaque marker that does not reference the trait**, and `implTrait` substitutes it.

```ts
declare const SelfMark: unique symbol;
type Self = { readonly [SelfMark]: true };

type SubstArgs<A extends readonly unknown[], S> = {
  [K in keyof A]: [A[K]] extends [Self] ? S : A[K];
};
```

Confirmed with a probe (`tsc --ignoreConfig --noEmit --strict`).

- `(self: Self, n: string) => string` resolves to `(self: User, n: string) => string`
- Contextual typing works on `implTrait`'s second argument. Without annotations, `u` in `(u, sep) => ...` is `User` and `sep` is
  `string`, and a wrong return value is reported at that position. **This removes the question of where to write the signatures**
- The argument list needs its own `SubstArgs`. Writing `{ [K in keyof A]: ... }` inline in the function type gives
  TS2370 (rest parameter must be of an array type)
- `AnyVal` is a leaf where the walk stops. Walking into it turns a nested Val such as `Money` into an anonymous object with its intersection collapsed,
  which stays assignable but makes the type display unreadable

#### Rejected: `Self` in the return type

The same restriction as Rust's object safety. The things that want to return `Self` are `seal` / `create` and per-type constructors,
and those are not trait members. If a field is really needed, add a common function to the trait that extracts it from the shape.

Allowing it makes the `dyn` box refer to itself, and the type-alias intersection gives TS2456. An interface that puts the members
under `.fns` passes (`interface Dyn<S, M> { readonly value: S; readonly fns: Bound<M, Dyn<S, M>> }`),
but calls become `p.fns.toWire()`. `interface Dyn extends Bound<...>` fails with TS2312, because a mapped type's
members are not statically known. **No visible demand justifies paying for that extra level.**

Types can express the check. When `HasSelf<R>` is true, the type becomes a string literal. This catches both `(self: Self) => Self` and
`(self: Self) => readonly [Self, number]`.

##### Capping the search depth, 2026-11-03

When a return type has a member that returns its own type (`Promise.then`, `type Chain = { next: () => Chain }`),
the recursion in `HasSelf` came back to itself and gave TS2615. A trait with an async member could not be declared.

**Count the depth and stop at 5 levels.** The return type itself is level 1, so `Self` is caught up to 4 levels of nesting.
That reaches `Promise<{ items: Array<{ owner: Self }> }>`. A deeper `Self` is missed (test
"the search for Self stops after four nested types").

The cap was chosen by measurement. The cost per level grows with the number of members in the type (instantiations above a baseline of 34,289,
TypeScript 7.0.2).

| Return type           | cap 3  | cap 4  | cap 5  | cap 6  | cap 8   |
| --------------------- | ------ | ------ | ------ | ------ | ------- |
| `Promise<string>`     | +463   | +638   | +768   | +880   | +1,126  |
| `Map<string, number>` | +1,135 | +3,846 | +5,667 | +8,168 | +12,147 |
| `Chain`               | +112   | +138   | +179   | +203   | +272    |

The check runs once per trait declaration, so about 2,000 per level for `Map` is affordable. Cap 4 does not reach the `Promise`
example above. The trait fixture costs +19 (17,639 → 17,658), and `index.d.ts` +0.18 kB.

**A `PromiseLike` is unwrapped and followed (counted as one level).** In `Promise<Self>`, `Self` appears only in the arguments of `then`,
and arguments are not followed, so the cap alone would let it through. Until then, TS2615 rejected it by accident.

#### `Self` only as the first parameter, 2026-11-03

`Self` may no longer appear in any parameter but the first. Until then, `SubstArgs` replaced a parameter of exactly `Self` with the Val,
and on a `dyn` box that became the trait's type. A different Val could be passed, and the wrapped Val's implementation
received it (the §9 item).

```ts
type Same = Trait<"Same", { n: number }, { same: (self: Self, other: Self) => boolean }>;
Same.dyn(A, a).same(b); // was accepted; A's implementation receives B
```

- **The check lives in `Declarable`.** It walks each parameter after the first with `HasSelf`. A `Self` inside an array or object is
  rejected too (`readonly Self[]` already stayed `Self`, so no value could be passed). As with the return type, it is reported
  where the trait is used (such as `Trait.companion<Same>()`)
- **`SubstArgs` is removed.** No parameter is left to replace. `Bound` no longer uses its type argument `S`, so it was dropped
- **Write other parameters with `Payload<{ n: number }>`.** A plain object passes, and so does another Val with the shape
- **`HasSelf` also follows function parameters.** It rejects `(self: Self, f: (others: readonly Self[]) => void) => void` and,
  in a return type, `(self: Self) => (other: Self) => void`. Before, these passed the declaration, and the implementation failed to type-check at `f(u)` (a Val is
  not assignable to `Self`), so the member could not be written
- **`any` is not `Self`.** Following parameters reaches `thisArg?: any` in `Map.forEach`, where `[any] extends [Self]` is true,
  and members returning `Map` were rejected. `HasSelfBranch` excludes `any` first. A member returning `any` used to be
  rejected by accident with "cannot return Self"; it now passes
- **Unwrapping `PromiseLike` stays.** Following the argument of `then`'s callback does reach `T`, but 2 levels deeper than the unwrapped
  `T`. Without unwrapping, `Promise<{ a: [{ b: Self }] }>` hits the cap and passes (probed)
- **The cost.** Instantiations: trait fixture 17,658 → 16,777, enum 35,703 → 34,918 (TypeScript 5.9.3).
  They dropped because the `SubstArgs` mapped type was removed. `index.d.ts` +0.39 kB. Following function parameters costs more
  for members returning a type with many methods. The increase relative to a trait returning `string` (TypeScript 7.0.2):

  | Return type           | Parameters not followed | Followed |
  | --------------------- | ----------------------- | -------- |
  | `string`              | 0                       | +17      |
  | `Promise<string>`     | +322                    | +324     |
  | `Map<string, number>` | +5,301                  | +9,502   |

  The check runs once per trait declaration, so this is affordable

##### ~~Reporting a member parameter's `Payload` through the trait, 2026-11-04~~ → removed, 2026-11-04

- **Why it was removed.** `Payload` now reports through its type argument (§9 "Where it reports", #123). A `Payload<…>` that breaks the rules
  gives TS2344 on its own line, even inside a trait member. An `Invalid` reaches the trait only when that
  error is suppressed with `@ts-ignore`, and no test can confirm it. `Found` reverted to `HasSelf`.
  Instantiations: trait fixture 17,964 → 17,083, enum 36,018 → 35,233 (against main, TypeScript 5.9.3)

The rest records the state while it was in.

`Payload` checks its argument against the payload rules (§9 "Add the payload rule checks to `Payload`"). A part that breaks the rules
becomes `Invalid<M>`. Written in a trait member's parameter, it alone passed both the trait's companion and `implTrait`, and
the call's argument failed with `'() => void' is not assignable to type 'Invalid<"functions are not allowed">'`.

- **It reuses the search for `Self`.** `HasSelf` was replaced by `Found`. Instead of a boolean, it returns the union of what it found (`Self` or
  `Invalid<M>`). `Declarable` returns the `Self` message if a parameter holds `Self`, the return-type message if the return type holds `Self`,
  and otherwise the `Invalid<M>` if there is one. It is reported at `Trait.companion<Same>()` and at the Val that declares the trait.
  The last line is `Type 'Invalid<"functions are not allowed">' …` under `Property 'same' is incompatible…`, where the rule's
  message is readable
- **It looks only at the `Invalid` that `Payload` left.** It does not check against the rules itself. A bare parameter such as
  `job: { f: () => void }` is not a payload, so it is legitimate
- **The mapped type got `-?`.** With a boolean, `true extends …` was unaffected by `undefined`, but once it returned a union,
  an optional parameter (`thisArg?` in `Map.forEach`) mixed in `undefined`, and members returning `Map` were rejected
- **Detection is written as `Invalid<infer M>`,** not with the key directly. When #122 changed `Invalid`'s key to a symbol, it kept working
- **The cost.** Trait fixture 16,786 → 16,819, enum 34,945 → 34,959 (TypeScript 5.9.3). In a probe (7.0.2),
  a member returning `string` +48, a member returning `Map` +991, a parameter `Payload<{ n; tags: string[]; at: { x } }>` +100

#### `Impl`: the type of a value implementing a trait, 2026-11-04

The trait declaration is now separate from the value type. `Trait<K, S, M>` holds only the declaration, and the value type is written `Impl<Tr>`.
An `Impl<Same>` in a member's later parameter accepts only Vals that declare the trait, and `Dyn`. The previous `Payload` also accepted
plain values with the same shape (the §9 item). Breaking: writing `Same` as a value type is a type error.

```ts
type Same = Trait<"Same", { n: number }, { same: (self: Self, other: Impl<Same>) => boolean }>;
const s: Impl<Same> = meter; // a Val declaring Same, or a Dyn of Same
```

- **`type Trait<K, S, M> = TraitDeclaration<{ brands; shape; verdict }>`.** `TraitDeclaration` is a class with a single protected
  key. `brands` is a record from name to members (the raw members), `shape` is the shape, and `verdict` is a record from name to the
  checked members. The check runs where the trait is used
  - ~~make it an interface~~ → made it a type alias (the user's instruction, 2026-11-04). An alias does not become circular either, and hovers and
    errors show the name, `Trait<"Same", …>` (probed). There was no reason to make it an interface
- **The check lives in `verdict`.** Its content is the expression that used to sit in the brand position. `AnyTrait` requires `verdict` to be a
  record of `Members & Unrejected`, so the reporting position does not change. `brands` holds the raw members so that `Impl<Same>` reading
  `brands` does not run the check
- **The key's name is the message.** Writing `Same` as a value type gives "Property '"a trait is only a declaration; type a value
  implementing it with `Impl<Trait>`"' is missing". When the keys were 3 symbols, the error only listed
  `[DeclaredBrands], [DeclaredShape], [DeclaredVerdict]` and did not point to `Impl`. The key is protected, so it
  appears in neither `keyof` nor a spread
- **A union is rejected through the type argument, 2026-11-04 (the user's instruction).** `Impl<Tr extends OneTrait<Tr>>`,
  `OneTrait<Tr> = AnyTrait & Single<Tr>`. `Single` is a mapped type that has one key only for a union, and the key's name is
  the message ("a union of traits is not a trait; write `Impl<A> | Impl<B>` for a value implementing either").
  A value implementing either is written `Impl<A> | Impl<B>`. Without the check, a Val declaring only `A` was assignable to
  `Impl<A | B>`
  - **Type arguments that pass `Impl` along get the same constraint:** `Dyn`, `TraitCompanion`, `Shared`, the `TraitBuilder` steps,
    `Trait.companion`, `implTrait` on Val and Enum, and `Complete`. With `Tr extends AnyTrait` alone, `Impl<Tr>` does not satisfy the
    constraint. Using an unchecked alias internally (`Implementing`) put a name that is not exported into the hovers of `dyn` and of the
    `.impl()` callback
  - Making `Single` a conditional type (`… ? unknown : { … }`) does not let a generic `Tr` satisfy it either (probed)
  - With an intersection as the constraint, `MembersOf<Tr>`'s constraint cannot be read, and it does not satisfy `M extends Members` in `Unbound` / `Bound`.
    Both only read it through a conditional type, so their constraints were removed
- **`Impl<Tr> = ShapeOf<Tr> & TraitPhantom<BrandsOf<Tr>>`.** The same class as the brand a Val carries. It is a value type,
  not a marker, so `Unbound` / `Bound` replace nothing. It works as is inside arrays, callbacks, return types and other traits.
  In the `.impl()` callback, `other` also shows as `Impl<Same>`
- **Combine with `Impl<A & B>`.** An intersection of traits becomes an intersection of the per-name records. It and `Impl<A> & Impl<B>` are
  assignable to each other. The docs write it with `&`, the same as Val's third argument
- **The shape is passed as declared.** `FieldsOf` reads S as is. Val's `Holding` and Enum's `FieldsIn` /
  `SharedIn` intersect it instead of stripping readonly with `Writable<ShapeOf<…>>`. `Writable` is removed.
  `ShapeOf` (used by `Impl` and `Fits`) is `DeepReadonly<FieldsOf<Tr>>`, without `Checked`. V has already checked the shape
  against the rules
- **The cost** (TypeScript 5.9.3, against the state before the change)
  - The straightforward version: trait 17,083 → 20,771, enum 35,233 → 46,908. Dropping `Checked` from `ShapeOf` gave
    18,812 / 39,910, using `FieldsOf` gave 18,568 / 35,237, and dropping Enum's `Writable` too gave enum 34,454
  - Adding a Final member taking `Impl<Named>` and two calls to the trait fixture: 19,387. Core 7,488 → 7,496
  - `index.d.ts` 89.54 → 90.80 kB
  - The union check and merging the keys: trait 19,387 → 20,426, enum 34,454 → 34,916, core 7,496 → 7,473,
    `index.d.ts` 90.80 → 91.07 kB. `Single` is evaluated for every `implTrait`
- **Rejected: making `Impl` a marker interface that `Unbound` / `Bound` replace with the trait.** It is not circular in member parameters,
  but `let s: Impl<Same>` stays a marker and does not become the same type as `Same`
  (`interface Impl<Tr> extends Tr` is TS2312)
- **Rejected: writing `other: Same` directly.** Moving the members into an interface, or wrapping them in `Rec<Same>`, still gives TS2615 in
  `Declarable`. Passing `Same` to a conditional type while it is being declared demands that it resolve
- **`Dyn` and `Trait.companion` take exactly one trait, 2026-11-04 (agreed with the user).** `LoneTrait<Tr> =
OneTrait<Tr> & Lone<Tr>`. `Lone` is a mapped type that has one key only when there is not exactly one name, and the key's name is the message
  ("`Dyn` and `Trait.companion` take one trait; write one for each trait"). `Impl` stays on `OneTrait`, so
  `Impl<A & B>` can be written
  - **`Dyn<A & B>` was broken.** Its set of members became a union, and both `greet` and `heavy` reported "property does not exist"
    (probed). Fields could be read. `Trait.companion<A & B>()` implements a single trait, so it has no meaning
  - **`Impl<A & B>` stays.** It is written the same way as Val's third argument, and corresponds to Rust's `impl A + B`.
    It is the same type as `Impl<A> & Impl<B>`, so it does no harm. Requiring unions alone to be written outside `Impl` also matches Rust, which has no unions
  - `implTrait`, the builder steps and `Complete` also take `LoneTrait`, because they pass `TraitCompanion<Tr>` along
  - **The cost.** Trait 20,426 → 20,659, enum 34,916 → 35,094, `index.d.ts` 91.07 → 91.54 kB
- **Traits and `Impl` in payload fields, 2026-11-04.** Closed two regressions introduced by making the trait a declaration-only type
  - **A field typed with a trait accepted anything.** `seal({ g: {} })` passed on `Val<"V", { g: Greetable }>`.
    The declaration type has only a protected key, so the payload rules see an empty object. Before the change, `Greetable` was a value type,
    and a value without the brand was rejected. `Validate` now rejects `AnyTrait` with "a trait is only a declaration; type a value
    implementing it with `Impl<Trait>`". This works in the type arguments of `Val` and `Payload`, in a trait's shape, and in an Enum variant
    (reported on the companion)
  - **A field typed with `Impl` accepted boxes and plain objects.** `DeepReadonly` remapped `Impl` by its keys and
    dropped the brand. The value read back was `{ readonly name: string }` too, so `Greetable.shout(d.owner)` was rejected.
    `DeepReadonlyValue` now maps `Impl` to `Impl<…> & AnyVal`. A box lacks the Val marker, so it does not fit ("a payload
    cannot hold a box")
  - **The cost.** Core 7,473 → 7,640, trait 20,659 → 20,923, enum 35,094 → 35,574, `index.d.ts` 91.54 → 91.88 kB
  - **A union of `Impl`s can be written in a field.** `{ item: Impl<A> | Impl<B> }` was rejected by the rule for unions of objects.
    A union of Vals (`{ a: U | W }`) passes, and the `Impl` error message itself points to `Impl<A> | Impl<B>`. `Validate`
    stops at `AnyImpl` and checks only the fields of each union member. Stopping at `AnyImpl` as a whole would let `Dyn` fields
    through too (`Dyn` includes `Impl`). Checking the fields rejects a box with "functions are not allowed", since its members are functions.
    Core 7,640 → 7,713, trait 20,923 → 20,999, enum 35,574 → 35,752
  - **An `Impl` at the root of a payload is rejected:** `Val<"V", Impl<A>>` (its seal accepted another Val), `{ id } & Impl<A>`,
    `Payload<Impl<A>>`, and Enum shared fields and variant payloads. `Validate` turns a root `AnyImpl` into
    "a payload cannot be an `Impl`; write its fields, and declare the trait instead"
    - **`DeepReadonly` adds only `Phantom` to `Impl`.** Adding `AnyVal` (which includes `Verdict<true>`) made the value type's
      verdict intersect with `true` at the root and cancel out, so an `Impl` in a variant payload passed the companion
    - **Enum's `SharedIn` keeps `Impl` whole.** `Pick` dropped the brand, and the payload rules did not see `Impl`
    - **A trait's shape gets a different message through the verdict:** "a trait's shape cannot be an `Impl`; write its fields". The payload
      message's "Val's third argument" does not apply to a trait
    - Cost: trait 20,999 → 21,003, enum 35,752 → 35,785, `index.d.ts` 91.97 → 92.25 kB
  - `{ a: Impl<A> | null }` is still rejected. `{ a: U | null }` is also rejected with "not a plain value", an existing rule
  - Older holes (a trait intersected into a Val's payload, a union of names, a union of member sets) are in "Holes in trait declarations" below
- **Holes in trait declarations, 2026-11-04.** Closed older holes found while investigating #125
  - **A name is one string literal.** `Trait<"A" | "B", …>` passed both Val's third argument and `Impl`, and
    only `Trait.companion` rejected it, with `Lone`'s off-target message ("take one trait"). `Trait<string, …>` even
    passed `Trait.companion` (though `implTrait` could not implement it). The whole verdict becomes "a trait's name must be one
    string literal". The test is `IsUnion<K>` plus whether `{}` is assignable to `Record<K, unknown>` (`string` and
    template literals become index signatures, which `{}` satisfies). `never` and `any` are rejected by the same test.
    No check looks at `never` alone (the user's question, 2026-11-05)
    - The value type is `never`. With `unknown`, it hit things `{}` appears to have, such as `toString`, and `Trait<"toString", …>` was
      rejected. An empty string `""` is allowed as a name (user, 2026-11-05)
    - The test is collected in `IsOneLiteral` (`src/val.ts`), which Val brands, enum names and tag names also use
    - **It is also reported on the declaration line.** The name type parameter's constraint is `OneLiteral<K, Msg>`. It is
      `string` for one string literal and `Msg` otherwise, so the `Trait<"A" | "B", …>` line shows "does not satisfy the constraint
      '"a trait's name must be one string literal"'". Passing `K` to the conditional type as is makes the constraint circular (TS2313),
      so it is read through `[K] extends [infer X extends string]`. `any` and `never` satisfy every constraint, so the verdict check
      stays
      - The price: `type Named<K extends string> = Val<K, string>`, with the name as a type parameter, can no longer be written. The conditional type
        stays deferred, and it cannot show that `K` satisfies the constraint. Vals with the same shape and different brands can share
        the shape through `Payload` instead (user, 2026-11-05). This also closes the hole where the lint's duplicate-brand rule could not see a brand
        passed through `type Branded<K, T> = Val<K, T>` (§14.7 "Out of reach"), since such a helper can no longer be written
      - Every declaration check moves to the declaration line (user, 2026-11-05). The shape is constrained by `DeclarableShape` (`Impl`, traits,
        payload rules), and the members by `Members & OneMembers<M, Shape>` (union, `Declarable`). An alias whose members contain a type
        parameter (`Record<K, …>`) can no longer be written either
      - **Policy: as a rule, declarations cannot be shared through type parameters** (user, 2026-11-05).
        With the declaration checks in constraints, an alias containing a type parameter leaves the conditional type deferred and cannot satisfy the constraint. This is
        accepted as the price. A common shape is shared through `Payload`. Val traits (#127) and enum names and shared fields (#128)
        get the same treatment
      - A trait whose shape is `any` or `never` is rejected only by the verdict. It used to be rejected with the `Impl` message, so "a trait's
        shape cannot be `any` or `never`; write its fields" was added
  - **The member set cannot be a union.** With `{ f } | { g }`, `Declarable` distributed and passed, an empty `implTrait`
    passed, and neither `f` nor `g` appeared on the companion. The verdict becomes "a trait's members must be one object type, not
    a union"
  - **For a trait intersected into a payload, the message points to the third argument.** Since #125, `Val<"V", { a: string } & A>` was rejected with "a trait is only a
    declaration; type a value implementing it with `Impl<Trait>`", but that message was meant for fields. An enum variant
    declares a trait by intersecting it into the payload, so some users will write the same thing. At the root, `Validate`
    says "a payload cannot declare a trait; pass it as Val's third type argument". Below the root, the field
    message stays
    - At the root of `Payload`, the message is only "a payload cannot declare a trait", without the pointer (user, 2026-11-05).
      `Validate` and `Allowed` receive which side declares the payload (`"Val" | "Payload"`)
    - When a trait's shape is a trait, the verdict says "a trait's shape cannot be a trait; write its fields". The root
      message's "Val's third argument" does not apply to a trait (the same reason as for the `Impl` shape)
  - **The shape of a variant's trait could take the tag name.** `{ A: { x } & Trait<"M", { _tag: number }> }` passed the declaration, and
    `create` required `_tag: number`. `Fault` looked at `keyof D[N]` and could not see the keys of the trait's shape.
    It now uses `keyof FieldsIn<D[N]>`. A trait in the enum's third argument was already rejected through `SharedIn`
  - **The cost.** Trait 21,003 → 21,125, enum 35,785 → 35,888, core 7,713 → 7,743, `index.d.ts` 92.23 → 92.93 kB
    (TypeScript 5.9.3). Mostly the messages
- **The name stays `Impl`.** It is close to the builder's `.impl()`, but Rust also uses the same
  keyword for an implementation `impl` and the type `impl Trait` (user, 2026-11-04)

#### Rejected: dynamic dispatch through a WeakMap

The idea: change §4.1's `owned` from a `WeakSet` to a
`WeakMap<object, Companion>`, so that `Greetable.greet(p)` can look up the implementation from the value. **It hits the same problem that rejected the symbol idea in §7.6, in a worse form.**

§4.1 could choose a WeakSet because "a miss only degrades to a copy, and the semantics do not change". A dispatch table
throws on a miss. Concrete paths lead to a miss:

- `structuredClone` / a JSON round trip / a worker boundary / localStorage (reason 2 in §7.6)
- Crossing realms (dual package). Harmless in §4.1, fatal here
- **Deep patch.** Nodes along the touched path are rebuilt. A nested Val is sealed by its parent's seal,
  so the inner Val's registration silently disappears
- `Val.of`

**Rejected: requiring a companion as `Val.of`'s second argument.** It closes only the last of the paths above. A path that calls `Val.of`
on the output of `JSON.parse` can be rewritten, but a value that was already a Val and went through a clone cannot. Making it required
costs something and still leaves the hole.

#### `dyn`

The counterpart of Rust's `Box<dyn Trait>`. The vtable lives outside the value, and the caller builds it explicitly.

```ts
const party: Dyn<Serializable>[] = [Serializable.dyn(User, u), Serializable.dyn(Admin, a)];
for (const p of party) p.toWire(":");
```

Since `Self` is forbidden in return types, the box can stay flat, and the receiver drops out of the arguments.

```ts
type Bound<M, S> = {
  [K in keyof M]: M[K] extends (self: Self, ...a: infer A) => infer R
    ? (...a: SubstArgs<A, S>) => R
    : never;
};
```

`toWire: (self: Self, sep: string) => string` becomes `(sep: string) => string` on the box.

**One type argument.** The box passes as the trait's shape and drops the concrete type. With `Dyn<Serializable, User>`,
mixing boxes into a `Dyn<Serializable>[]` would make the elements a union. If the concrete type is needed, skip `dyn` and
call `User.toWire(u, ":")`.

**A box is not a Val.** It has neither `equals` nor `patch`. `Checked` rejects functions, so it cannot go into a payload either.
It is a proxy, so its identity differs from the value's.

**The value position takes `Tr`, not `ShapeOf<Tr>`.** With the shape, a plain object that merely has the fields
passes.

```ts
Greetable.shout({ name: "duck" }); // was accepted
Greetable.dyn(User, { name: "duck" }); // something that is not a Val went into a box with User's vtable
```

A trait is a contract between Vals, so requiring `Tr` rejects a value without the brand. Writing the implementations against the shape is
correct (they can use only the fields), and **only the exposed side** is `Unbound<…, Tr>`. Parameters are contravariant, so the implementations
are assignable as they are.

**The companion and the value are tied together.** `dyn(companion: TraitHost, …)` accepted any companion, so a `Crate` with
none of `Greetable`'s members could be passed. It type-checked and failed at run time with
`Greetable.dyn(...).greet is not a function`.

```ts
readonly dyn: <W extends Tr>(companion: TraitHost & Unbound<MembersOf<Tr>, W>, value: W) => Dyn<Tr>;
```

`W` is inferred from the value, and the companion's members must accept that type. The cost is 450 B of declarations and
620 instantiations.

#### `dyn` lives on the trait side

`Trait.dyn(User, u)`. **Rejected: adding `User.dyn(u, Serializable)` to the companion.** It fits §6.5's rule that the first argument is the
Val, but users who do not use `Trait` could no longer drop the box wiring.

One condition makes this work: **`val.ts` must not reference `trait.ts`**. `implTrait` does not build boxes; it only records.

```ts
// val.ts. Does not import trait.ts
target.implTrait = (_trait, impl) => build(ctors, callable, { ...traits, ...impl });

// attach. Adds members through the same path as .impl, plus one record
target.__valof_traits = traits;
for (const key of Object.keys(traits)) define(target, key, traits[key]);

// trait.ts. The box is a proxy, and binding happens when a member is called
dyn: (companion, value) =>
  new Proxy(value, {
    get(target, key) {
      const member = companion.__valof_traits[key];
      return member ? (...a) => member(target, ...a) : target[key];
    },
  });
```

- **One flat object is enough for the record.** It need not remember which trait a member belongs to. Types forbid two traits from
  registering the same name, and `.impl` coming after `implTrait` is settled by `.impl`
  returning `Companion`. The box passes through every member the Val implements, but `Dyn` exposes only
  those of its trait
- **Rejected: a `Map` keyed by trait objects.** If names do not overlap, there is no reason to keep track of which trait a member
  came from. Removing the `Map` cut production gzip by 15 B
- `implTrait` adds one object copy. Adding the functions reuses `attach`, so the part that cannot be removed is light
- **Defaults go into the record too.** `implTrait` registers `{ ...trait.defaults, ...impl }`, so the box does not distinguish overrides from
  defaults. As with Rust's `dyn`, the box always calls that Val's implementation
- **The box is a proxy.** The goal is to let `User.greet(u)` be written `p.greet()`, so forwarding calls to the companion
  is enough. Keys that are not functions are forwarded to the value, so **the trait's common fields can be read as `p.name`**.
  `.value` is no longer needed, and the collision when the shape had a field named `value` no longer occurs
- **Rejected: building a flat object with each member bound one by one.** That creates N closures per box. A proxy
  allocates once and binds only on a call. Fields would not pass through either. Making it a proxy added 7 B to production gzip
- **For a primitive payload, the target is an empty object.** A proxy's target must be an object, but the members are
  closures over the value, so the target does not matter. Nothing is lost either: a trait that a primitive Val
  can claim has no fields to read. +10 B
- **Rejected: rejecting primitive payloads through types.** Making `value` `ShapeOf<Tr> & Record<string, unknown>` would
  reject them (`object` would not, because the intersection with the brand includes an object). One hard-to-read conditional type is too high a price for a
  restriction that 10 B removes
- **No step to declare member names is needed.** The keys of `implTrait`'s second argument become the box's members as they are

#### Rejected: looking up the record by a brand string

The idea: have users write `Trait.companion<Greetable>("Greetable")` and look up `companion[TRAITS][brand]`. **Nothing ever
needs the lookup.** With a flat record, no trait needs to be named at all, and even if a key were needed, `implTrait` and `dyn` receive the same
trait object. The string would duplicate the brand written in the type, and valof-lint would have needed one more rule like
`brand-mismatch`.

The dual package is no reason either. The danger is two copies of valof being loaded, and the trait object is the single one
in the user's module.

- The key of `__valof_traits` is not owned by `trait.ts`. Creating a `Symbol()` there reverses the reference direction and
  breaks tree-shaking

**Create closures on every call, or share one prototype?** A box is not a value, so giving it a prototype does not hit the problem of
§7.2 (it is never passed through `structuredClone`). But `const { toWire } = p` breaks. Write it with closures first, and
measure once `dyn` shows up on a hot path.

#### How to measure

`scripts/bundle-size.ts` measures the graph that imports only `Val`, with `const api = "Val"`. The current 1280 B
budget then serves as the budget for "users who do not use Trait". A second entry that adds `Trait` is measured with
its own budget.

The second one is written `1280 + 256` (§16). The line is the **increase**, not a second rounded number, so writing it that way keeps it readable.
A user who imports `Trait` pays at most 0.25 kB extra. Measured: 95 B (1,147 → 1,242 B), nearly 3 times under the limit.

The cost of type inference is measured by `vp run type-perf` (`scripts/type-perf/`). It takes the `--extendedDiagnostics` numbers against
the published `dist/index.d.mts`. Fixtures go in `fixtures/`.

**Only `Instantiations` gets a budget.** The risk this library carries is a recursive conditional type running away,
and instantiations count exactly that. `Types` is reported but not checked. In every measurement so far, the two moved together at a ratio of
3.2 instantiations to 1 type, and two numbers to re-baseline for one signal is one too
many. Time depends on the machine, so it is only reported.

**Measure on the floor version only.** It is the same `floor` (5.9.3) as `ts-compatibility`, and it is the only version pinned
here. The upper lines are read from the registry, so a change in the numbers could not be traced to a TS release or to a change here,
and each one adds an install. Running three lines measured a fixture difference of 5 against 1,677,
within the checker's own noise. `ts-compatibility` covers correctness across all lines.

**Subtract the baseline.** Even for an empty file, 5.9 reports 86 `Types` and tsgo 341. Changing lib from es5 to
es2023 does not move them, so this is a fixed set the checker builds at startup, and only its size differs between implementations.
Absolute values cannot be compared across compilers.

#### Remaining decisions

- Detecting a missing `implTrait` belongs to valof-lint. In types, the return that became `never` would be reported only at the assignment
  `const User = ...`, and the message would be unreadable. It builds directly on §14's chain analysis
- Traits must not have `equals` / `patch` / `update`. With neither a brand nor a seal, there is nothing to rebuild
- `DeepReadonly` is applied to the shape. Otherwise a Val with an array field would not match

#### What valof-lint analyzes, 2026-09-11

**No new type resolver; follow only what the syntax determines.** For Val's third type argument, the lint recursively expands direct intersection types and
top-level intersection type aliases. For `implTrait`'s object, it follows inline objects, `const` bindings and spreads,
and stops at cycles. For expressions whose keys it cannot determine, such as conditional expressions, function return values and external imports, it treats
the trait's default implementations as used, to avoid false reports.

For `dyn`, it follows direct references, simple `const` bindings and destructuring. It does not follow a value passed to a function, returned,
or stored in an array or object. References beyond this boundary are invisible, as with the existing syntactic limits of `unused-member`.

**A declaration whose payload does not satisfy the shape was supposed to be caught by the same rule as a missing `implTrait`.** On 2026-10-19,
Vals started bringing in the shape, and this path no longer exists. See the next section.

#### Vals bring in the shape too, 2026-10-19

Found 2026-10-15, while writing `scripts/bundle-size.ts` with a trait-based Strategy. `Val<"Core", {}, Bundle>`
failed with TS2344, and only Vals had to write the shape's fields again in the payload. Enums bring them in
(§15.2 "The form that takes no companion"). Nothing recorded the difference as intended. **Aligned with Enum.**

- **Shape.** `Holding<T, Tr>`. When the payload is a record, it is `T & Writable<ShapeOf<Tr>>`. Primitives and arrays have
  no place for fields, so they are not intersected, and `Fits` rejects them as before. Whether the payload is a record is decided from its keys alone.
  Reading the fields would resolve the self-reference in `Rec`
- **A reader of the second type argument alone does not see the whole payload.** It does show up in `PayloadOf` / `SeedOf` and
  in the constructor's parameters
- **When the payload and the shape write the same field with different types, the declaration fails.** Narrowing passes
  (`{ name: "root" }` and `{ name: string }`). Left to the intersection, it would become `never` or `{ x: number } & string`,
  and a Val that cannot be built would pass the type check
- **Fields with no possible value are rejected too.** This covers two traits that conflict, and an Enum's common fields conflicting with a trait;
  in both cases the intersection is `never`. Enums let this through until now. `id: never` is
  assignable to `id: string`, so it passed the old `Fits`
- **Messages name the field.** The old message, "the payload does not hold what the trait
  requires", did not say which field. Now they are "the payload and the trait declare \`name\` with
  conflicting types" and "no value fits every declaration of \`name\`". The old message remains only for primitive and
  array payloads. The first one was originally "the payload declares \`name\` with a type the trait does not
  accept". It read as if it judged what the trait accepts, which made the overlapping field itself look like the error.
  An overlap passes when the types are the same or narrowed, so the message now names the conflict (2026-10-20)
- **Strip `readonly`.** (No longer needed as of 2026-11-04; see §15.1 "`Impl`". The trait passes the shape as declared through
  `FieldsOf`, and `Writable` is removed.) The trait holds the shape with `DeepReadonly`, so a plain intersection
  put `readonly name` in `PayloadOf`, and `Val.unwrap` returned readonly. That contradicts §3 "Do not write `readonly`
  in a payload". `Writable` strips it deeply and stops at Vals. Without stopping, a Val's fields would lose their brands
  and a raw record would pass. In an intersection the writable side wins, so Enum's `SharedIn` gets the same `Writable` too.
  Without it, a nested array becomes `readonly string[] & string[]`
- **The declaration bundler breaks on an escaped backtick.** Writing `` \` `` inside a template literal type made
  tsdown emit an empty `val.d.ts` and fail with `MISSING_EXPORT`. `tsc`'s own declaration output works.
  `Code<S>` fills it in with `${"`"}`
- **Type cost.** The trait fixture is at 15,224 and enum at 37,492 instantiations (budgets 17,000 / 90,000),
  and `index.d.ts` at 65.92 kB. Before the change, measured before merging main: 13,818 / 33,552

#### Demand, 2026-09-10

**Adopted.** Not because TS lacks traits, but because it **fills the gap §1 left**. Dropping classes left no
place for the default implementations and dynamic dispatch that the prototype used to provide. Trait fills it with types.

| What you want                                | Structural interface | class / mixin | Trait |
| -------------------------------------------- | -------------------- | ------------- | ----- |
| Declaring the shape and type-checking it     | ○                    | ○             | ○     |
| Sharing default implementations              | ✗                    | ○             | ○     |
| `User.greet` calls that Val's implementation | ✗                    | ○             | ○     |
| Iterating mixed values in one array (`dyn`)  | ✗                    | ○             | ○     |
| Forbidding overrides (`Final`)               | ✗                    | ✗             | ○     |

**"Types catch a missing implementation" is not an argument.** `satisfies` covers nearly all of it. The namespace is what matters,
and the namespace is not a by-product. It is the very place the default implementations and dispatch live.

**Narrow but deep.** Only users whose domain is large enough for several Vals to share behavior need it. It is overkill for a small
app. Still, brand types alone take 10 lines to write yourself, so Trait is the stronger reason to choose valof.

##### `dyn` stays

The idea: drop it for size. **Rejected.** Measured with `dyn` removed from `make`, production gzip went 1.21 kB → 1.16 kB,
**54 B**. Only users who import `Trait` pay it, and `Val` alone stays at 1.12 kB. A box is one Proxy, and does not
grow with the number of members.

The remaining cost is in the README: more lines that explain it to people who do not use it. Only people looking for `dyn` need a game-like example,
so the README links to it in one line, and the main text lives in the JSDoc.

One argument for writing `Final` in `M`, "it would not reach `Dyn`" (§15.1 Rejected: putting finals outside `M`), also assumes `dyn`.
Dropping `dyn` would still leave "it saves only one line of the declaration". The decision would weaken, not collapse.

##### Rejected: making `dyn` droppable, 2026-09-10

The idea: fewer users use `dyn` than use traits, so move it out of the namespace and let bundlers drop it. **Rejected.**
It keeps `Greetable.dyn(User, u)` readable.

Three options were measured by the production gzip of `import { Val, Trait }`.

| Form                               | gzip    |
| ---------------------------------- | ------- |
| `Greetable.dyn(User, u)` (current) | 1.21 kB |
| Added to `Trait.dyn`               | 1.22 kB |
| A curried standalone export        | 1.16 kB |

**`Trait.dyn` is not dropped.** A property of an exported const is kept whole. It loses both readability and the 54 B.

**Only the standalone export is dropped.** For users of `dyn` the size is the same 1.21 kB as now; the only difference is whether it can be dropped.

**Those who pay and those who care are different people.** Only users who import `Trait` pay the 54 B, and `Val` alone stays at 1.12 kB.
A trait user is more likely to use boxes than a valof user is to use traits. On the budget side too, the bundle has the slack (22% left),
and the tight one, the declarations (6% left), does not move under any option.

##### The form to move to

For when the bundle budget gets tight. **Put the type argument in the first step.**

```ts
dyn<Greetable>()(User, u); // no phantom needed; the same form as Val.sealer<V>() (§13.1)
dyn(Greetable)(User, u); // needs a phantom to recover Tr from the trait companion
```

Without finals, `TraitCompanion<Tr, G>` keeps no `Tr` in its type (`Unbound<Pick<…, FinalsOf & keyof G>, Tr>`
becomes `{}`), so the form that passes a value would need an added phantom.

**A flat three-argument `dyn<Greetable>(User, u)` cannot be written.** Without partial inference, writing `Tr` explicitly forces writing `W` too,
and dropping `W` undoes the tie between the companion and the value (§15.1 `dyn`). The curried form infers `W` in the second step, so it keeps the tie.

**The price is one closure.** Each call creates a function in the first step. When building boxes in a loop,
`const box = dyn<Greetable>()` hoists it out.

### 15.2 `Enum`, 2026-09-10

A second look at TaggedEnum, which §7.4 deferred in v1. **One of the two reasons for rejecting it no longer holds.**

- **"The discriminator is real data, which breaks the premise that the brand is a phantom"** → does not hold. `_tag` is an
  ordinary field, plain data itself. The brand stays a phantom beside it
- **"Nearly all the value lies in pattern matching, and ts-pattern already does that well"** → still holds. A form that does not compete with ts-pattern is acceptable

#### Shape

```ts
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.sealer<Shape>();
Shape.Circle({ r: 2 });
```

**Keep the prefix.** `const { Circle } = Shape` is legal, but a reader who sees only `Circle({ r: 2 })` has to look up
which enum it came from. `companion-mismatch` reports a rename (`const Round = Shape.Circle`). The same goes for types:
do not recommend `type Circle = VariantOf<Shape, "Circle">`; write `VariantOf` where it is used.

**2026-10-27: destructuring is now discouraged (user).** `enums.md` drops `const { Circle } = Shape` and the passage on renaming,
and says only "call through the companion". Whether lint reports it is undecided

**What matters is which way the declaration runs, not the proxy.** Declare the variants in one record and derive the union. Adding a
proxy to a hand-written union leaves the original problem in place: **adding a variant means editing two places**. The proxy only helps remove the duplicated strings.

#### Each variant is its own Val, and brands intersect

This reuses §15.1's "make brands intersectable" unchanged. No new mechanism.

**Derive the brand string.** `Circle` gets the brand `"Shape.Circle"` automatically. If the user wrote it by hand, the original
problem would return in another form: two places to edit for every new variant. valof-lint's `brand-mismatch` only needs
to extend its spelling check, as it did for Trait.

#### The tag's field name can change

```ts
type Shape = Enum<"Shape", Tag<"kind"> & { Circle: { r: number } }>; // default is "_tag"
```

**The tag is real data and crosses the boundary.** If an API response uses `type` or `kind`, valof does not decide the name.

A default type argument is safe here. The reasons `impl` avoided default type arguments (contextual typing stops; `Sealer` in
val.ts) concern a function's type arguments and do not apply to a type alias.

**The name is needed at runtime too.** The proxy builds `{ ...props, [tag]: name }`, and the type cannot supply the name.

```ts
const Shape = Enum.companion<Shape>("kind"); // duplicates the type argument
```

**This looks like the same problem as the brand string, but here the type catches it.** See "Pass the tag name by intersecting `Tag<…>`" below. No lint rule is needed.

**The tag name can collide with payload keys.** The payload needs the same check as the companion's reserved names.

#### `match` lives on the companion

**With custom tag names allowed, it cannot be a free function.** A free function works only if it hard-codes `v._tag`.

```ts
Shape.match(shape, { Circle: (c) => c.r * 2, Square: (s) => s.side });
```

**This is the better place anyway.** It matches the pattern of gathering functions under a namespace (§6.5), and no free function is left
outside the namespace. It is also why §5 did not ship `Val.equals` as a free function. **A function that cannot identify the value's type at runtime goes on the companion.**

#### `match`

```ts
Shape.match(shape, { Circle: (c) => c.r * 2, Square: (s) => s.side });
```

**No currying.** Both arguments are values, so one call infers everything. §13.1's two steps work around the lack of partial inference;
copying them here would add weight for no reason.

Three gains: completion of tag names, exhaustiveness by requiring every key, and handler arguments narrowed to the variant.
At runtime it is `handlers[v[tag]](v)`, a few dozen bytes.

**Leave guard clauses to ts-pattern.** `.with({ _tag: "Circle" }, ...)` already works. This keeps §7.4's "do not compete".
The README draws the line.

> Use `match` to branch on the tag alone. Use ts-pattern when you need conditions.

#### Relation to `Trait`

**The difference is open versus closed.** A Trait is open: anyone can implement it later. An Enum is closed: its variants are listed in one place.
That is what makes exhaustiveness possible. Both exist without overlapping.

**Enum variants implementing a Trait** is the combination that pays off. A closed set is handled by `match`, so it needs no `dyn`.
**Enum reduces the demand for `dyn`**, so §15.1's question "is `dyn` really used?" should wait until Enum ships.

#### Types checked, 2026-09-16

**The types accept the shape in §15.2.** Same result on TS 7.0.2 / 6.0.3 / 5.9.3.

**1. A union of variants passes as a Val.** `Validate`'s first branch, `[T] extends [AnyVal]`, also accepts a union,
so §3.6's ban on unions does not apply. `Val<"Holder", { shape: Shape }>` can be declared as is.

**2. The declaration can be recovered from the union.** Add one class with private / protected members, like `TraitPhantom`, and
intersect it into each variant. `Enum.companion<Shape>()` reads the variant record, the shared fields and the tag name from it.
Both the distributive form (`E extends EnumPhantom<infer K, …> ? K : never`) and the non-distributive form (`[E] extends [...]`)
work. Every member yields the same value, so the union collapses.

```ts
declare class EnumPhantom<K, V, S, Tag> {
  private readonly __valof_internal_phantom_enum: [K, V, S, Tag];
  protected readonly __valof_internal_phantom_enum_types: [K, V, S, Tag];
}

type Enum<
  K extends string,
  V extends Record<string, object>,
  S extends object,
  Tag extends string,
> = {
  [N in keyof V]: Val<`${K}.${N & string}`, V[N] & S & { [P in Tag]: N & string }> &
    EnumPhantom<K, V, S, Tag>;
}[keyof V];
```

The brand is derived as `"Shape.Circle"`. It does not break when `K` contains `/` (`"billing/Id"`).
`VariantOf<E, "Circle">` is `Extract<E, Record<Tag, "Circle">>`. This works because the tag is real data.

**3. `match` takes the handler object as a type argument.**

```ts
match: <H extends Handlers<E, unknown>>(value: E, handlers: Only<E, H>) => ReturnType<H[keyof H]>;
```

**Rejected: make the return type the type argument** (`<E, R>(value: E, handlers: Handlers<E, R>) => R`). `R` is fixed by the first
handler, and the second and later handlers become type errors. With the form above, the return type is inferred as the union of the handlers'.

**`Only` rejects unknown keys.** The excess property check does not apply, because `H` is inferred from the object literal,
so the literal's type is `H` itself. As with `Grown` in val.ts, the check goes on the parameter
(§11.1). The constraint already rejects missing keys, so that side works as is.

**4. Shared fields work.** Intersecting them into every variant's payload lets `shape.id` be read on the union as is.
The constructor requires the field and does not take the tag.

**The type arguments are `Enum<K, Variants, Shared, Tag>`.** This changes the plan above, which put the tag name third. Shared fields
are written more often. The defaults are `Record<never, never>` and `"_tag"`.

**Shared fields justify adding `.impl` to `Enum.companion`.** A member taking the union as its first argument now has a use.
In the same "single function type" form as `CompanionMembers`, the first argument becomes the union without an annotation (§6.5).

**5. Collisions with reserved names and the tag fail at the brand position (§11.2).** If a variant name collides with `match` / `impl` / `__valof_*`,
or the tag name collides with a payload or shared-field key, the type returns
`{ __valof_internal_phantom_brand: "…" }` instead of the union. That does not satisfy `AnyEnum`, so the companion and
`match` both fail on the same single check. This is how Trait puts `Invalid` in the brand (§15.1).

**6. A nested Enum is a patch boundary.** `Patch` distributes over the union, and each member is an `AnyVal`, so each gives
`never`. The union collapses to `never`, and `PatchValue` chooses replacement. This meets §9's requirement to "put a variant on the same
patch boundary as a nested Val". Nothing needs adding.

**Referencing its own companion gives TS7022.** Calling `Shape.match(...)` inside `.impl` stops inference. This is exactly §15.4.
**For Enum, this is the first thing a user wants to write**, so adding `.impl` also requires §15.4's callback form.

**Type cost.** About 500 instantiations per variant; about 4,600 for the declaration, one `match` and one construction
(2 variants). About 9,600 with 12 variants. Linear, and in the same order of magnitude as `trait`'s budget of 15,000.

**`VariantOf` makes its top level an intersection.** Otherwise hovers and errors show the expanded intersection.

```ts
// Written with Extract, the alias is dropped once the conditional type resolves
type ExtractOf<E, N> = Extract<E, Record<TagOf<E>, N>>;
// With an intersection at the top level, the name survives (the same trick as `Brand` in §2.1)
type VariantOf<E, N> = Val<`${NameOf<E>}.${N & string}`, …> & EnumPhantom<…>;
```

The type is the same; only the display changes. Mutual assignability with the `Extract` version, assignability to the union, the result of
narrowing by `_tag`, and the constructor's return type all match.

```
// Extract version
Property 'nope' does not exist on type '{ readonly r: number; readonly _tag: "Circle"; } &
Phantom<"Shape.Circle", { r: number; } & { _tag: "Circle"; }> & EnumPhantom<"Shape", { Circle: …
// intersection version
Property 'nope' does not exist on type 'VariantOf<Shape, "Circle">'.
```

`Handlers` is written with this. The display is the same on TS 7.0.2 / 6.0.3 / 5.9.3. **A user who wants an even shorter name can
write `type Circle = VariantOf<Shape, "Circle">`, and errors then show `Circle`.** The docs mention it in one line.

#### Variant members live on the companion, 2026-09-16

**2026-10-24: `implVariant` removed.** Variant steps are now `.Circle.*` steps in the chain ("Build with one chain" below).

**Do not set up a separate `Val.companion` for a variant.** `Shape.Circle` and `Circle` become different objects
with diverging members. The names also collide. By §14.21's "the companion has the type's name",
`const Circle` is the companion of type `Circle`, while `const { Circle } = Shape` is the enum's constructor:
two things claim the same name.

**So add `implVariant`.**

```ts
const Shape = Enum.companion<Shape>()
  .implVariant((self) => ({
    Circle: { diameter: (c) => c.r * 2 }, // c is VariantOf<Shape, "Circle"> without an annotation
  }))
  .impl((self) => ({
    area: (s) => self.match(s, { Circle: (c) => self.Circle.diameter(c), … }),
  }));
```

A variant with no members can be left out of `implVariant`. Union members reach variant members through `self.Circle.diameter`.

**A variant frame is one object.** It is the constructor, holds its own members, and has `patch`.
It has the same shape as `Sealed`, with two differences: the constructor does not take the tag, and `patch` cannot reach the tag
(treated like `fixed<Tag>`).

**`.impl` reserves variant names.** A union member named after a variant would shadow the constructor.
`Partial<Record<keyof VariantsOf<E>, never>>` rejects it, as `Wired` does.

**Build the seed from the declaration.** `Omit<SeedOf<VariantOf<E, N> & AnyVal>, Tag>` does not work. Intersecting `AnyVal` to
meet the constraint makes `PayloadOf` pick `unknown` from the second `Phantom`, and the seed collapses to `{}`. `patch` then
accepts anything, and without a test nobody notices. Writing `DeepReadonly<VariantsOf<E>[N] & SharedOf<E>>`
avoids it.

**Runtime: the proxy caches a frame per variant. The reason is allocation, not identity.** Creating it every time would
not change behavior. A destructured `Circle` and `Shape.Circle` are different objects, but they hold the same members with
the same implementations. The problem above is "members diverge", not identity itself. The cache exists so that each access
does not rebuild the whole set of closures. One `Map` is enough.

**Only one kind of code comes to mind that relies on identity:** putting a constructor in a dependency array, as in
`useEffect(…, [Shape.Circle])`. That is a weak basis, so it is not the reason.

**valof-lint: report a separate companion set up for a variant.** Targets are `Val.companion<VariantOf<…>>` and
`Val.sealer<VariantOf<…>>`. `bypassed-companion` extends to building a variant with `Val.of`.

#### Traits are implemented at the union step, 2026-09-16

**Make it possible.** If an Enum cannot implement a Trait, Enum alone cannot join a set of `dyn` values.
The use case for a Trait is `User` and `Shape` (an enum) both implementing `Serializable` and sharing one array. Blocking that
leaves Enum and Trait as separate features side by side.

**No new mechanism.** `Enum` passes the traits it receives straight through as the third type argument of each variant's `Val`.
Brands intersect, so the whole union is assignable to the trait, and `Fits`, `dyn` and `Final` from val.ts and trait.ts
work unchanged. Verified.

```ts
type Describable = Trait<"Describable", { id: string }, { describe: (self: Self) => string }>;

type Shape = Enum<"Shape", { Circle: { r: number } }, { id: string }, { traits: Describable }>;

const Shape = Enum.companion<Shape>().implTrait(Describable, (self) => ({
  describe: (s) => self.match(s, { Circle: (c) => `circle ${c.r}` }),
}));

const boxed = Describable.dyn(Shape, Shape.Circle({ id: "c1", r: 2 }));
```

**The plan was for shared fields to supply the fields a trait requires.** This later changed to the trait bringing them in (see the section "The form that
takes no companion").

**Rejected: implement per variant.** If `Circle` and `Square` only need different `describe`s, `match` inside the
union-level implementation does it. Bringing per-variant declarations into the type arguments splits the variant record into two levels,
payload and trait. Nothing is gained.

**`implTrait` needs the callback form too.** An enum's trait implementation is normally written with `match`, which references its own
companion. `implTrait` falls within §15.4's scope.

#### The form that takes no companion, 2026-09-20

→ Removed from both Val and Enum on 2026-10-20 (§15.1 "Removing the type-argument form"). What follows is the record from before the removal.

**Val had it; Enum did not.** §15.1's `implTrait<Tr>({…})` had not reached Enum's two entry points.
There is no record of rejecting it, and neither this section nor §9 has an entry. It was not a decision; it was simply never written.

Users saw TS2558 "Expected 2 type arguments, but got 1", not the message §15.1 prepared for
the mistaken call, "pass the members this trait leaves open, or name the trait as the type argument".
Contextual typing of the second argument was lost too.

**Five gates were missing.** `src/enum.ts` kept its own `Takes` and `Passes`, a thin copy of val.ts.
They are the mistaken-call message, the check that no other trait claims the same name, the check for collisions with payload
field names, `Complete`, and `Alone`. Enum had only the check "does it declare the trait".

**Sharing shrinks the declarations.** val.ts's `Takes` / `Complete` / `Passes` / `Alone` / `PayloadKeys` already
landed in the same chunk as enum.ts's declarations. Making them `export type` and borrowing them in enum.ts removes two
duplicates, which outweighs the doubled overloads. Declarations go from 58.81 to 58.67 kB. The opposite of §15.1, where Val paid
+2.1 kB.

**`PayloadKeys` now distributes.** `Declared<V>` distributes over `V`, so it is a union of payloads, and
`keyof` on that keeps only the shared fields. `PayloadKeys<Shape>` was `"_tag" | "id"`, dropping the
variant-specific `r` and `side`. A trait member that shadows one variant's field
got through. Distributing with `V extends unknown` gives the union of every variant's keys. Val is not a union, so it is
unchanged (core instantiations stay at 5,733).

**At runtime it is one token, `?? trait`.** Same as val.ts:1103. Enum's remaining gzip headroom goes from 106 to 105 B.

**Twice, a test let `@ts-expect-error` swallow a different error.** A test meant for `Alone` used a trait without
`Final`, and `Implement` was what actually rejected it. The `Complete` test put the directive on the
call line and swallowed the second argument's error. Removing `Complete` still leaves an error there, so the
directive stays green. The val.ts side (`tests/val.test.ts:1939`) puts it on **the first argument's line**,
which is where `Complete`'s message lands.

**Two entry points need two gates.** The tests were written against `Enum.sealer` alone, so `EnumBuilder`
stayed green when the `Alone` overload was deleted or `Takes` was removed entirely. test-audit
found it. After adding a check, confirm that it fails one test on each entry point.

#### `.impl` cannot take a Trait member's name, 2026-10-19

**Both the union's `.impl` and a variant's `.impl` accepted names equal to a Trait member's.** The companion and `dyn` call
the Trait's implementation, so one name has two meanings, depending on where it is called.

```ts
const E = Enum.sealer<E>()
  .implVariant("A", (v) => v.impl({ name: () => "variant A" }))
  .implTrait(Named);

E.name(a); // "default"
E.A.name(a); // "variant A"
Named.dyn(E, a).name(); // "default"
```

**Reject it in the type.** `Unclaimed` rejects it on the parameters of the four `.impl`s (2 entry points × union and variant) (§11.1).
Val's `Grown` reads the names `implTrait` registered, but a variant has no `implTrait`, so it reads the declaration.
It works even when `implVariant` comes before `implTrait`. Type cost: +364 enum instantiations,
+310 B in `index.d.mts`.

**Rejected: override a Trait member per variant.** Raised on 2026-10-15, while writing a Strategy in `scripts/bundle-size.ts`
where only Core behaves differently. It is exactly the case the section "Per-variant seals and the union's `seal`"
said nobody had found a use for. It is still rejected. The goal was to avoid listing the same handler four times in `match`,
and `match`'s `_` solves that.

#### Pass the tag name by intersecting `Tag<…>`, 2026-09-16

**In `Enum<"Event", { Click: … }, "kind">`, a reader cannot tell what `"kind"` is.** A positional argument
assumes the reader remembers the definition.

```ts
type Event = Enum<"Event", Tag<"kind"> & { Click: { x: number }; Key: { code: string } }>;
```

`Tag<T>` is one class with a private member. Private members vanish from `keyof`, so a mapped type walking the declaration
sees only the variants. **It reserves no names.**

**Rejected: take it as a record key (`{ tag: "kind"; Click: … }`).** A variant named `tag` could no longer
be written. **Git's object types are `commit` / `tree` / `blob` / `tag`**, and the discriminator is `type`. That example comes
from exactly the place that motivates a custom tag name, and it could not be written.
Telling a setting from a variant by whether its value is a payload would allow a variant named `tag`, but an enum with both a custom tag name and a variant named `tag` would still fail. Git is that enum.

**Rejected: read lowercase keys as settings.** This forces variant names to start with an uppercase letter. Tag values are
data on the wire, and the wish to mirror `{ ok: …, err: … }` as is comes from the same place as the wish
for a custom tag name. Allow both.

**Rejected: a `unique symbol` key.** It removes collisions completely, but §2.1's TS4023 came back.
The declaration emit of `export const GitObject = Enum.companion<GitObject>(…)` gives
`has or is using name 'TagMark' from external module … but cannot be named`. Exporting the symbol makes it
go away, but §2.1 tried the same fix and abandoned it. `Tag<…>`, which reserves no string, needs no symbol.

**Rejected: a key with a sigil, such as `"@tag"`.** It is a valid JSON key, so it guarantees nothing in principle.

**Three type arguments:** the name, the declaration, and what every variant has. Each has one meaning, and none needs a placeholder to skip it.

```ts
type A = Enum<"A", { One: { v: number } }>;
type B = Enum<"B", { Click: { x: number } }, Tag<"kind">>;
type C = Enum<"C", { One: { v: number } }, { id: string }>;
type D = Enum<"D", { One: { v: number } }, Describable>;
type F = Enum<"F", { One: { v: number } }, Tag<"type"> & { id: string } & Describable>;
```

**Shared fields and traits also go in one slot, as an intersection.** A trait carries the fields it requires, so
both answer one question: "what does every variant have". Both are written the same way.

**The tag moved to the third argument as well, on 2026-09-16.** At first it was intersected into the declaration record (the second argument). The tag is
a field every variant has, so it answers the same question. `Fault`'s check "the tag shares a name with a shared field"
also stays within one argument. `TagIn<X>` reads it with `[X] extends [TagPhantom<infer T>]`, and `keyof (Tag<"kind"> &
{ id: string })` is just `"id"`, so the tag does not mix with shared fields.

**`tag-mismatch` is no longer needed (removed from §9).** With the companion's parameter typed as
`[TagOf<E>] extends ["_tag"] ? [tag?: "_tag"] : [tag: TagOf<E>]`, the type catches all three cases:
a forgotten argument gives TS2554, a misspelling TS2345, and an unneeded argument TS2345. Lint has nothing to do.

#### A conditional type at the top level breaks declaration emit, 2026-09-16

**Keep `Enum`'s top level an indexed access.** Splitting invalid declarations off with
`[Fault<…>] extends [never] ? union : { __valof_internal_phantom_brand: Fault<…> }` drops the alias name once the
conditional type resolves. The user's `.d.ts` can no longer write `Shape`; it expands the union and
hits val.ts's non-exported `Phantom`.

```
error TS4094: Property '__valof_internal_phantom_brand' of exported anonymous class type
may not be private or protected.
```

The single line `export const Shape = Enum.companion<Shape>()` triggers it. No `.impl` is needed. This is the same issue that made
§2.1 move `Brand` out of `Val`, and the comment there says "a conditional type drops the alias name".

**The fix is the same.** Put the Fault in each variant's brand position. §11.2 says to put checks that read only type arguments
in the brand position, so it is the right place anyway.

```ts
type Enum<…> = {
  [N in keyof V]: Val<
    [Fault<D, S, Tag>] extends [never] ? `${K}.${N & string}` : Fault<D, S, Tag>,
    V[N] & S & { [P in Tag]: N & string },
    Tr
  > &
    EnumPhantom<K, V, S, Tr, Tag>;
}[keyof V];
```

After the fix, the user's declarations show `EnumBuilder<Shape, …>`. Measured against the declarations in `dist`.

**Check at implementation time.** Once `Enum` lands, CI checks the user's `declaration: true` output. §2.1's
TS4023 was the kind of accident that came from "exactly the intended use", and type checking alone does not surface it.

#### Rejected: two `.impl` overloads, an object form and a callback form, 2026-09-16

Keep only the callback form (§15.4). With both, a mistake in the object form prints "No overload matches this call"
followed by the mismatch against the callback form. A misspelled variant name is shown with the whole expansion of
`(self: EnumCompanion<…>) => T`. With one signature, it is the single line
`Type '{ Triangle: … }' has no properties in common with type 'VariantImpls<…>'`.

#### Rejected: take variants as a record of Vals, 2026-09-16

A plan to pass already-declared Vals as variants, for the sake of their names.

```ts
type Dog = Val<"Animal.Dog", { _tag: "Dog"; bark: string }>;
type Animal = Enum<"Animal", { Dog: Dog; Cat: Cat }>;
```

**It does not work with shared fields.** Once `Enum` intersects shared fields into each variant, the variant's type is
no longer `Dog`. The name shows only when no shared fields are used; using them means copying them by hand into every
variant.

**"Dog" is written four times:** the alias name, the brand `"Animal.Dog"`, the tag `"Dog"`, and the record key. Two more rules
are needed to catch mismatches. Adding a variant means editing two places again, which breaks "which way the declaration runs" at the start of §15.2.

**`VariantOf` above already gives what this plan would gain.** Write a one-line alias only for variants that need a name;
the others still display as `VariantOf<Shape, "Circle">`.

#### Rejected: make `match` a free function, 2026-09-16

The form `match(Shape, shape, handlers)`. Taking the companion as the first argument makes the tag name readable at runtime,
so the reason above, "with custom tag names allowed, it cannot be a free function", disappears. The types work too: inference, narrowing and
exhaustiveness match the companion form.

**Rejected anyway: the name collides with ts-pattern**, which also exports `match`. To keep §7.4's "interop rather than
competition", a user importing both in one file must not have to rename one.

**Secondary: `Shape` is written twice per call.** The difference between `Shape.match(shape, …)` and `match(Shape, shape, …)`.

**The price is tree-shaking.** On the companion, users who never call `match` still pay a few dozen bytes. Trait's
`dyn` already has the same property, so the line is not redrawn.

#### Lessons from the implementation, 2026-09-16

**The Fault went in `EnumPhantom`'s first type argument.** The `Val<Fault<…>, …>` written in "A conditional type at the top level breaks declaration emit"
above cannot be written. `Val`'s first type argument is `K extends string`, and passing `Invalid<…>` makes
enum.ts itself fail with TS2344. Making the Fault a string gets it through, but then it is just a brand name and checks nothing.
With `EnumPhantom<Invalid<Msg>, …>`, `AnyEnum`'s `K extends string` rejects it. This is the same shape as Trait putting `Declarable` in
the brand map, and the companion and `match` both fail on the same single check.

**Forbid enums with one variant.** An indexed access with a single key returns the variant itself and builds no union,
so the `Enum` alias is dropped. The user's `.d.ts` hits TS4094 on the single line `export const One = Enum.companion<One>()`.
With two or more variants a union forms and the alias survives, so this happens only with one. **A single variant is
a Val, so the message says so.** Zero variants simply give `never`; no value can be built, so nothing is needed.

**A trait brings the fields it requires in as shared fields.** The third type argument is read with `Pick<X, keyof X>`, so
every variant of `Enum<"Cmd", …, Describable>` gets `id` automatically. §15.2's "both answer one question" takes
this form, and writing `{ id: string } & Describable` does not declare `id` twice. The case "the payload falls short of what the trait requires"
can no longer happen. When a shared field and a trait declared the same field with different types, it became `never` and
slipped past the check; that was closed on 2026-10-19 (§15.1 "Vals bring in the shape too").

**The constraint on `CompanionMembers<V>` was removed.** A variant is `Val<…> & EnumPhantom<…>`, and TS cannot prove inside a
generic that it satisfies `AnyVal`. Dropping the constraint and making `V` a bare type argument changes nothing on the val.ts side,
and variant members can be written with it too.

**The type rejects `then` in all three places.** At first the enum proxy only returned `undefined` for `then`.
The proxy does not know variant names, so returning anything would make the companion a thenable, and `await` and `Promise.resolve` would
never settle. But a companion with a `then` member breaks for Val just the same, and on the Val side neither the type nor the runtime
said anything before causing the same hang. **Stop guaranteeing it for enum alone.** `then` is rejected as a member name and as a variant name through
`CompanionMembers`'s `then?: never`, Trait's `Declarable`, and `Enum`'s `Fault`. The proxy guard
stays. Without the guard, even a companion that declares no `then` would become a thenable, and that would not be caused by
anything the user wrote. oxlint's `unicorn/no-thenable` says the same thing, so the test disables it for one line.

**No runtime guard (2026-09-18).** A JS caller that bypasses the types can write `.impl({ then })`, making the
companion a thenable that never settles. `patch` throws a `TypeError` for the same caller, but only because such input would otherwise corrupt the value silently.
With `then`, `await` only hangs, and the name of the cause remains in the caller's code. Only callers that bypass the types hit it,
so the three type-level checks were judged enough.

**2026-10-26: `then` is no longer reserved, as a member name or as a variant name.** §15.2 "Remove the reserved names".

**The user's declaration emit is now in CI.** `scripts/ts-compatibility/` runs the book's blocks once more with
`declaration: true`. It adds `export` to each block's top-level `const` / `type` / `function` and
emits them. An inferred type needs a name only when written to a `.d.ts`, so type checking alone raises neither TS4023 nor
TS4094. This is what actually caught the single-variant case above.

**Type cost.** `vp run type-perf` gives 37,000 instantiations: about 800 per variant, the rest constant. The constant
is TypeScript's variance measurement: each time it relates two references to the generic aliases `EnumCompanion` and `VariantOf`,
it instantiates them with marker types to measure. `--generateTrace` showed over 100 ms for one.

**`in out` / `out` variance annotations cannot be written.** They would bring 37,000 down to 14,800, but give TS2637
"Variance annotations are only supported in type aliases for object, function, constructor, and
mapped types". Both aliases have an intersection at the top level, and intersections are not in that list. Dropping the intersection drops
the alias name (§2.1), so it is either the name or the type cost. **Keep the name.** The constant is paid once per program and
does not grow with the number of variants. The budget is set at 45,000.

#### Per-variant seals and the union's `seal`, implemented 2026-09-16

**2026-10-24: the seal layering was removed.** The enum's `implSeal` became the entry point used only by `Shape.seal` ("Build with one chain" below).

**2026-10-14: `seal`'s argument made exclusive.** See "Make `seal`'s argument exclusive" below.

**The motivation is branching at the boundary.** Where a tagged payload arrives, users check which variant it is themselves and call the
matching constructor. With `Shape.seal(payload)`, the library looks up the frame by tag.

**2026-10-21: `Enum.sealer` was removed (§6.12).** `Enum.companion` is now the only entry point.

**Two entry points, as for `Val`.** With `Enum.sealer`, every variant is callable, and the companion itself is the boundary's
entry point. With `Enum.companion`, every variant has `.create`, `seal` is the boundary's entry point, and it has `implSeal`.

```ts
const Shape = Enum.companion<Shape>()
  .implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id must not be empty")))
  .implVariant(() => ({
    Circle: (b) =>
      b
        .companion()
        .implSeal((p, seal) => (p.r > 0 ? seal(p) : new RangeError("r must be positive")))
        .impl(),
    Square: (b) => b.companion().impl({ diagonal: (s) => s.side * Math.SQRT2 }),
  }))
  .impl();

Shape.Circle.create({ r: 2, id: "c1" }); // VariantOf<Shape, "Circle"> | RangeError
Shape.seal(fromWire); // branches on the tag; returns the union of variants
```

**`b.sealer()` is not allowed under `Enum.companion`.** Allowing it would put `Shape.Circle({ r: 2 })` beside
`Shape.Square.create({ … })`, and a reader could not tell which call to use without reading the types. A variant that is fine with the defaults is simply
left out of `implVariant`, so there is no extra writing. The price is that adding a seal to 1 variant out of 12 turns them all into
`.create`, the same price `Val` pays per type. If it hurts in real use, only the
`Enum.companion` side can be loosened. Loosening is backward compatible; tightening is not.

**The Enum's seal is for shared fields.** It does not compete with variant seals. The Enum side cannot compose them,
because a variant's seal returns the user's type, and `val.ts` does not look inside it (`Constructed`). An Enum seal that
receives a `Result` cannot tell whether it succeeded.

**Passing it makes one chain.** The second argument of a variant's seal becomes "run the Enum's seal, then the default seal". The execution
order is variant, Enum, default. The user writes the composition by inspecting what `seal(p)` returns. Calling a variant's `.seal` directly still
passes the Enum's check. For a variant left out, the Enum's seal becomes its seal as is.

**`seal`'s input includes the tag.** The tag selects the frame, so the input is not something the seal can rewrite. It is the payload after
`create` has added the tag, so it has the same type the Enum's seal sees.

**Narrow the return type to the variant.** The terminal of the Enum's seal returns the union, so a bare `ReturnType` would make
`Shape.Circle.create` return `Shape | RangeError`. Only the part of the return type assignable to the union is replaced with
`VariantOf<E, N>`. A return that holds the union inside, such as `Result<Shape, E>`, passes through, and that
union stays a union. The library does not look inside.

**`impl` closes the chain.** (2026-10-23: now `.build()` closes it. §6.12) This mirrors `Val`'s `Sealer.impl()` returning `Sealed`. Without closing it, an exported
companion would still carry the steps, and `Shape.implSeal((p, seal) => seal(p))` could create, on the spot, another Shape with the check removed.
Only `implSeal` / `implVariant` / `implTrait` return the builder; with no union members, the chain still ends with
`impl()`. The price is the same as `Val`'s: `implVariant`'s callback cannot read `impl`'s members.

**`seal` joins the reserved names.** `Fault` rejects it as a variant name, and `CompanionMembers`'s `Wired` as a member name.
The runtime proxy does not turn `seal` into a frame either.

**Rejected: take `implSeal` as a per-variant record.** The form `implSeal(() => ({ Circle: (p, seal) => … }))`.
It has no place for the Enum's seal, and members get registered in two places, here and `implVariant`. Passing one builder
puts the seal and the members in the same callback.

**Rejected: extend the chain from the frame in value form.** A plan to write from the public frame, as in
`Circle: Shape.Circle.implSeal(…)`. The frame stays on the companion, so `Shape.Circle.implSeal(evil)` works outside the definition,
creating a second constructor for the same type. Unlike forging with `Val.sealer<VariantOf<…>>()`, this one shows up in the public
API's completion list. Passing the builder only to `implVariant`'s callback keeps that path out of the types. This mirrors `implTrait` taking the trait's
companion as an argument.

**Rejected: write one seal for the whole enum.** A plan to accept `(payload) => E`. It always needs a tag branch inside, so it takes no less writing
than per-variant seals, and using `match` for the branch references its own companion and gives TS7022. The unit of checking is
also really the variant. `r > 0` says nothing about Square.

**No per-variant `implTrait`.** The builder carries Val's chain, so it would come naturally, but Enum already provides one
abstraction. Nobody has found a case where implementing a trait per variant helps, and it avoids needing a rule for which one wins against the Enum-level `implTrait`.
`implCreate` and `fixed` are not offered either. The tag already uses them up
(`implCreate` writes the tag, and `fixed` excludes it from `patch`).

**`nocopy` came for free.** `val.ts`'s `attach` adds it to both `create` and the custom seal, and a
variant frame is a Val companion, so no extra implementation was needed.

**Lessons from the implementation.**

- **TS 5.9 fails when a union receives a union of conditional types.** Writing `Exclude<R, E> | (… ? never : VariantOf<…>)`
  gives TS2590 "union type too complex to represent" on an enum that implements a trait. A nested conditional type
  gives the same type and passes. 7.0 / 6.0 do not show it
- **Variance annotations can be written in some places.** The TS2637 in §15.2 "Lessons from the implementation" is about intersections; aliases of object
  types and mapped types accept `in out`. Writing it on `VariantSteps` / `SealerVariantSteps` / `Constructors` brought the
  fixture's instantiations down from 120,000 to 72,000. TS7 also drops it on references to intersections, so
  `VariantFrame` cannot take it
- **The seal's return type is instantiated once per frame.** If `create` / `create.nocopy` / `patch` / `seal` / `seal.nocopy`
  each wrote `Built<…>`, it would be instantiated five times. The body moves to `Framed<E, N, R, …>`, which receives it as `R`
- **Budgets.** type-perf goes from 45,000 to 90,000. About 1,100 per variant, linear; the rest is the variance
  measurement's constant. bundle-size for `Val` + `Enum` goes from 1.10 kB to 1.28 kB gzip; the 1.63 kB budget stays

#### Make `seal`'s argument exclusive, 2026-10-14

**With a union tag, other variants' fields stayed in the value.** The argument type `SealedPayload<E>` is a union of
per-variant tagged payloads. TypeScript accepts an object whose discriminator is a union if it is assignable for each value
of the discriminator. An object holding every variant's fields gets through this way.

```ts
Command.seal({ _tag: TAGS[name] ?? "Invalid", count: Number(argument), message: "…" });
// new 2 → {"_tag":"New","count":2,"message":"…"}
```

In the type, `New` has no `message`, but the value contains it, and it shows up in `equals` and JSON. The proxy does not know the variants'
fields, so it cannot drop it at runtime.

**The argument is now exclusive per variant.** `Exclusive<E>` adds, to each variant's tagged payload, the keys that only other variants
have, as `?: never`.

- An object with a union tag and every field is a type error, fresh or not
- An object with a single tag that is not fresh and holds another variant's fields is a type error. The excess
  property check does not reach this case
- A field two variants share is not made `never`. Only the fields of all variants minus the variant's own fields
  become `never`
- A union whose tags match its payloads, as schema libraries return, passes

Two gaps remain. A non-fresh object with a key that no variant has gets through, the same as with a Val
constructor. Without `exactOptionalPropertyTypes`, `message: undefined` can be written, and only the key remains in the value.

The Enum's `implSeal` argument, `SealedPayload<E>`, is unchanged. Only payloads that a variant's constructor built
reach it.

**Still two entry points, as with Val.** `Enum.sealer` uses a call (`Shape(payload)`); `Enum.companion` uses
`Shape.seal(payload)`. This corresponds to `Val.sealer`'s `User(value)` and `Val.companion`'s `User.seal(value)`.
The unsoundness came from the argument type, not from where the entry point lives.

**History.** At one point both `Shape(payload)` and `Shape.seal` were removed, so that only variant constructors built values.
Rust's enums are also built per variant. But with a payload a schema library has already split by tag, the user would have to repeat with `[Tag].match` the branch
the schema library already made, so the entry points came back with an exclusive argument. Along the way both forms were unified as `Shape.seal`,
but Val's sealer has no `.seal`, so the same operation would have had two names, and it went back to the call.

**Rejected: remove the entry points (second time).** Every value whose tag has come apart from its payload stops at a type error. Values do not
break, so that is no reason to remove them. Verified with a probe.

- `const { _tag, ...rest } = shape; Shape({ _tag, ...rest })`. Once `_tag` moves to a separate variable, the correspondence is lost.
  This was a type error even with a non-exclusive argument. Spreading the whole value (`Shape({ ...shape, id })`) passes
- `Omit<SealedPayload<Shape>, "id">`. `Omit` does not distribute over a union, so the only key left is `_tag`
- A flat UI form with fields for every variant. `[Tag].match` picks the fields per variant

Without the entry point, users would hand-write a `switch` that splits payloads whose tags match (schema output, server JSON, messages)
into variants. `[Tag].match`'s arms take no argument, so the payload is not narrowed.
A `switch` silently lets a new variant fall through.

Across this PR (including `[Tag]`), enum instantiations go from 32,653 to 33,264, `index.d.mts` from 59.48 to
61.18 kB, and the production gzip including Enum from 1.27 to 1.29 kB.

#### `[Tag].match` branches on the tag alone, implemented 2026-10-14

**The entry point for choosing a variant when the tag arrives separately from the payload,** as with a form's select field or a command-line argument.
`seal` needs the tag inside the payload, so it cannot be used here. This branch is unavoidable. The payload's type depends on the tag's value, so pairing a tag and a payload held separately requires
a case split. Rust also writes `match name { "new" => Command::New { … }, … }`. The only choice is where the branch is
written, and this lets it live in the Enum, in the same form as `match`.

```ts
Command[Tag].match(tag, {
  New: () => Command.New({ count: Number(argument) }),
  Check: () => Command.Check({}),
});
```

- **Handlers take no argument and call the variant constructor themselves.** They pass an object literal directly to the constructor,
  so the excess property check rejects other variants' fields
- **Every value the argument's tag can take needs a handler.** Other keys are rejected with `"the tag never takes this value"`
  (in the parameter position, like `Only`, §11.1)
- The return type is the union of the handlers' return types, for the same reason as `match` (point 3 of §15.2)
- At runtime it is `handlers[tag]()`. It works even though the proxy does not know variant names

**Adding a variant makes this a type error.** Places that branch on the tag with `if` or `switch` let it fall through silently unless they write
`assertNever`. The cost is about 20 B of production gzip (1.24 to 1.26 kB including Enum). The same exhaustiveness can be
written with `satisfies Record<Shape["_tag"], () => Shape>`, but few think of it, a custom tag name requires
rewriting it, and the user writes the return type by hand.

**Rejected: handlers return a payload, and the entry point adds the tag and seals.** The form `make(tag, { New: () => ({ count }) })`.
The excess property check does not apply to an arrow function's return expression, so `New: () => ({ count: 1, message: "m" })`
passes. It fails at its purpose of blocking extra fields.

#### The key is the string `Tag = "__valof_tag"`

**2026-10-26: `Tag` became a `Symbol()` (§2.1 "2026-10-26: back to symbol keys").** What follows is the record from that time. Neither the reservation
nor the lint rule planned below is needed anymore.

`Tag` is also exported as a value, and the companion puts `{ match, key }` under that key.

- **In `Command[Tag].match`, the target (Command's tag) comes before the verb.** The word order matches `Command.match`
- **The value `Tag` shares its name with the type `Tag<"kind">`.** One import brings in both
- **No new reservation.** `__valof_${string}` is already unusable for variants and members. A variant named `tag` can
  still be written
- **The key is a string literal, so the user's declaration emit writes the key as is.** No value name is needed.
  It is declared as a property, so `noUncheckedIndexedAccess` does not add `undefined`. Checked on TS 5.9 / 6.0 / 7.0
  with a user's declaration emit that exports `Cmd[Tag]`
- It works with several copies of valof installed, since the string is the same value
- The name follows the runtime key `__valof_traits` and contains neither `internal` nor `phantom`

Writing `Command.__valof_tag.match(…)` directly also works. A separate PR adds a lint rule that flags a member access
written directly with a key starting with `__valof_`. It covers `__valof_traits` too, not just Enum.

**Rejected names and forms**

- **An overload of `match`.** A `match` taking a value and a `match` taking a tag have different handler shapes (receiving the value /
  receiving nothing), and type errors become harder to read
- **`Command.match.tag(…)`.** No new reservation, but the target comes after the verb
- **`Command.tag.match(…)`.** `tag` can no longer be a variant name. The tag name became a type-argument marker (`Tag<T>`)
  precisely so that a variant named `tag` can be written
- **`Command._tag.match(…)` (the tag's field name as the key).** It passes declaration emit and `noUncheckedIndexedAccess`,
  but a variant named after the tag can no longer be written, and `_tag` looks internal. The runner-up
- **`Command.matchTag(…)`.** Reserves one fixed name
- **Make `Tag` a `unique symbol`.** For a companion whose type is emitted expanded, a file that does not import `Tag`
  gets TS4023, even when `Tag` is exported. The same problem that led §2.1 and §15.2 to reject a symbol
- **Make `Tag` a symbol with a phantom on it (`symbol & TagSymbolPhantom`).** It is not a `unique symbol`, so it has to be held
  through an index signature, and `noUncheckedIndexedAccess` adds `undefined` to `Command[Tag]`

Only a string literal can be written in declaration emit without a value name and still resolve to a single value.

#### `[Tag].key` is the tag's field name

`Command[Tag].key` returns `"_tag"`, or `"kind"` for `Tag<"kind">`, typed as the literal `TagOf<E>`. When passing the discriminator's
name to a schema library (`z.discriminatedUnion(Command[Tag].key, […])`), the string need not be written
twice. The proxy holds the tag name at runtime, so returning it is enough.

#### `implVariant` is a chain per variant, implemented 2026-09-18

**2026-10-24: `implVariant` removed** ("Build with one chain" below).

**Changed from one record to a chain.** Nesting drops one level, and the outer callback disappears.

```ts
// before
.implVariant(() => ({
  Circle: (b) => b.sealer().impl({ diameter: (c) => c.r * 2 }),
  Rect: (b) => b.sealer().impl({ ratio: (r) => r.w / r.h }),
}))
// after
.implVariant("Circle", (b) => b.impl({ diameter: (c) => c.r * 2 }))
.implVariant("Rect", (b) => b.impl({ ratio: (r) => r.w / r.h }))
```

**`self` is the second argument:** `(variant, self) => …`. It avoids TS7022 the same way the outer callback did, and can be
omitted when unused. It matches the two-argument form of `implTrait(trait, fns)`.

**Naming the same variant twice fails.** `Fresh<E, VM> = Exclude<keyof VariantsOf<E>, keyof VM>` is
the constraint on the name. The chain keeps the detection that duplicate record keys used to provide.

**The type cost is negligible.** Fixture instantiations go from 72,457 to 72,649: +192 for three chains, about 64 per step.
`types` goes from 57,459 to 57,414, a slight drop. gzip +2 B. Neither budget moves.

**`b.sealer()` / `b.companion()` were dropped.** The Enum's entry point decides each variant's entry point, so it was a one-key object with
no choice in it. `VariantBuilder` / `SealerVariantBuilder` / `VariantBuilds` / `Frames`
disappear, and `b` is `VariantSteps` itself.

**The escape hatch stays open.** "If it hurts in real use, loosen only the `Enum.companion` side" above can be done by adding
`b.callable()` to the steps. A backward-compatible addition.

#### Variant steps become a frame, implemented 2026-09-18

**Only enum could not omit `.impl()`, an asymmetry.** `Val.sealer` / `Val.companion` /
`Enum.sealer` / `Enum.companion` all intersect the companion, so `.impl()` is optional.
`VariantSteps` alone had only `impl` / `implSeal`, and the `ClosedFrame` constraint forced `.impl()`.

```ts
// before: .impl() required even with no members to collect
.implVariant("Cash", (variant) => variant.implSeal(check).impl())
// after: the steps are the frame itself
.implVariant("Cash", (variant) => variant.implSeal(check))
```

**This differs from rejecting "extend the chain from the frame in value form".** That plan was rejected because `implSeal` would appear on the public `Shape.Circle`.
When the steps are returned, `Shape.Circle.implSeal` can be reached too, but this is the same as exporting
`Val.companion<V>()` without `.impl()`. The author chooses whether to close it.
A frame the steps built (what `.impl(fns)` / `.implSeal(…)` return) stays closed.

**`in out` survives by moving the intersection out of the alias.** Making it `VariantSteps = VariantFrame<…> & { … }`
loses the annotation to TS2637, and the fixture goes from 72,676 to 92,209 (over the 90,000 budget). Moving the intersection to
`implVariant`'s parameter and `implSeal`'s return, and keeping the alias body an object type, gives
77,558, within budget. The +4,882 difference is the frame being instantiated twice. gzip +8 B.

**At runtime, the steps are built as a frame.** `built(name, custom, {})` gets `impl` / `implSeal` via `define`.
`.impl(fns)` calls `built` again, so the members land on a frame no one else holds.

#### Force `implSeal` before `implVariant`, implemented 2026-09-18

**2026-10-21: `Before` removed (§6.12).** Writing any of `implVariant` / `impl` / `implTrait` removes `implSeal` from the type and the runtime, so it cannot be written afterwards.

**With only a convention, types and runtime diverged.** The frame is typed with `F` as of `implVariant`, but the runtime
composition reads the seal in its final state. Writing them in reverse order leaves `create`'s type as `VariantOf<…>` while it returns
a `RangeError` at runtime.

```ts
const Money = Enum.companion<Money>()
  .implVariant("Cash", (b) => b.impl())
  .implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id")))
  .impl();
Money.Cash.create({ id: "", yen: 1 }); // VariantOf in the type, RangeError at runtime
```

`Before<VM, Ok> = [keyof VM] extends [never] ? Ok : "write …"` goes in the parameter position to reject it
(A in §11.1, not B, because the check reads the chain's state). +27 instantiations.

**Rejected: run seals in the order Enum, then variant.** The composition point would move to the Enum side, and the continuation of the Enum's seal
would be the union of each variant's return. The library does not look inside, so it cannot tell whether a `Result` succeeded (the same as
"The Enum side cannot compose them" above). In the current order, the `seal(p)` in a variant's seal returns what the Enum's seal returns,
so the composition point is already on the variant side. The docs did not say so; one added sentence fixed that.

#### Rejected: change how the tag name is passed, 2026-09-18

**Keep the current form.** Prompted by the point that the call alone does not show what the string in `Enum.sealer<Event>("kind")` refers to,
four options were compared.

```ts
const Event = Enum.sealer<Event>("kind"); // current
const Event = Enum.sealer<Event>({ tag: "kind" }); // B
const Event = Enum.withTag("kind").sealer<Event>(); // C
const Event = Enum.sealer<Event>().withTag("kind"); // D
```

**C gets no completion.** At `withTag("`, the parameter's type is `T extends string`, and `E` does not exist yet. In the other
three, the parameter's type is `TagOf<E>`, a single literal, so a suggestion appears. An option that makes users type the spelling by hand is rejected.

**C moves the check onto a type-argument constraint.** `E` comes later, so the argument cannot be checked against it. `<E extends TagPhantom<T>>`
puts the error in the right place, but the message exposes the internal phantom.

```
TS2344: Type 'Event' does not satisfy the constraint 'TagPhantom<"kin">'.
  Types of property 'p' are incompatible.
```

Rejecting it through a conditional return type shows nothing on the declaration line (`const Event = …` passes and stays
silent until the first use). The entry point also splits in two, `Enum.sealer` and `Enum.withTag(…).sealer`.

**D cannot reject "never called".** The ordering rules live on parameters (`Before<VM, Ok>`, §11.1), but
those only catch a call written in the wrong position. `withTag` alone would need a pending state, where `sealer` returns a type holding only `withTag`.
The error for forgetting it appears at the first use. The chain gains one more state in both `sealer` and `companion`,
which counts against the type-perf budget. Spelled `implTag`, it would be the only `impl*` that registers nothing.

**B differs from the current form in two ways only:** whether the call's meaning is readable, and 8 characters. Forgetting the argument (TS2554), completion, chain states,
lint's chain root, and implementation cost are all the same. "TS2353 rejects `{ key: … }` with the correct key name" does not count
in B's favor. B itself creates that kind of mistake.

**The type rejecting something does not guarantee it is readable.** The reason for choosing the current form was "the type rejects both forgetting and misspelling"
(no need for `tag-mismatch` above), but the point raised was about reading, not that. `Tag<"kind">` one line above
explains what the string means, so the difference is a matter of taste. Keep the current form for now; B remains an option.

**Rejected: `Tag("kind")`.** A plan to merge `Tag<…>` as a type and a value, so the declaration and the call use the same word. It reads as
constructing a Class or a Val. `Tag`'s own parameter is `T extends string`, so completion is doubtful too.

#### Add an object form to `.impl`, implemented 2026-09-18

**Keep both** (the same decision as §15.4). For members that do not read the companion, a callback is noise.

```ts
Enum.sealer<Shape>().impl({ sides: (s) => (s._tag === "Circle" ? 0 : 4) });
```

**A union parameter, not two overloads:** `fns: G | ((self: EnumCompanion<…>) => G)`. Splitting into two
turns a mistake inside either form into "the last overload does not match". A one-line
mistake inside the callback showed up like this:

```
TS2769: No overload matches this call. The last overload gave the following error.
  Index signature for type `__valof_${string}` is missing in type '(self: EnumSealed<…>) => …'
```

With a union, TS2345 drills down to the member that caused it.

**Contextual typing works in both.** The first argument resolves to the union without an annotation (read out of TS2322). Reserved names
(variant names, `match`, `patch`, `then`) are rejected in the object form too.

**The cost is negligible.** Fixture instantiations go from 77,558 to 77,569, gzip +15 B. At runtime it is one
`typeof fns === "function"` branch.

**`implTrait` stays as it is.** It has the same shape, but the request was for `.impl`. If needed, the same union can be added.

#### `match`'s `_`, implemented 2026-10-21

**One handler takes the remaining variants.** Added to both `E.match` and `E[Tag].match`, in both data-first and
data-last forms.

```ts
Shape.match(shape, { Circle: (c) => c.r, _: (rest) => rest.side });
```

- `_`'s argument is narrowed to the remaining variants (`Exclude<E, Record<Tag, K>>`). In `[Tag].match` it takes no argument,
  and the remainder is counted from the argument's tag `T`
- Writing every variant and `_` together is a type error. `_`'s type is replaced with `"every variant has a handler, so `_` never runs"`
- Unknown keys are rejected with or without `_`. `Only` is no longer needed
- `_` joined the reserved variant names (`Fault`). At runtime it is `(handlers[tag] ?? handlers._)`. The type rejects a
  variant named `_`, so `??` is enough (the reservation was removed on 2026-10-26; §15.2 "Remove the reserved names")
- The return type is still the union of the handlers' return types. The type arguments become two, the key set `K` and the whole literal `H`,
  and the return type is read from `H`
- Cost: enum fixture instantiations go from 46,593 to 47,750 (48,471 after adding lines that use `_`),
  `index.d.ts` +0.55 kB, gzip +4 B

**A conditional type on `"_" extends K`, not a union.** The plan was the union `All | WithRest<K>`. With a union, forgetting
a variant gives the error `Property '_' is missing`. TS explains the error with the member that matches more keys,
so reordering the union does not change it. With a conditional type, the error stays `Property 'Square' is missing`.

**`K`'s constraint is `PropertyKey`.** Narrowing it to `Tags | "_"` makes `K` fall back to the constraint as soon as an unknown key appears, and
the remainder becomes `never`. The error then lands on the `_` line as "every variant has a handler" instead of on the unknown key.

**Only the key set is inferred.** `K` is read from `{ [N in K]: … }`. Inferring the whole literal with `H` alone makes
`H` fall back to its constraint, and `_`'s argument becomes `never` (TS2339). Mapping over `Exclude<K, "_">` makes it non-homomorphic and
inference disappears.

**A remaining rough edge.** In `[Tag].match`, listing a variant that the argument's tag does not include together with `_` can attach TS2577 / TS7023
to the main error. The main error lands on the right line.

Same result on TS 7.0.2 / 6.0.3 / 5.9.3.

**Rejected: the key name `default`.** It is more explicit, but it collides with Enums whose tags are external strings (CSS's `cursor`,
`"default" | "custom"`). `E[Tag].match(input.tag, …)` is exactly that entry point.

**Rejected: pass the rest handler as a third argument.** The types work, but `_` is easier to see within the list of handlers.
`match` is `dual` and tells the data-last form apart by argument count, so an optional third argument would mistake `match(value, handlers)` for
a data-last call (§6.11 "The types forbid omittable parameters").

**Rejected: split the all-variants form and the `_` form into overloads.** Data-first and data-last already make two. Splitting
further turns mistakes into TS2769 "the last overload does not match" (the same reason as `.impl`'s object form).

---

#### Build with one chain, implemented 2026-10-24

**`implVariant` removed; the companion is now one chain.** A breaking change in v0.11. The discussion and the options compared (A to D, and E) are in
`__memo__/enum-api-redesign.md`.

```ts
const Shape = Enum.companion<Shape, [Unpatchable<"id">]>()
  .tag("kind") // only when `Tag<…>` is declared; the first step
  .Circle.implSeal((c, seal) => (c.r > 0 ? seal(c) : new RangeError("r"))) // variant steps
  .Circle.impl({ diameter: (c) => c.r * 2 })
  .implSeal((input: object, seal) => …) // enum steps come after variant steps
  .implCreate(…)
  .impl({ … })
  .build();
```

**A variant is itself a Val.** After `.Circle.` come Val's steps (`implSeal` → `implCreate` (`.noseal`) → `impl` /
`implTrait`), with the same order and counts as Val. Every step returns the enum's builder, so the next variant continues with
`.Square`.

- **This overturns `implVariant` from §15.2 "Variant members live on the companion", and the plan to have no per-variant `impl`
  (§9, 2026-10-21).** As with `impl Circle` written on a Rust newtype, per-variant members are natural.
  A separate companion is still not set up (`NotEnum`). `.Circle` is part of Shape's chain
- **A variant's seal now requires the tag (2026-10-24).** Its argument is the value's payload itself (`Tagged<E, N>`), so a round trip
  through JSON and `Val.unwrap` changes neither the type nor the value. This matches "a variant is a Val". Nothing rewrites the tag,
  and the seal can check the incoming tag like any other field
- **`create` mints the tag.** A variant gets a default `create` (it takes the payload without the tag, adds the tag and passes it
  to the seal). The `f` in `implCreate(f)` also returns a payload without the tag, and the tag is added the same way. This mirrors Val's `create` generating
  an id, and fits §6.7's split (seal is an idempotent check; create generates). On 2026-10-21 the rule was "`create` only when
  `implCreate` is written", because the `create` of the time was a seal that added the tag, which did not mean generation.
  Treating the tag as minted removes that reason
- **`PrivateSeal` hides only the seal.** The default `create` remains. The only field it generates is the tag, and `create`
  adds the tag correctly, so the caller has nothing to forge (this is not §6.12's case "a caller can pass fields `create` should generate").
  Both were once hidden together on the grounds that "the default `create` is effectively a seal that adds the tag", but the seal is a constructor and
  `create` is a factory, so hiding both with `PrivateSeal` blurs what seal means (user)
- **`PrivateCreate` added.** It removes `create` from the type, whether the default or one from `implCreate`. It can be
  put on Val and on Enum. On the whole Enum it removes every variant's `create` and `Shape.create`; with `VariantOptions<N, [PrivateCreate]>`
  it removes one variant's. `PrivateSeal` is not allowed per variant because `Shape.seal` reaches every variant through the tag,
  and `create` has no such path
  - Names compared: `NoDefaultCtor` (`PrivateSeal` also hides a custom seal, so "default" does not fit; a negative and an abbreviation),
    `PrivateConstructor` (the docs call both `seal` and `create` constructors, so it reads as hiding `create` too.
    Matching Kotlin's `private constructor` would require realigning the docs' terms), `NoCreate` (Val has no default
    `create`, and its relation to `implCreate` is confusing. It also breaks the adjective rule (§6.10)). Chose `PrivateCreate`, which reads
    the same way as `PrivateSeal`: "`PrivateXxx` removes Xxx from the public surface"
- History: at first the tag was added automatically and left out of the argument (R). The reasons were "the variant is already decided at the call, so the tag adds no information",
  "writing it every time is redundant", and "the tag matches the brand (overwriting a different tag that arrived through a cast)". The user pointed out that, with a seal whose input is close to `unknown`, `Shape.Circle.seal(JSON.parse('{ "_tag": "Square", "r": 1 }'))` passes, and the options were compared again
  - Because of structural subtyping, R accepted any tag on a value passed as a variable. In effect, "the tag is optional and its value is not
    checked"
  - Effect (v3, v4.0.6) leaves out the tag and overwrites it in the unchecked `Data.taggedEnum`; in the checked `Schema.TaggedStruct`,
    `make` makes the tag optional (filled from a default) and decode (`Schema.decodeUnknown*`) requires it
  - An optional tag creates two ways to write the same entry point. Splitting by entry point, with the tag required in seal (like decode) and omitted in create (like make),
    leaves exactly one way to write each (user)
  - **Rejected: as a safety net, overwrite the tag right before the default seal.** It protects only a variant without `implSeal` that receives
    a different tag through a falsified type, the same situation as Val's default seal accepting `any` unchecked. The likely mistake is
    `Shape.seal` creating a variant not in the declaration, which overwriting cannot prevent (user)

**The enum-wide seal layering (variant → enum → default) was removed.** This overturns the composition in §15.2 "Per-variant seals and the union's `seal`".
The deciding factor was symmetry with `match`. `match` only dispatches to a handler by tag; no handler runs before
every variant. The default `Shape.seal` now only dispatches too. `Made` (the type that narrowed the enum seal's return to the variant, and
the workaround for TS 5.9's TS2590) and the runtime composition are gone.

**The enum's `implSeal` came back as the entry for `Shape.seal`.** It runs before dispatch, and the callback's `seal` dispatches.
Its return type is the union of every variant seal's return type. A variant's `seal` / `create` / `patch` do not go through it (the variant is
already decided). Validation is gathered on the variant side, and the enum's `implSeal` is optional.

- It is needed only when passing an unvalidated value to `Shape.seal`. A variant's seal can also check the tag, but a payload whose tag is not in the declaration
  reaches no variant's seal (that name's frame has no seal). With §8.3's recommendation
  (`Shape.seal(JSON.parse(json))`, validation inside the seal), `JSON.parse` returns `any`, so the type does not stop it either.
  Widening the argument to `object` means writing a check that narrows the tag, because the callback's `seal` accepts only `Exclusive<E>`.
  Val's default seal also lets `any` through, so this is not a problem in valof's design (user)
- **Once, the layering (variant → enum → default) was restored and applied to every entry point (`wip/enum-seal-layer`).** The aim was to run the same seals
  whichever entry point is called. But running the variant seal first means the variant frame overwrites the tag before passing the value
  to the enum's seal, so a value that differs only in its tag passes the enum's tag check. Running the enum seal first means that checking
  whether the variant the enum chose matches the entry point called can only throw, which the type cannot express. Requiring the tag in the seal and gathering
  checks on the variant side made the layering unnecessary
- The default `Shape.seal` stays. It is treated like `User.seal` without `implSeal`, and keeps §6.12's "seal is always `X.seal(p)`"
- **The enum's `implCreate` came back too.** Its output goes through `Shape.seal`. `.noseal` skips every seal in production, and
  in development it runs the enum and variant seals and checks the payload that reaches the default seal. The watch stops once the payload enters the variant
  frame, so other values the seal builds along the way are not counted
- **Rejected: remove the default `Shape.seal`.** It closes the hole but diverges from Val
- **Rejected: type the callback's `seal` provisionally with `Shape` and replace it in `.build()`.** Only the top level can be
  replaced, so the inside of `Result<Shape, E>` ends up narrower than reality
- **Rejected: put the seal's failure type in the declaration.** It makes the declaration heavy

**Enum steps come after variant steps.** The callback's `seal` return type depends on the variant seals, so placing it first leaves it
undetermined. The user proposed this form first, and it was once turned down because it inverted the layering (removing the layering removed that reason). After one enum step,
variant steps are no longer available. There is no risk of reading the `.impl({…})` on the line after `.Square.implSeal(f)` as Square's.
The formatter breaks the line at each step, and a variant step starts with `.Square`.

**The library does not check the tag at runtime.** The Proxy does not know variant names. The names of variants with steps are
known at `.build()`, but those without are not. A tag not in the declaration can arrive only through a path that falsifies the type (`any`, an assertion,
a wrong type guard, a suppressed type error, JS), and at the boundary a schema in the enum's `implSeal` rejects it. The tag of a declared
variant can be checked by that variant's seal with a schema. A check that only tests for a string
protects nothing more, so it was not added.

**Per-variant traits.** Declare `{ Book: { pages: number } & Named }` and implement it with `.Book.implTrait(Named, …)`.
The trait is taken out of the payload, and its shape fields go into that variant only.

- **A trait declared on the enum cannot be declared on a variant (`Fault`).** `dyn` selects the implementation by the companion passed, not by the value,
  so `Named.dyn(Shape, c)` and `Named.dyn(Shape.Circle, c)` would call different implementations
- Passing a variant's trait to the union's `implTrait` fails with "a variant declares this trait, so it implements the
  trait itself"
- **The `AnyVal` constraint on `Takes` / `PayloadKeys` was removed.** Satisfying it with `VariantOf<E, N> & AnyVal` makes them read the payload
  from the second Phantom, missing collisions between member names and payload fields

**The companion's type arguments (§6.12) extend to Enum.**

```ts
Enum.companion<
  Order,
  [PrivateSeal, Unpatchable<"id">, VariantOptions<"Shipped", [Unpatchable<"shippedAt">]>]
>();
```

- `Unpatchable<K>` picks K from the union of every variant's keys, and excludes it from every variant that has K
- `VariantOptions<N, [...]>` applies per variant, on top of the enum-wide options. `PrivateSeal` cannot go in it (`PrivateCreate` can).
  `Shape.seal` reaches every variant through the tag, so hiding the seal applies to the whole enum (`Shape.seal` and every variant's `seal`;
  `create` remains)
- **The name is `VariantOptions` (renamed from `OptionsFor` on 2026-10-24).** `OptionsFor` has a generic name though it is Enum-only,
  and inside the list a reader cannot tell that `"Shipped"` is a variant name without looking at the declaration (user). The reasons for choosing `OptionsFor`
  (short, matches `SeedFor`) are weak. `SeedFor<Shape, "Circle">` takes the enum as an argument, so it reads clearly on its own.
  Like `VariantOf` / `VariantsOf`, the name leads with what it is a type of. `OptionsForVariant` is long
- The rejected forms (intersection and record, a second type argument, `Unpatchable<{ Parcel: … }>`, the name `Variant`) are recorded in the memo

**`.tag("kind")` is the first step.** It moved from the argument of `companion("kind")`. Val's and Trait's `companion()` take
no argument. Only when `Tag<…>` is declared does `companion()` return just `{ tag }`, so the type rejects forgetting it, misspelling it,
and writing the default tag.

**Reserved variant names.** The builder lists `.Circle` beside the steps, so the step names removed from `.build()` (§6.12) came back:
`tag`, `impl`, `implSeal`, `implCreate`, `implTrait`, `implAssoc`, `build` ("a variant cannot take a step's
name"), plus `seal`, `match`, `create`, `_` and `__valof_*`. `implAssoc` and `create` were reserved ahead of time to avoid a later breaking change
(`implAssoc` arrives in PR 2; the enum's `create` arrived in this one). All were removed on 2026-10-26; see "Remove the reserved names" below.

**Runtime.** The builder is a Proxy again. Any key other than a step name becomes a variant step. `.build()` creates the frames of the variants
that have steps on the spot, so member checks (argument count) throw at their position in the chain. The frames of variants without steps are
still created on first read. A variant frame is a Val companion, and its seal writes the tag.

**lint.** The scanner skips `.Circle` inside the chain (`variantOf`). The code that tracked `implVariant`'s callback
was removed. `bypassed-companion`'s message points to `Shape.Circle.seal`. `unimplemented-trait` does not yet look at traits declared on a variant
(planned for after the lint rewrite).

**Measured.** type-perf: enum 45,815 → 32,757, `index.d.ts` 69.95 kB → 77.24 kB. Production gzip: Enum's increment
+415 → +572 B (budget +640 B). The increase comes from the builder's Proxy and from handing over the development watch for `noseal`.

#### Remove the reserved names, 2026-10-26

**Every reserved variant name was removed:** the step names (`tag`, `impl`, `implSeal`, `implCreate`, `implTrait`, `build`),
`seal`, `create`, `match`, `then` and `_`. `__valof_*` was already gone in PR #90 (§2.1). A variant named `create` is
common in CRUD events. Removing a reservation is not a breaking change.

**Callable frames.** A step or function whose name a variant shares acts as the step or the enum's function when called, and as the variant's frame when a property is read.
`.impl({ … })` is the step; `.impl.implSeal(…)` is a step of the variant named `impl`. `Shape.seal(payload)` is the enum's
seal; `Shape.seal.create(…)` is the create of the variant named `seal`.

- Nothing was added to the types. Both the builder and the companion are intersections, so deleting the `Fault` line turns `{ impl: step } & { impl: frame }`
  into the intersection of a call signature and a frame. Adding `PrivateSeal` removes only the call signature
- At runtime, `resolving` wraps the functions of the object it receives in a Proxy. A property read first returns what the same-named variant frame
  holds. It hides the function's `name`, `length`, `call` and so on. The frame is created on first read.
  Companion members are not wrapped. Members cannot take variant names (`UnionMembers`), so they do not overlap
- Whether a variant exists is unknown at runtime, so `Shape.seal.create` returns a frame even on an enum with no variant named `seal`.
  The type does not show it
- lint's scanner already told them apart by syntax. In `.impl.implSeal(f)`, `variantOf` reads `.impl` as a variant

**Rejected: put the frame's properties directly on the function.** The call then bypasses the Proxy. Two options were measured.

| Option                               | Enum production gzip | Chain build | `seal` call  |
| ------------------------------------ | -------------------- | ----------- | ------------ |
| Wrap with a Proxy (adopted)          | +608 B               | 2.7 µs      | about +10 ns |
| `Object.assign(fn, frame)`           | +595 B               | 4.9 µs      | unchanged    |
| `defineProperties` on companion only | +626 B               | 6.8 µs      | unchanged    |

The baseline is +575 B, 2.1 µs, 145 ns (2 variants, 5 steps, Node 24). `Object.assign` throws at build when a variant named `seal` has
a member named `name` or `length`, because a function's `name` and `length` are not writable. The type could reject it, but that would add
a reservation in a change that removes reservations. `defineProperties` took 28.8 µs when also used for the builder (writing to
6 functions per step).

**`then`.** A variant frame is an object, and a Promise treats something as a thenable only when `then` is a function, so
a variant named `then` does not make the companion a thenable. So the proxy's `key === "then"` guard was also
removed (−9 B). Reading `then` returns the frame.

`then` as a member name was also unreserved, in three places: the Val and Trait types, and valof-lint's `RESERVED`. Awaiting a companion
does not happen in practice; if someone writes it and it breaks, that is the user's responsibility, outside what valof guarantees. The same reasoning as not guaranteeing
duplicate copies of valof (§2.1). Hitting it makes `await` hang without settling, with no error. One line was left in the JSDoc of Val's `.impl`.
→ Removed on 2026-10-26. Awaiting a companion is odd code, and thenable behavior is a general JS matter, not something valof should mention. In a Result or Option Val, `then` is a natural member name (`Result.then(r, f)`).

**`__proto__` is not protected either, 2026-10-26.** Val's `attach` put members on with `define`, leaving a member named `["__proto__"]`
as an own property. There was a test for it. Trait and Enum put members on by assignment in `duals`, so the same member
silently vanished. It is a name that becomes a member only when written as a computed key, and writing it is the user's responsibility. The same reasoning as
`then`, and the same for a variant named `__proto__`. Val now also uses assignment, and the test was deleted (§16.3).

Payload keys stay on `define`. Input from `JSON.parse` can carry a `__proto__` key even without malice.
With assignment, copying would lose that data and change the prototype.

**`_` and `Otherwise`.** If a variant is named `_`, `_` is that variant's handler. `Otherwise` is exported from `valof/experimental` as a
wildcard that works on every enum.

```ts
Shape.match(shape, { Circle: (c) => c.r, [Otherwise]: (rest) => rest.side });
```

- Its type is a `unique symbol`. An imported `[Otherwise]` enters the key set as a `unique symbol`
- Its value is `Symbol()`. The reason for rejecting `Symbol.for` (§2.1) applies here too: duplicate copies of valof cannot read each other's types either.
  Each `Otherwise` is a distinct `unique symbol`, so the other copy's `[Otherwise]` fails with "no such variant".
  `Symbol.for` would only let through calls that bypass the types, and it costs bytes too
- At runtime it is `handlers[tag] ?? handlers[Otherwise] ?? handlers._`. For a variant named `_`, `_` is a handler, so
  `[Otherwise]` is read first. `match` and `[Tag].match` go through the same function, `arm`
- Writing both `_` and `[Otherwise]` is a type error ("`[Otherwise]` handles the rest already"). Two wildcards in one
  literal are a mistake, and allowing them would let `[Otherwise]` silently win at runtime
- Two ways to write it are accepted. `[Otherwise]` is a rarely used escape hatch, treated like `Val.of`
- Cost: +11 B

Rejected spellings:

- `[_]` (making `_` itself a symbol): `match`'s `_` is written often, so an import in every calling file is a burden. The identifier `_`
  collides with lodash
- `"*"`: a variant name need not be an identifier (`Scope["*"]`). As an external tag it occurs more often than `_` (CORS, permission
  scopes, globs). The same reason `default` was turned down
- `[Symbol.for("_")]` without an import: inside an object literal its type widens to `symbol`, indistinguishable from `Symbol.for("typo")`
  (probed on TS 7.0.2). Accepting it would mean accepting any symbol key

**`match` stays where it is (reviewed 2026-10-25).** Callable frames also let `match` be told apart from a variant, so the reason to
move it to `Enum.match` is gone.

- Matching on a value stays `Shape.match(shape, { … })`. `Enum.match` would need an `Enum` import in every calling file
- Matching on the tag and the field name stay `Shape[Tag].match` and `Shape[Tag].key`. They need the `Tag` import, but
  both are rarely used. Since they do not show up in completion, `match`'s JSDoc `{@link}`s them so the hover gets the reader there
- Rejected: `Shape.tag().match(tag, …)` and `Shape.tag().key`. No import is needed, and the return value is a separate object, so APIs added
  later would not add reservations. But it needs `()`, writes `tag` twice, and shares the name of the `.tag("kind")` step with a different meaning.
  `Shape.tag()` also reads as returning the tag itself
- Rejected: `Enum.matchTag(Shape, …)` / `Enum.tagFieldNameOf(Shape)`, `Shape.match.tag(…)` (word order, and a collision with a member named `tag` on a
  variant named `match`), `Shape.matchTag`
- Probe (types): making `Shape.match` the intersection of `Match<E>` and a variant frame leaves data-first, data-last, the union return type
  and the error for a missing arm working as before

**Remaining reservations.** The members of an enum's `.impl` cannot take variant names or `match`. Trait members cannot take
variant names or `match`. They would compete for the same key on the companion, and splitting by call versus property access cannot separate them. `patch`,
`seal` and `create` (`Wired`) are rejected by every `.impl`.

**Measured.** Production gzip: Enum +575 → +608 B (budget +640 B, unchanged). type-perf: enum 32,988 → 33,184,
`index.d.ts` 78.73 → 78.94 kB.

### 15.3 `path`: composing patches across seals, 2026-09-10

#### What is missing

`patch` stops at a Val boundary (§6.8). To update a nested Val, you nest the calls by hand.

```ts
Team.patch(t, {
  lead: User.patch(t.lead, { wallet: Wallet.patch(t.lead.wallet, { balance: 5 }) }),
});
```

**The depth itself is not the problem.** A plain `map` and `u.profile.visits + 1` both read fine.

**The real hole: when a seal returns a Result, the calls do not compose.**

```ts
Wallet.patch(t.lead.wallet, { balance: 5 }); // Result<Wallet>, which User.patch cannot take
```

Arrays are worse. `map` produces a `Result<Todo>[]`, which has to be folded into a `Result<Todo[]>`.

**So the question to start from is not "do we need optics" but "how do we compose fallible seals
along a path".**

#### Where to put the marker

To stop, the composition has to know that a step failed. Under §6.3 the library does not know what a
Result contains, so it needs a marker. There are three options, and **we take the third.**

| Option                                     | How failure is signalled | Cost                                                                     |
| ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------ |
| Tuple `[V, undefined] \| [undefined, E]`   | Implicit marker          | Depends on §3.5. The default becomes a Result, which makes sealer moot   |
| The seal returns `err()`                   | Explicit marker          | Changes the seal contract. Rewrites §6.3, adds wiring and reserved names |
| **`abort()` as a rule of the composition** | Explicit marker          | **None**                                                                 |

**The third leaves the seal contract untouched.** A seal returns the user's Result as before. `abort`
belongs to `path`'s vocabulary and does not exist for anyone who does not use `path`. It is a
standalone export, so tree-shaking removes it (as measured for `dyn` in §15.1). It has no implicit
dependency on §3.5, and a normalizing seal (an `implSeal` that returns `V`) passes through unchanged.

**Rejected: make the tuple the default.** Discrimination would be sound, since §3.5 forbids
`undefined`. But **if the default return is a Result, `Val.sealer` becomes moot.** The value of
`sealer` is that it is a path that never fails. Forcing destructuring on every caller of a simple Val
is unacceptable.

**Rejected: the seal returns `err()`.** The success path stays as it is, which is good, but the
marker enters the seal contract. `implSeal` also serves normalization (§5), so registering a custom
seal does not mean the seal can fail, and no runtime flag can tell the two apart. Splitting the
wiring name (`implTrySeal`) makes the user state twice what the return type already says. This is
the same shape as §15.1's rejection of the two steps `implDefault` / `implFinal`.

**The name is `abort`, not `err`.** `err` collides with Result, and the return is not always a
Result. All it says is "stop".

#### The handler must come at the last step

**The reason is not ergonomics but whether it can work at all.** If the handler is bound early, its
type has to be **generic over the type constructor** of the user's Result.

```ts
{ open: <V, E>(r: ???<V, E>) => V | Abort<E> } // ??? cannot be written
```

**That needs HKTs.** TypeScript has none, so it would take defunctionalization with `TypeLambda` +
`Kind`, the layer Effect dropped in v4 (§17). At the last step the concrete types are all known, so
the problem goes away.

The handler receives **a union of concrete types, not a type constructor**
(`Result<Manager, E1> | Result<Wallet, E2>`), so it needs no HKT.

#### Shape

```ts
const managerWallet = path(Team).manager(Manager).wallet(Wallet);

managerWallet.glue(neverthrow).patch(team, { balance: 5 }); // Result<Team, E1 | E2>
managerWallet.glue(neverthrow).update(team, (w) => ({ balance: w.balance * 2 }));
```

**The value comes last.** Starting from `path(Team)` makes the path a value, so it **can be
reused**. Reuse is the point, because people want a lens when the same shape repeats.

**Making the user write a companion at each step is unavoidable.** Nothing can look up a companion
from a field name. The companions gather in one declaration, though, so callers never see them.

#### `glue`: `open` / `close`

```ts
export const neverthrow = {
  open: (r) => (r.isErr() ? abort(r.error) : r.value), // Result → V | Abort
  close: (v) => (isAbort(v) ? err(v.error) : ok(v)), // V | Abort → Result
};
```

**One object covers both directions.** No call can pass only one of them and produce a half-converted
value. `open` / `close` keep their physical meaning, so a non-native reader understands them too.
`read` / `write` leave the direction unclear.

**`close` is optional.** Without it, the call returns the union `V | Abort<E>`. This serves those who
want Go-style code and those writing their own glue.

**Ship ready-made glue in subpaths:** `valof/neverthrow`, `valof/effect`, and a tuple version. The
core still knows nothing about Result, so §6.3 holds, and users almost never have to write glue. This
extends §6.3's approach directly: **build on what the user has already chosen.**

**Rejected: `unwrap`.** `Val.unwrap` already means something else: a mutable copy of the payload.
**Rejected: `reads`.** It is not intuitive to a non-native reader (the user's own judgment). **"Glue
code" is an established term, and `glue` keeps its physical meaning too.** `via` was also a
candidate, but `glue` says more clearly that it connects things.

#### Put the path on the companion

A path is a value, so it can go in `.impl` and be shared under the namespace. **This fits the rule
that fixes `.impl`'s first parameter to the Val (§6.5).** A path's first argument is the root Val.

```ts
const Team = Val.companion<Team>().impl({
  raiseManager: (t, n) =>
    path(Team).manager(Manager).wallet(Wallet).glue(g).patch(t, { balance: n }),
});

Team.raiseManager(team, 700);
```

**The root's companion decides where the path goes.** A function whose first parameter is a
different Val does not fit in `.impl`.

```
Type '(u: User) => string' is not assignable to type
  '((value: Team, ...rest: any[]) => unknown) | NonFn'.
```

If the root is a different Val, put the path on that Val's companion. That is the right place for
it, so no special rule is needed.

**The root is always the companion being defined, so build the path inside the function.** At the
declaration site, `path(Team)` runs before `Team` exists. **The cost is negligible.** Each call
creates a few small objects, far cheaper than the seal's deep copy that follows (47 to 858 ns in §4.1).

#### A hole the types cannot close

The handler's return differs at each step, so **the types cannot require "given a
`Result<Manager>`, return a `Manager`".** Requiring it would make the handler generic, which leads
back to HKTs. A lint rule cannot do it either, because whether the body is correct is a question of types.

**The hole is contained.** A project has one handler, one line long, and every path through
`path` goes through it. If it is broken, the first test fails. The hole is not scattered. **With
ready-made glue, most users never reach it.**

#### Terminal and intermediate operations

**Add these.** The criterion is not depth but whether a seal is involved.

- **`update(v, fn)`**: update from the current value. It maps a value to a value, like `update` in
  §6.4, so **the names match**. Within one Val it is not needed (`u.profile.visits + 1` is enough),
  but across a Val boundary each step's seal has to be stacked again
- **`each`**: iterate an array. An intermediate step. A plain `map` reads fine, **but when a seal
  can fail, it becomes a fold over `Result<Todo>[]`.** The `abort` rule lets it stop at the first
  failure
- **`where`**: only after `each`. **If nothing matches, it does nothing** (iteration semantics).
  Attached to a single focus it would turn into a Prism, so it is limited to after `each`

**Leave these out.**

- **`get(v)`**: `team.manager.wallet.balance` is enough. Reading involves no seal. And **adding it
  starts the optics hierarchy** (get → set → compose → Prism). The line is drawn at "only what
  involves a seal"
- **Anything that only returns a function, such as `.patcher()`**: the path object is already
  reusable

#### Name

**`path`.** Rejected: `deepPatch`. **`patch` is already deep** (§6.2: "patch reaches any depth"),
so the name would suggest that the current patch is shallow. What sets `path` apart is not depth but
**whether it crosses a Val boundary.**

#### Two measurements remain

1. **The declaration budget.** 30.04 / 32.00 kB, 6% left. Do the path type and the type that
   collects the Errs fit? §6.2 has the measurement for making `patch` deep: at 3 levels,
   instantiations went from 120,281 to 177,885. The path type adds to that. **Measure with a probe
   before writing it**
2. **Inference for a union handler.** Does `(r) => (r.isErr() ? abort(r.error) : r.value)` accept
   the union and work structurally on both members? Does `r.value` resolve to the correct union?

#### Order

**Enum comes first** (§15.2). A focus on a variant (a Prism equivalent) will be wanted, so settling
`path` first would mean redoing it.

### 15.4 The callback form of `.impl`, 2026-09-10

**Adopted.** `.impl` takes a function as well as an object. The function receives **the associated
functions already defined at that point**, and destructures only the ones it needs.

```ts
Val.sealer<User>().impl(({ equals, patch }) => ({
  same: (u, other: User) => equals(u, other),
  renamed: (u, name: string) => patch(u, { name }),
}));
```

#### Motivation: referencing your own companion breaks inference

```ts
const User = Val.sealer<User>().impl({
  same(u: User, other: User) {
    return User.equals(u, other);
  },
});
// error TS7022: 'User' implicitly has type 'any' because it does not have a type annotation
// and is referenced directly or indirectly in its own initializer.
```

**Annotating the return type fixes it** (`same(...): boolean`). So today every member that uses the
Val's own `equals` / `patch` / `update` needs a return annotation. **It is a tax users hit early, and
the error message is hard to read the first time.**

The callback form breaks the cycle, so the annotation goes away.

#### Contextual typing still works, measured

Does the callback break §6.5's "the first parameter needs no annotation"? **It does not.**

`impl`'s contextual typing comes from the constraint (`M extends CompanionFns<V>`), and it still
reaches the object literal after the literal moves to the callback's **return position**. We read
the resolved type of the first parameter from TS2322.

```
error TS2322: Type 'User' is not assignable to type '0'
```

Return type inference does not cycle either. `b.same` resolves to `boolean` and `b.renamed` to
`User`.

#### Limit: sibling members cannot be referenced

The other members in the same `.impl` are still in the cycle, so a member that calls one of them
needs an annotation. The README should say so. Chaining `.impl` puts the earlier step's members on
`self` (see "Implementation" below). → The chain was closed on 2026-09-18. The annotation becomes the
only way (see "Closing the chain" below).

#### The set passed depends on context

- `sealer` has no `create` (§6.7 / `Sealer` in val.ts)
- The members from a trait depend on whether `implTrait` was called
- The type of `equals` depends on whether `implEquals` was called

This adds one overload, so measure with `vp run type-perf` before implementing it. The declaration
budget was raised to 64 kB (§16).

#### Rejected: replace the object form

**Keep both.** For a member that needs no associated function, destructuring a callback argument is
noise. Existing code would also break.

#### Implementation, 2026-09-18

→ This step's chain was closed later the same day (see "Closing the chain" below). What follows is
the record from before the closing.

**`.impl` does not close the chain.** Each call returns a companion with only `.impl` still open.
The earlier step's members are on `self`, so the sibling limit shrinks to "within the same call".

```ts
const User = Val.sealer<User>()
  .impl((self) => ({ renamed: (u, name: string) => self.patch(u, { name }) }))
  .impl((self) => ({ shouted: (u) => self.renamed(u, u.name.toUpperCase()) }));
```

**The reason to close was the seal, not the members** (§15.2). `implSeal` / `implCreate` / `fixed` /
`implTrait` stay closed after the first `impl`, so nobody can build a second constructor that skips
the checks of an exported companion. `impl()` (no argument) closes the member step too.

**Enum follows the same rule now.** Trait already had this shape, so all three agree: "only `impl`
stays open, and every other step closes at the first `impl`". The callback argument still differs:
Val / Enum pass the companion, and Trait passes only the finals (§15.1).

**The duplicate check reuses `Grown`.** The check that rejects a member with the same name as a trait
member also works for the earlier step's members unchanged. The message changes from "a trait
already answers to this name" to "something already answers to this name".

**`.impl` has two overloads, not a union.** Enum gets by with one signature, `G | ((self) => G)`,
but Val's parameter is `Grown<keyof T, M>`, an intersection that contains `M`. **Inside a union,
TypeScript 5 cannot infer `M`, and every first parameter falls back to implicit any** (7 passes;
confirmed on 5.9). §15.2 chose a union because "splitting into two overloads turns the error into
'the last overload does not match'". As long as we support 5.x, that choice is not available here.
We measured each of the following on 5.9.

| Parameter                                     | TS 5.9 |
| --------------------------------------------- | ------ |
| `Grown<keyof T, M>` (object only)             | Passes |
| `(self) => Grown<keyof T, M>` (callback only) | Passes |
| `Grown \| ((self) => Grown)`                  | Fails  |
| `Grown \| ((self) => M)`                      | Passes |
| `M extends CompanionMembers<V> & Grown<…>`    | Fails  |
| Two overloads                                 | Passes |

Dropping `Grown` from the callback side (row 4) would let a callback override a trait member. That
is a hole where `User.greet` and `Greetable.greet` disagree, so we do not take it.

**`implTrait` stays a union.** The `G` in `Implement<Tr, G, V>` comes from the trait-side argument,
not from a type variable this call infers, so it passes on 5.9 too.

**The code blocks in the README and the docs are checked on TS 5.9** (`docs/tools/twoslash`;
`vp run ts-compatibility` covers 5.9 / 6.0 / 7.0). The union we first wrote failed there. `vp check`
runs 7, so it had passed. **After touching a type, run `vp test` too.**

**`implTrait` takes a callback too:** `Implement<…> | ((self) => Implement<…>)`. The motivation is
the same as for Enum's `implTrait`: a trait implementation calls the Val's `patch` and constructors.

**Cost 1: in a call whose first argument is broken, the implementation loses contextual typing.**
This happens only when the trait companion side has an error. In a sound call, neither form needs a
first-parameter annotation (confirmed with TS2322). One test gained an annotation.

**Cost 2: the budget.** Production gzip went from 852 B to 930 B (**78 B**, paid by everyone who
imports `Val`). Instantiations went from 5,694 to 6,076 for core, 13,378 to 14,366 for trait, and
77,569 to 78,283 for enum. The trait budget was raised from 15,000 to 17,000. The increase comes from
relating the union twice per call, not from a blow-up.

**Rejected: curry members to use siblings.** The shape is `impl({ renamed: (self) => (u, name) => … })`.
While TypeScript infers `M`, `self: Sealed<V, M>` requires `M`, so `M` falls back to its constraint
and `self.renamed` fails with TS2349. `NoInfer<M>` and `M & ThisType<Sealed<V, M>>` behave the same.
A version without `M` in `self` passes reverse mapped type inference, so the self-reference breaks
it, not the currying. **In TypeScript, the chain is the only way.**

#### Rejected: block downstream `.impl` with types

`.impl` stays open, so another file can add members to an exported companion. That returns a new
object, and neither the original companion nor existing values change (close to Scala's scoped
extensions; no coherence problem like Rust's arises).

**2026-10-23: blocked with types.** A companion closed by `.build()` has no steps (§6.12 "Close the chain with `.build()`"). `detached-impl` was removed. What follows is the decision at the time.

**Do not block it with types.** Blocking it (one more step that returns a type without `impl`)
would create two kinds of chain. Instead, the lint rule `detached-impl` reports an error for any
`impl` not chained from `Val.companion` / `Val.sealer` / `Enum.*` / `Trait.companion`. The scanner
follows the chain from its start, so a detached `impl` **is invisible to it in the first place**.
With the rule, "a companion lives in one place" turns from an assumption into an invariant, and
`unused-member` and `companion-mismatch` keep counting correctly as they do now. This goes in the
same PR as Enum support in valof-lint.

#### Closing the chain, 2026-09-18

**2026-10-21: `.impl` no longer closes the chain (§6.12).** The chain was closed so that no seal step
would remain. Now the first step of the second half drops the first half's steps. `.impl` can still
be called only once.

**`.impl` is called once.** For all three, `Val.sealer` / `Val.companion` / `Trait.companion`,
`.impl` returns the companion, with no further step. Enum already had this shape.

**The multiple steps bought only one thing:** reading siblings without annotations. A single call can
do the same.

```ts
const User = Val.sealer<User>().impl((self) => ({
  renamed: (user, name: string): User => self.patch(user, { name }),
  shouted: (user): User => User.renamed(user, user.name.toUpperCase()), // passes
}));
```

Referencing the outer const creates a cycle, but the return annotation breaks it (the same mechanism
as in "Motivation" above). **The annotation is checked.** `(user): string => self.patch(...)` fails
with TS2322, so it is not the same as `as`. It is the same trade Rust asks for with recursive
functions.

**The TS7023 message guides the user:** "`'renamed'` implicitly has return type 'any' because it
does not have a return type annotation and is referenced directly or indirectly in one of its return
expressions." It contains both the fix and the member name.

**Trait changed the implementation's receiver from `ShapeOf<Tr>` to `Tr`.** This removes §15.1's
"3. TS2345 even for finals" at its cause. The finals a companion exposes take `Tr`, so an
implementation whose receiver was the shape failed at the argument. An annotation affects only the return
type, so no annotation could work around this. The receiver is contravariant, so rebinding to the
Val in `implTrait` still passes.

- Only **finals** can be called. A non-final is not a member of the companion (§15.1 "Rejected: putting overridable functions in the namespace"), so this is the same set the callback used to pass
- The callback form and `Finals` were removed. Since `.impl` closes after one call, the argument is
  always empty
- An implementation can no longer be called directly with a plain object. One test now goes through
  a Val

**Rejected: guide the user at the type level.** The idea returns
`Invalid<"annotate this member's return type">` for a member whose return type is `any`. The message
shows up in TS2322, but the `const` is `any`, so the mapped type references itself and **TS2615
always appears alongside it**. The errors go from 2 to 4, and the one the user cannot act on buries
the guidance. It also flags members that return `any` legitimately.

**Rejected: a lint rule for the guidance.** The condition is decidable from syntax alone (a member
that references the companion's name has no return annotation), but TypeScript detects it first. We
do not add a rule just for its wording.

**Measured.** Core 6,217 → 5,694, trait 14,511 → 14,291, enum 78,283 → 78,227, `index.d.mts`
36.27 kB → 34.72 kB. **The budgets stay** (§16's alarm policy).

**Keep `Grown`.** `T` carries the members `implTrait` registered, so the check against a member with
the same name as a trait member is still needed. `SealedSteps` and `CompanionSteps` were removed,
and dropped from `src/index.ts`'s exports too. The names users need are now `Sealed` and `Companion`.

**Enum closed the same day.** When Val and Trait closed, Enum alone still had `EnumSteps` /
`EnumSealerSteps` and multiple steps (they came in right after §15.2 "Add an object form to
`.impl`"). All three now agree that "`.impl` is called once". At runtime, `state` loses its `grows`
argument entirely, and `impl` looks only at `open`. Enum 78,283 → 77,569 instantiations, production
gzip 1.35 kB → 1.34 kB.

**The shape after closing.** The existing rule stays: `implSeal` / `implCreate` / `fixed` /
`implTrait` / `implVariant` close at the first `.impl`. What changed is that `.impl` itself is no
longer an exception to that rule.

**`self` was removed the same day.** When the chain closed, Val kept the callback form, because it
let members that call `patch` or constructors go without annotations. **A probe showed that annotating the return type
annotation route covered that case too.** Reference the outer const and annotate the return type,
and `patch` / `seal` / `create` / `nocopy` / constructor calls / sibling members / members registered
by `implTrait` all pass. Enum is the same. `Shape.match`, `Shape.Circle(...)`, and the enum's
companion from inside `implVariant` are all reachable.

```ts
const User = Val.companion<User>()
  .implTrait<Greetable>({ shout: (u) => u.name.toUpperCase() })
  .impl({
    loud: (u): string => User.shout(u) + "!", // a member implTrait added
    renamed: (u, name: string): User => User.patch(u, { name }), // wired by the library
  });
```

All `self` bought was skipping the annotation. **`.impl` / `implTrait` / `implVariant` now take only
the object form.** `implVariant` lost its second argument. Enum's `implTrait` took _only_ a
callback, so it now matches Val.

- **What we pay.** Every member that touches the companion needs an annotation. The `renamed` kind is
  the most common, so the cost concentrates there
- **What we buy.** One rule. The choice between "`self` or the outer const" disappears, and the docs
  lost the whole explanation of that boundary (siblings are not on `self`)
- In the types, `Takes2` is gone, and `Passes` / `Alone` lost their `Self` type argument. At runtime,
  `collect` and every `typeof fns === "function"` branch are gone

**Measured.** Core 5,694 unchanged, trait 14,291 → 13,721, enum 77,569 → 70,844, `index.d.mts`
34.72 kB → 34.03 kB. Production gzip 899 B → 852 B, with Trait 978 B → 932 B, with Enum 1.34 kB →
1.27 kB. Enum dropped 8.7% because the mapped type's inference paths over the union went down to one.
**The budgets stay.**

**Rejected: put non-finals in the trait's namespace too.** The argument was that with `self` gone, the Final
rule may no longer be needed. A probe showed the rule is still needed, for a different reason. In the types,
`TraitCompanion` is `Pick<MembersOf<Tr>, FinalsOf<Tr> & keyof G>`, so non-finals were never on it
(TS2339). Called at runtime with the types stripped, `Admin.greet(...)` returns `"Hi, ROOT"` even
for an `Admin` that replaced `shout`, not `"Hi, root!!!"`. **Reading from the trait's namespace
silently skips the Val's replacement.** The measurement led back to the same conclusion as §15.1
"Rejected: putting overridable functions in the namespace". Putting non-finals there would take more than widening the
type: it needs late dispatch to the receiver's companion. That is a separate change.

#### Step arguments become functions, 2026-10-26

**`impl` / `implTrait` take only a function with no parameters.** This covers `impl` on Val / Enum /
Trait, `implTrait`, and the steps of an Enum variant. The object form is not kept. A step takes a
function.

```ts
const User = Val.companion<User>()
  .implSeal((p, seal) => …)
  .impl(() => ({ renamed: (u, name: string): User => User.patch(u, { name }) }))
  .build();
```

- **What this overturns.** "`self` was removed the same day" above settled on the object form only.
  This change goes back to a single form, the function, for a consistent shape. `self` does not come
  back
- **The only grounds are consistency and appearance.** "A step takes a function" says it all. The
  shape of `implAssoc` follows the same rule. `() =>` separates the step's name from its contents
  (`.Circle.impl(() => ({`)
- **The annotation tax does not change.** A function with no parameters does not break the cycle. A
  member that references the companion still stops at TS7022 and TS7023 (with the member name), and
  passes with a return annotation. This is not the callback at the start of §15.4 (which passes
  `self`). Confirmed on 5.9 and 7.0. The first parameter's contextual typing, and the location and
  wording of the error for a violating member, are the same as with the object form
- **What we pay.** The `() => ({ … })` boilerplate. The lint scanner reads the function body. It
  reads `() => ({…})`, `() => held`, and a const that holds the function, but not a block body
- **The step calls the function.** Even if the call were deferred to `build`, it would still run inside the const's
  initializer, so users cannot tell the difference. → Changed the same day to calling it in `build`
  (see "Pass `seal`, `create` and `patch` to the function" below)
- **Type `this` as `undefined`.** The step argument's type gets `ThisType<undefined>`. Members are
  called without a receiver (`f(...args)` in `dual`), so `this` is `undefined` at runtime. The old
  type made the contextual object type `this`. In `implTrait`, `this.toWire(…)` passed silently and
  failed at runtime. In the other steps, it produced unrelated errors (`Cannot invoke…`,
  `Property … does not exist on type 'Shared<…>'`). Instantiations did not change, and `index.d.ts`
  went from 79.04 to 79.30 kB
  - **Rejected: a lint rule that allows only arrow functions.** What we want to prevent is state
    kept on `this`, and types can stop that. Method syntax is harmless as long as it does not use
    `this`, so it is not forbidden. The type also protects users who do not run the linter
  - A rule that warns on a block body in a step's function went on the task list (2026-10-26)

#### Pass `seal`, `create` and `patch` to the function, 2026-10-26

**The function passed to `impl` / `implTrait` receives the companion's `seal`, `create` and
`patch`.** `implAssoc` (§6.13) receives the same.

```ts
const User = Val.companion<User>()
  .impl(({ patch }) => ({ renamed: (u, name: string) => patch(u, { name }) }))
  .build();
```

- **What this overturns.** "`self` was removed the same day" above, and this section's "`self` does
  not come back". If `implAssoc` receives `({ seal, create })` but `impl` alone receives nothing,
  each step is written differently (the user's point). `implSeal` already receives it as
  `(p, seal) =>`. The rule fits in one sentence: "A step's function receives the library's functions
  as arguments. For names you wrote yourself (siblings, associated functions, trait members, Enum's
  `match`), reference the outer const and annotate the return type"
- **How this differs from `self`.** `self` passed the whole companion, and forced the docs to explain
  the boundary that siblings were not on it. This passes only the library's functions. The sibling
  boundary applies to `implAssoc` in the same way, so it is not an exception for `impl` alone
- **What is passed.** For a Val and a variant: `seal`, `create` (only with `implCreate`) and `patch`.
  For an Enum's union: `seal` and `create` (a union has no `patch`). Trait's `impl` stays `() =>`
  (a trait's companion has no gate). `equals` is a free function, so it is not passed
- **Passed even when private.** `PrivateSeal` / `PrivateCreate` close the entry point to outside callers,
  but the code the companion's author writes still receives them. This matches the `implAssoc` plan
  (pass `PrivateSeal`), and we decided to pass `PrivateCreate` too
- **`build` calls the function.** At the step, `seal` is not assembled yet. `build` creates the
  companion, then calls the function with it. At runtime this is `attach` for a Val, and `assemble`
  and `frame` for an Enum. `frame` builds the variant's frame with `attach`, so the variant's gates
  are passed along the same path as a Val's (on 2026-10-26 it stopped going through the
  `Val.companion` chain, §16.3)
- **Types.** For Val, `Supplied` (`CreateMethod & SealMethod & PatchMethod`). For Enum, `EnumSeal` /
  `EnumCreate` / `VariantSupplied`, cut out of the companion's type. `Passes` takes what is passed as
  its fourth type argument. A member that returns `patch(u, { name })` without an annotation gets its
  return type inferred (5.9 and 7.0)

**Measured.** Instantiations: core 6,579 → 6,486, trait 17,135 → 17,421, enum 33,184 → 33,092.
`index.d.ts` 79.01 kB → 79.04 kB. Production gzip: Val 855 B → 857 B, Trait's share +110 B → +112 B,
Enum's share +608 B → +617 B (23 B left of the 640 B budget). **The budgets stay.** The next PR
trims Enum.

**Measured.** Instantiations: core 6,486 → 6,573, trait 17,421 → 16,615, enum 33,092 → 33,552.
`index.d.ts` 79.30 → 80.33 kB. Production gzip: Val 857 B → 886 B, Enum's share +617 B → +628 B
(12 B left). **The budgets stay.**

---

## 16. Who owns which budget, 2026-09-10

**Bundle and types are separate concerns.** The script was split in two.

|                      | Measures                                                   | Kind                                |
| -------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `vp run bundle-size` | gzip of `dist/index.mjs`, for `Val` alone and with `Trait` | **Ratchet**. The bytes a user ships |
| `vp run type-perf`   | instantiations and the byte count of `dist/index.d.mts`    | **Alarm**                           |

`types raw` used to be in `scripts/size.ts`, but it is not a bundle. Not one byte of it enters a
user's bundle. It costs download and parse time, and the type checker does the parsing, so it
belongs in type-perf.

**The budget goes from 32 to 64 kB.** At 32 kB it worked as a ratchet, the exact shape type-perf's
docstring forbids.

> **This is an alarm for a blow-up, not a ratchet for creep.** A budget tight enough to catch
> [creep] has to be re-baselined on every change, and stops meaning anything.

It had done real harm. In the two cases in §15.1, we cut JSDoc twice to save bytes. That traded
explanation for bytes, the wrong way round. And in §9, both `path` (§15.3) and the callback form of
`.impl` (§15.4) were on hold as "measure before writing it", citing this budget. **It was blocking
design, not catching bugs.**

At 64 kB, Enum and path together still stay under it. What we want to catch is a multiplying
accident, and §14 has an example. Deriving `Finding` from `RULES` pulled in the rules' whole type
graph, and `dist/lint/index.d.mts` grew to 14.9 kB. That kind of accident is shallow and wide, so it
barely shows in instantiations, and the byte count catches it better. That is why the byte budget
stays.

**Time is not a budget.** It varies with the environment, so runs cannot be compared. type-perf
budgets only deterministic numbers, and prints `check (s)` and `total (s)` without checking them.
Byte counts are deterministic too, so they can be treated the same way. That is also why `types raw`
could move to type-perf.

**The `Trait` budget is written as an increment.** It went from 1600 B to `1280 + 256`. 1600 was
only a second rounded number. The budget should state "what someone who imports `Trait` pays extra".
Written this way, the relation holds when the core budget moves. The measured increment is 95 B
(1,147 → 1,242 B), nearly 3x headroom.

**The code had `+ 128`.** Fixed to `+ 256` on 2026-09-15. The decision was 0.25 kB, and "nearly 3x
headroom" in the same section matches 256 too (128 would give only 1.35x). The JSDoc in
`bundle-size.ts` said "a quarter of a kB" from the start. Only the constant disagreed.

**2026-09-15, measured again after merging main.** Removing `update` (#33) and replacing custom
equality with `equals` (#36) shrank the core, so the absolute numbers above moved. The increment
barely changed.

|                       | Before merge | After merge |
| --------------------- | ------------ | ----------- |
| `Val` production gzip | 1,147 B      | 710 B       |
| `Val` + `Trait`       | 1,242 B      | 804 B       |
| Increment             | 95 B         | 94 B        |
| core instantiations   | 9,632        | 5,674       |
| trait instantiations  | 12,514       | 12,727      |
| `index.d.mts`         | 31.4 kB      | 30.4 kB     |

**The tightest budget now is `trait` instantiations:** 12,727 / 15,000, 15% left. When Enum and path
arrive, this is the number they hit, not the declaration byte count. It is more than twice core's
5,674, but the two fixtures have different histories, so they cannot be compared (§16).

`index.d.mts` is measured the same way after the entries were split. The entry file itself is two
re-export lines, only 323 B, and the contents live in a shared chunk, so type-perf follows the
imports and sums them.

### 16.1 Measure increments from the measured core, 2026-10-15

**Writing `1024 + 256` did not keep the relation when the measured core grew.** Each entry's
measurement was compared with "the core budget + the increment", so each entry passed by borrowing
the headroom left in the core budget.

|            | Measured | Budget     | Increment over core | Nominal increment |
| ---------- | -------- | ---------- | ------------------- | ----------------- |
| `Val`      | 896 B    | 1024       |                     |                   |
| + `equals` | 1,083 B  | 1024 + 128 | **+187**            | +128              |
| + `Trait`  | 978 B    | 1024 + 256 | +82                 | +256              |
| + `Enum`   | 1,370 B  | 1024 + 384 | **+474**            | +384              |
| Everything | 1,633 B  | 1024 + 640 | **+737**            | +640              |

`.implCreate.noseal` (#65) grew the core by 44 B, leaving 31 B of headroom for everything and 38 B
for `Enum`. Every byte the core grows takes a byte from the headroom for everything. That contradicts
§16's "the relation holds when the core budget moves".

- **Compare only the core with its measurement.** For the others, compare
  `entry measured - core measured` with the increment budget. Only the core budget stops core
  budget alone
- **The increments were set again:** `equals` +256, `Trait` +256 (unchanged), `Enum` +640, everything
  +1024. Each has at least 26% headroom
- **The budget table prints the increment:** `added by Enum  +474 B / +640 B`

**Rejected: keep the mechanism and only raise the numbers.** That meant `Enum` at +512 and
everything at +768. Each time the core grows, they get tight again.

**Rejected: set `Enum` to +512.** It is a round number, but it leaves 38 B (7%), no better than
before the fix. `match`'s `_` adds runtime code, so that PR would have to raise it again.

### 16.2 The production check compares sizes, 2026-10-15

**The old check searched for strings.** It checked that the production core kept none of three
development strings such as `snapshotSealInput`, and that a bundle without `equals` kept no
`Number.isNaN`. When a function name or message changed, the check silently stopped working, and it
ignored new development code until someone added it to the list.

**`Number.isNaN` was not a marker for `equals`.** With `development` fixed to `true`, the check
reported "equals is still there" for a core that does not import `equals`. The development code uses
`Number.isNaN` too.

Now both checks compare sizes, with no dependence on a specific name or string.

| Check              | Fails when                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DevCodeKeptError` | The bundled source reads `NODE_ENV`, yet the production and development builds have the same minified size     |
| `AddsNothingError` | A bundle stacked on the base has a library part as long as the base's. The added import is already in the base |

- **Measure the library part as "chunk length - the entry's `renderedLength`".** The entry passes the
  imported names to `console.log`, so the whole bundles always differ by those names. Each module's
  `renderedLength` is its length before tree-shaking, and was 13,923 with and without `equals`. It
  is unusable
- **Check whether the source reads `NODE_ENV` before `define` replaces it.** It does not survive in
  the built code

We broke things on purpose to confirm it.

| How it was broken                                                      | Result                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Reference `equals` at the top level of `src/val.ts`, leaking into core | `AddsNothingError`                                    |
| Disable `define`, so both modes produce the same code                  | `DevCodeKeptError`                                    |
| Fix `development` to `true`                                            | The check passes. The source does not read `NODE_ENV` |

**What it misses: part of a development branch left in production.** If one check is missing its
`development` guard, the other branches are still removed, so the sizes still differ. The budget
catches only a leak larger than the core's headroom. With `development` fixed to `true`, the core
grew from 896 B to 1.65 kB, 670 B over budget.

**Rejected: drop the checks and rely on the budget.** The budget catches a leak larger than the
core's 128 B of headroom. Measured, the development code is about +790 B and `equals` +187 B. But
`equals` is only 59 B over the headroom, so raising the core budget by 60 B with no core growth would
let it through. The size comparison does not depend on the headroom.

**Names match the check's scope, 2026-10-16.** `BranchIgnoredError` became `DevCodeKeptError`. The
old name did not say which branch was ignored, or by what.

- **Rejected: `TreeShakingError`.** Tree-shaking removes unused exports and modules. Removing an `if`
  branch is dead code elimination, a different stage
- **Rejected: `DeadCodeEliminationError`.** This check looks only at development branches, not at
  dead code in general. The name is broader than what the check guarantees

### 16.3 Trimming Enum's production gzip, 2026-10-26

**After #92, Enum's increment was +628 B, leaving 12 B of the +640 B budget.** The budget stayed, and
the runtime code was trimmed.

|            | Before | After  | Budget   |
| ---------- | ------ | ------ | -------- |
| `Val`      | 886 B  | 899 B  | 1.00 kB  |
| + `Trait`  | +105 B | +101 B | +256 B   |
| + `Enum`   | +628 B | +465 B | +640 B   |
| Everything | +902 B | +735 B | +1.00 kB |

- **Share the steps.** `steps` in `val.ts` builds everything from `implSeal` to `implTrait`, and
  three places use it: the Val builder, the enum steps and the variant steps. The Val builder's state
  is gathered into one `Registered`, which `attach` receives. Val +20 B, Enum's increment -109 B
- **The variant frame calls `attach` directly.** Before, `frame` called the `Val.companion` chain one
  step at a time. Enum's increment -52 B more
- **`assemble` calls `duals` once.** -3 B
- **Share `isObject`.** Five object checks in `val.ts`, `isObjectShaped`, and Trait's `dyn`. Val
  -3 B, Trait's increment -10 B
- **Attach members by assignment.** Val -4 B. A member named `["__proto__"]` is not protected (§15.2 "Remove the reserved names")

Val grew by 13 B. Users who use neither Enum nor Trait pay it, in exchange for the maintainability of
defining the steps in one place (the user's decision).

**Rejected options.** The numbers are production gzip, measured on prototypes made by editing the
bundle by hand.

- **Do not share the steps, and only have the frame call `attach` directly.** Val -3 B, Enum's
  increment -50 B. Val does not grow, but Enum is left with only 62 B (10%)
- **Spread inside `steps`.** Val 912 B, 6 B heavier than the adopted form
- **Share trait composition between `attach` and `assemble`.** +5 B
- **Merge the two member loops in `attach` into one.** Smaller after minify, but Val +4 B in gzip
- **Attach members with `Object.assign(target, duals({ ...traits, ...members }))`.** Val +10 B,
  everything -7 B. We took the assignment loop, which shrinks Val
- **Have Trait's `companion` `build` go through `impl`.** +3 B

**Rejected: lower Enum's budget to +512 B.** That leaves 51 B (10%), below §16.1's "each has at
least 26% headroom". The other reason §16.1 rejected +512 (`match`'s `_`) went away in #91, but the
headroom criterion remains.

---

## 17. Effect v4, investigated, 2026-09-10

v4 has been an RC since 2026-08-12, with the code in `Effect-TS/effect-smol`. This covers only what
overlaps with valof's decisions.

### No typeclass package

v4's `packages/` does not include v3's `@effect/typeclass`. The peer dependency of
`@effect/typeclass@0.41.0` (2026-07-13) is still `effect: ^3.22.0`. The migration table maps only
two typeclasses.

```
@effect/typeclass/Semigroup -> effect/Combiner
@effect/typeclass/Monoid    -> effect/Reducer
```

`Functor` / `Applicative` / `Covariant` / HKTs are not in the table, and there is no "no
counterpart" entry for them either. Each typeclass that remains is one function over a single concrete type.

```ts
export interface Combiner<A> {
  readonly combine: (self: A, that: A) => A;
}
```

**What was dropped is the HKT layer, not the concepts.** The renames drop only the names and keep the
concepts. The evidence for why HKTs were dropped is circumstantial. TypeScript has no HKTs, so the only route is
defunctionalization with `TypeLambda` + `Kind`, and the details leak. An example is
[effect#3171](https://github.com/Effect-TS/effect/issues/3171): a hover that showed
`Option<ReadonlyRecord<string, B>>` on TS 5.4 showed `Kind<OptionTypeLambda, ...>` on 5.5, with no
change in the library. **We found no official statement of the reason.** All of the above is
inferred from the migration table. §15.3 puts `glue` at the last step to stay out of this layer.

### Equality lives in the value

```ts
export interface Equal extends Hash.Hash {
  [symbol](that: Equal): boolean;
}
```

A symbol-keyed method sits on the value. This is the opposite of §1. A JSON round trip does not give
back the same thing. `Data` offers only the two extremes. `Data.Class` has a prototype, and
`Data.taggedEnum` is plain but has no behavior. **The middle is empty.** §15.1's `dyn` (dynamic
dispatch while staying plain) fits there.

### The benefit of no classes, on the equality side

`compareObjects` sends a class instance without `[Equal.symbol]` to `compareRecords`. That compares
only the enumerable own keys, which opens two holes.

- **A `#` property is not even an own key.** It does not appear in `Reflect.ownKeys`. Two instances
  that differ there compare equal
- **Methods and getters live on the prototype.** Instances of different classes compare equal if
  their fields match

`structure()` in `hash` looks at the same key set, so it has the same holes. The escape hatches are
registering with `byReferenceInstances` or implementing `[Equal.symbol]`, and only users who notice
the problem use them. **valof stops it at the boundary.** §3 limits a payload to primitives, arrays,
plain objects and Vals, and in dev `assertPlainObject` throws. Users never have to make this decision.

### What they have and we do not

`Data.struct` has `Equal` / `Hash`, so it goes straight into a `HashMap` / `HashSet`. valof defers
Map / Set (§7.2, with the alternative in §8.1).

**Structural sharing is not a difference.** v4 added an `Optic` module. Optics and plain spread both
keep the identity of untouched branches (`{...s, a: {...s.a, b: v}}` already does). What valof saves is
effort; it adds no capability: one `patch` at any depth, with no optic declarations and no chain of spreads.

---

## 18. The shape of the package, 2026-10-19

**`Val` / `Enum` / `Trait` became namespaces,** the same shape as byethrow's `Result`. While they were objects, a
user's bundler cannot drop unused members. As a namespace, `Val.sealer` becomes a direct reference,
and unread members are removed.

To share the name with the type, import the namespace and export it together with a local type of
the same module.

```ts
// src/val.ts
import * as Val from "./ns/val.ts"; // export { companion, of, sealer, unwrap } from "../val.ts"
type Val<K extends string, T, Tr extends AnyTrait = never> = /* … */;
export { Val };
```

- **`export * as Val` and `export type { Val }` cannot coexist.** TS2300
- **`export type Val` and `import * as Val` do not merge either.** TS2395. Make it a local
  declaration and export it with `export { Val }`
- **`val.ts` and `ns/val.ts` import each other circularly.** Namespace members are read only at call
  time, so evaluation order causes no problem

### 18.1 tsc emits the runtime entries file by file

**Bundling with Rolldown makes it bigger.** The library build turns the namespace into an object with
getters (`__exportAll({...})`), and the user's bundler cannot drop its members. Measured, the base went
from 925 to 997 B (+72 B). `unbundle: true` still goes through `__exportAll`.

**Bundling the `.d.ts` changes type names.** The merged type and namespace become `val_d_exports`,
which shows up in users' type errors.

```
Type 'val_d_exports<"X", { a: number; }>' is not assignable to type '0'.
```

`index` and `experimental` are emitted by `tsc -p tsconfig.build.json`. The lint side stays on
`vp pack`. `customExports` adds the two to the `exports` that `vp pack` writes. In tsc's output,
`import * as Val` stays as written, and type errors still say `Val<…>` (5.9 / 7.0). Instantiations
do not change (core 5,814 → 5,810).

| Production gzip        | Before  | After   | Diff |
| ---------------------- | ------- | ------- | ---- |
| `sealer` + `companion` | 925 B   | 884 B   | -41  |
| + `Val.of`             | 939 B   | 906 B   | -33  |
| + the two `Enum` ones  | 1,418 B | 1,377 B | -41  |
| + `Trait.companion`    | 1,016 B | 973 B   | -43  |

The `Enum` and `Trait` increments barely change (-2 B or less), because every member only calls the
same internal function. We aligned them anyway. There is one shape, and members added later cost
only those who use them.

- **Rejected: `export const Val = ns`.** The namespace materializes as an object, growing to 979 B
- **Rejected: keep Rolldown, with a plugin that makes `src/ns/*.ts` separate entries and treats them
  as external.** The type and namespace merge would move to a type alias in `index.ts`, duplicating
  the JSDoc
- **Rejected: ship `.ts` instead of emitting `.d.ts`.** `skipLibCheck` does not apply to `.ts`, so
  the library's source would be checked under the user's settings. valof's types assume
  `exactOptionalPropertyTypes` (§3.5). Node's type stripping refuses `.ts` in `node_modules`

### 18.2 The bundle-size base is `Val.companion`

`Val.of` is an escape hatch, so it stays out of the base. `Val.of` and `Val.unwrap` were added to
every bundle. On 2026-10-21 `Val.sealer` was removed (§6.12), and the base became `Val.companion`
alone.

An entry reads a member, as in `Val.companion`. `console.log(Val)` keeps the whole namespace and
pulls in Rolldown's runtime too, measuring a shape that differs from users' code.

### 18.3 The declaration budget goes to 96 kB

tsc indents with four spaces, and tsdown used tabs. The same types went from 64.1 to 64.7 kB, 686 B
over 64 kB. Following §16's "what we want to catch is a multiplying accident", we raise it. Enum and
path (§15.3) would force a raise anyway.

- **Rejected: post-process leading spaces into tabs.** At 64,972 B it fits in 64 kB, but it saves
  only about 1.1 kB, and that affects only download and parse time
- **Rejected: minify the `.d.ts`.** Removing JSDoc brings it to 26.7 kB, but the hover explanations
  disappear. Squeezing only whitespace makes the declarations unreadable when go-to-definition opens
  them

### 18.4 The `internal/*` that users' declaration output references, 2026-10-25

**With `declaration: true`, exporting a companion was enough to make a user's declaration output
fail.** It happened with `moduleResolution` set to `bundler` and to `nodenext` alike. The inferred
type references types that no entry exports.

- Companions and builders of Enum, Trait and `implTrait` failed with TS2742 / TS2883, on
  `Unbound`, `Unsealed`, `CallBuildFirst` and others
- A companion given `PrivateSeal` failed with TS4094

**`exports` gained `"./internal/*": "./dist/*.js"`.** A user's declaration output then reads:

```ts
readonly dyn: import("valof/internal/val").CallBuildFirst;
```

The build regenerates `exports` in `package.json`, so the entry goes in `customExports` in
`vite.config.ts`. This subpath is outside semver, and users are not meant to import from it.

**It stays out of the user docs.** Its absence from the docs itself shows that it is not public API.
We first wrote "outside semver" in `api.md`, then removed it because it does not concern users.

**Rejected: export the referenced types from an entry.** Internal paths are easier to see as one line
in `package.json`'s `exports`. An entry's exports stay the list of public names. This was not decided
after a deep comparison.

**`PrivateSeal` and `PrivateCreate` became the classes themselves.** They used to be type aliases of
an unexported class (`PrivateSealPhantom`). Declaration output expands an alias without type
arguments into the class, and a user's `.d.ts` cannot name an unexported class, so it becomes an
anonymous class with a private member and fails with TS4094. `Unpatchable<K>` has a type argument and
is emitted as an alias (`[Unpatchable<"id">]`, confirmed on 7.0). `PrivateCreate` came in with the
same shape in #87, so it got the same fix.

The check changed too (§10.1).

### 18.5 Keep users' declaration output from cutting types to `any`, 2026-11-03

**On TypeScript 7.1, exporting `Trait.companion<…>().impl(…)` failed with TS7056.** When a printed
type nests deeper than 10 levels, 7.1 now reports an error where it used to silently write
`/*elided*/ any` (microsoft/TypeScript#64461, an intended change). In users' `.d.ts` on 5.9 / 6.0 /
7.0, that spot had become `any`.

**It happens only when a builder without `.build()` is exported with its inferred type.** A companion
after `.build()` was emitted by name even before the fix. Holding the builder under another name
triggers `companion-mismatch`, so in code that passes lint, the only case left is an export with the type's
name that forgot `.build()`. Code that uses it gets a type error with the `CallBuildFirst` guidance, but
in a file that only exports, TS7056 appeared on the definition line before the guidance.

- **Trait**: `TraitBuilder` was `{…} & (Open extends true ? { impl } : unknown)`. After `impl`, the
  intersection collapsed to one member and lost its alias name, so it was printed structurally.
  `implAssoc` returns itself, so each step nested one level deeper
- **Enum**: the variant steps (`Shape.Circle`, after `.Circle.implSeal(…)` and so on) had failed with
  TS7056 since 5.9. Each step's return was wrapped in an unexported alias `After`. A user's `.d.ts`
  cannot name `After`, so it expanded and nested. The fixture exported variant steps only in the
  shape closed by an enum step, so the failure was hidden

**The fix: make them print by name.**

- `TraitBuilder` became a conditional type that picks between two interfaces by `Open`:
  `TraitSteps` (the steps every state has) and `TraitImplStep`, which extends it and adds `impl`. A
  user's declaration shows `import("valof/internal/trait").TraitSteps<…>` (§18.4)
- `After` was removed, and steps return `EnumBuilder<…>` directly. `VariantSteps` is now exported
  (`valof/internal/enum`)
- Type cost did not change (trait +5, enum -12 instantiations, `index.d.ts` +0.19 kB). The
  declaration emitted for ts-compatibility's `declarations.ts` went from 16.9 kB to 8.2 kB

**Rejected: an `extends` in which `TraitImplStep` overrides `implAssoc` as well.** Redeclaring a
generic `implAssoc` that differs only in its return type in the derived interface fails with TS2430.
Instead, the base takes `Open`, and `implAssoc` returns `TraitBuilder<Tr, G, Open, …>`.

**What we lost.** Before `impl`, hovers and errors show the builder as `TraitImplStep<…>`, not
`TraitBuilder<…>`. The error for writing `impl` twice shows only the name `TraitSteps<…>`, not a
structure listing the remaining steps. We considered renaming it `TraitBuilderBeforeImpl`, but
showing the name `TraitImplStep` as it is reads more clearly (the user's decision).

**Rejected: stop exporting the builders in the fixture.** The TS7056 for a forgotten `.build()` would
remain, and we could no longer have a check that watches for depth truncation.

**Rejected: put `impl?: never` on the closed state so the intersection does not collapse.** `impl`
would show up in completion, and the error for calling it would no longer say it does not exist.

**Remaining expansion.** Once every variant step is closed (after `.impl` and so on), the `VariantSteps` intersection in `Shape.Circle`
has its `VariantSteps` intersection collapse to one member, so it is printed structurally. The steps
inside print by name as `EnumBuilder<…>`, so it does not nest, and it passes.

**The check.** ts-compatibility's fixture `builders.ts` exports every state of every builder with its
inferred type. If declaration output changes an export's type, the check fails that TypeScript line even with no compile error
(§10.1 "Declaration round trip"). At first the check searched the `.d.ts` for the string
`/*elided*/`.

**7.1 stays out of the ts-compatibility lines.** It is in beta. Once a stable release ships, it goes
into `aliases` as the latest version (§10.1). The spots that 7.1 turns into TS7056 appear as
`/*elided*/` on the earlier lines, so the check above catches them.

## 19. Pinning the valof the scripts use, 2026-10-25

**`#valof` resolves to a build of the commit that `valof-pinned-for-scripts-commit` in
`package.json` points at.** bundle-size and the other scripts are written with valof. Before, it
pointed at `valof-release` (0.9.1 on npm), and the scripts caught up only after a release.

```json
"imports": { "#valof": "valof-pinned-for-scripts" },
"devDependencies": {
  "valof-pinned-for-scripts": "link:node_modules/.valof-pinned-for-scripts"
},
"valof-pinned-for-scripts-commit": "<sha>"
```

- After `vp install`, `prepare` runs `scripts/pin-valof/index.ts`. It extracts the pinned commit with
  `git archive`, runs `vp run build`, and puts `dist` and `package.json` at the link target. It skips
  all this when the sha is unchanged. It runs `git fetch --depth=1` for a commit not present locally
  (the CI checkout has only one commit)
- `vp run pin-valof <rev>` moves the pin. The lockfile records only the link path, so moving the pin
  leaves the lockfile unchanged
- The pin exists for local work in progress. Even with a half-written, broken `src`, the scripts run on
  the pinned valof

**A diff of the build inputs between the pin and the working tree decides whether they match.**

```sh
git diff --quiet "$pin" -- src vite.config.ts tsconfig.json tsconfig.build.json
```

- Compare with the working tree, not HEAD. `dist` is built from the working tree. On CI the two are
  the same
- Include `tsconfig.json`. `tsconfig.build.json` extends it, and options such as `target` affect the
  output
- Leave out `package.json`. It holds the pin's hash, and changes with the version bump at release
  too. valof has no runtime dependencies, so leaving it out misses nothing

**ts-compatibility reads the scripts as fixtures only when they match.** It runs the scripts that
import `#valof` through type checking and declaration output on each line. When they do not match, it
only logs that it skipped them, without failing. Only a release PR (`chore/release-*`) requires the
match, with `--require-pin`. That makes the scripts catch up before the release.

- Copy the scripts into a work directory, with a `package.json` of
  `{"imports": {"#valof": "valof"}}`. `#valof` resolves through `exports` to `node_modules/valof` in
  the work directory. The work directory is inside the repository, so devDependencies such as
  rolldown resolve by walking up the parents
- The tsconfig extends the scripts' one (`nodenext`). Together with `bundler` for the book's blocks,
  this covers two resolution modes
- `*.test.ts` is not copied. `vp test` would pick up the tests in the work directory too

**Lint is out of scope.** Lint is part of the valof package and imports `src` by relative path.
`vp check` type-checks it against the current `src`.

**The hash goes in a custom field of `package.json`.** pnpm's `optimisticRepeatInstall` skips
`prepare` when neither the lockfile nor `package.json` changed. With the hash in a file under
`scripts/`, a pull or a branch switch could change the hash while `vp install` judges everything up
to date, and `vp check` would run against the old pin. `optimisticRepeatInstall: false` would run it every
time, but install goes from 0.16 s to 1.1 s. The cost is that the hash ships in the npm tarball.

**The name includes `pinned` and `for-scripts`.** This pin is what every `#valof` resolves to, in
`vp check` and bundle-size as well as ts-compatibility. `pinned` says that the scripts run on a valof
other than the current `src`.

#### Rejected options

- **A git dependency (`github:jo16oh/valof#<sha>`)**: `dist` is not committed, so every install
  needs a build. `prepare` runs only `vp config` and does not build. It would also need the full set
  of devDependencies, and permission in pnpm 11's `allowBuilds`
- **Publish each commit with pkg.pr.new**: CI does not need a build of the pin (when they match, it
  is the same as the current `dist`), so publishing has no point
- **Check that "the PR's last commit rewrites the pin to the previous hash"**: replaced by the
  `git diff` check. The `git diff` check passes even with docs-only or test-only commits stacked after the pin, and
  does not force a rewrite commit on a PR that does not affect the build
- **Do not pin, and always point `#valof` at the current build**: every PR that changes the API
  would have to update the scripts. When `src` is broken mid-work, the scripts would not run either
- **Require the match on every PR**: every PR that changes the API would have to update the scripts.
  Before a release is enough
- **ts-compatibility reads the scripts in place**: `#valof` goes through `imports` in the root
  `package.json` and resolves to the pin. Pointing it at the work directory's `dist` would need
  `paths` or a conditional `imports`. `paths` bypasses `exports`, and was hiding the problem in §18.4
- **Check out the pin with `git worktree`**: the worktree registration needs cleanup. Extracting into a
  temporary directory with `git archive` is enough

#### API friction found while updating the scripts

`report.bundles.filter(BundleSize.over)` tripped oxlint's `no-unnecessary-condition`. Lint looks at
the return value of the member's data-last form (a function, so always truthy). TypeScript accepts
it, so users notice only once they add the linter. The scripts wrapped it as
`(size) => BundleSize.over(size)`. → On 2026-10-27, the data-last form was removed from members that
take only a value (§6.11). The scripts can drop the wrapper at the next `pin-valof`.
