# 6. Smart constructors and updates

## 6.1 A constructor that does not exist cannot be bypassed

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

## 6.2 `patch`

**There is no free-function `Val.patch`.** The runtime cannot identify the type, so it cannot dispatch to that type's seal. `patch` is a method on the companion instead.

```ts
User.patch(user, patch);
// internally, returns seal({ ...user, ...patch }) as is
```

- No custom seal → it goes through the default seal (a copy), so it returns `User`
- A custom seal → it returns `ReturnType<typeof seal>`

This closes the hole where "`patch` bypasses the smart constructor". It is part of the §6.8 invariant that every path that creates a value goes through the seal.

### No `patch` on a primitive or array Val

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

### `undefined` in a patch means "delete"

| patch form         | meaning     |
| ------------------ | ----------- |
| key left out       | leave as is |
| `{ k: undefined }` | **delete**  |
| `{ k: value }`     | set         |

A patch is a `Partial`, so leaving out a key already expresses "leave as is". If `undefined` meant the same, **the same operation would have two forms, and nothing would express deletion**.

§3.5 removed `undefined` from the value space, so it is **the only value usable as a sentinel**. That one sentinel goes to "delete", which has no other way to be expressed.

The implementation gets simpler too. Spreading `{ ...user, ...patch }` produces "the key exists and its value is `undefined`", so **dropping the `undefined` keys after the merge is the deletion**. The patch needs no cleanup before the merge.

For reference: JSON Merge Patch (RFC 7386) uses `null` to mean deletion. This library allows `null` as a legitimate value, so it cannot do the same, but the idea of using a value outside the value space as the deletion sentinel is shared.

### Guarding against accidental deletion

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

### A patch reaches any depth

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

### Only an existing node can be merged

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

### The run-time boundary is `owned`

The brand is a phantom, so the runtime cannot read "this is a Val". It can read only where a node came from, and the copy in §4.1 already records that.

**An owned node is a value, not a patch, so it is replaced, not merged.** This is the run-time counterpart of "stop at a Val" in the types. The same rule replaces an existing subtree passed in, as in `{ owner: other.owner }`. That matches the intent.

In a payload that lost its record (one that went through `structuredClone` or a JSON round trip), a nested value falls back to a merge. The only breakage is "a replacement that leaves behind optional keys it should have removed", and correctness otherwise holds. The right fix is to seal the payload again before passing it.

### Cost: a nested object cannot shrink

With merge as the default, an object cannot be replaced with one that has fewer keys. The Record-as-Map pattern in §8 suffers most.

```ts
Shop.patch(shop, { staff: computed }); // old entries remain
Shop({ ...shop, staff: computed }); // replacement goes through the constructor (§6.4)
```

No new API is added. `patch` merges plain objects all the way down and deletes with `undefined`. Replacing the whole value uses the paths that create values.

`{ staff: { u1: undefined } }` deletes a single entry, so the Map use case is easier to write than before.

### How the name became `patch`

Renamed from `with`. A breaking change in 0.4.0.

`Array.prototype.with` (ES2023) and the Records & Tuples proposal use `with` with the same meaning, so `with` looked right as JS vocabulary. **It reads correctly only when there is a receiver.**

```ts
arr.with(0, 9); // "arr, with index 0 set to 9"
Order.with(order, {}); // the preposition's subject moves into an argument and is left hanging
```

§1 decided to keep behavior outside the value, so a companion's first argument is the value. A word made for method syntax cannot be carried over unchanged.

`patch` is an imperative, so its verb form matches `equals` / `create` / `seal` / `of` / `unwrap`, and the name matches the argument type `Patch<T>`. A function named `with` no longer takes a `Patch`.

**The word also means a partial update, which is a further benefit.** HTTP `PATCH`, JSON Merge Patch (RFC 7386) and `git patch` all mean "apply a diff instead of sending the whole", which matches the deep-merge implementation. `with` said nothing about partial or whole. Only the deletion sentinel differs: `null` in merge patch, `undefined` in valof (§3.5).

### Rejected: the past tense (`patched`)

This option shows immutability in the name.

- **The companion form does not sound mutating.** `user.patch(...)` looks as if it changes the receiver, but in `User.patch(user, p)` `user` is an argument, and nothing in the call reads as the thing that changes. Nobody reads `Object.keys(x)` as changing `x`
- **The past tense helps only when a mutable twin exists.** Python's and Swift's `sorted()` mean something because `sort()` sits next to them. valof has no twin, so the name only makes the reader ask "is there a mutable version somewhere?". Scala's case class uses `copy()`, not a past tense, too
- One member alone would be a past participle, breaking the consistent verb form

### Rejected options

- **An updater function as a patch value** (`{ profile: (p) => ... }`). The sugar works for one level only, and the same operation gets two forms
- **A path API** (`patch(u, "profile.name", x)`). Template literal types slow type checking and use up the d.ts budget, and the API grows. A v2 candidate

### Cost

Production gzip +43 B, d.ts +0.52 kB. The existing loop in `patch` becomes the recursive function `patched` as is, so the net increase is small.

At every level, `patched` returns the original node when nothing changed, so it preserves reference identity at a finer grain than before.

## 6.3 No Result type

neverthrow, Effect and fp-ts already exist, so this library does not provide one.

**`patch` works without one.** `patch` does not need to unwrap the seal's return value (the old value is already valid, so it merges and passes the result to the seal). Inferring the return type as `ReturnType<typeof seal>` is enough, and the library never needs to know what is inside a `Result`. It works with any Result implementation, home-made ones included.

## 6.4 Remove `update`

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

## 6.5 Fix the first parameter of a method to the Val (`impl` / `implSeal`)

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

### Only "a single function type" works

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

### Constructors go to `.implSeal` / `.implCreate`

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

### Writing a wiring target in `.impl` is a type error

With a primitive payload, `V` can be assignable to the first parameter's type (`seal(n: number)` for `Val<"Age", number>`). Then **the function passes the constraint and is added as a plain method, and `patch` is not wired to it** (for `create`, **a creation path that skips the seal appears**). It is a silent accident, and we hit it during the migration. Declaring `seal?: never` / `create?: never` rejects it.

We also tried putting a message in the type (`seal?: "use .implSeal() …"`), but chose `never`. The error text reads worse. The optional modifier makes the type `never | undefined`, so TS says:

```
Type '(n: number) => Age' is not assignable to type 'undefined'.
```

Where the only place for information is a parameter type, an embedded message is needed. Here the key name `seal` itself shows what the user tried to do, and `implSeal` sits right next to it in the API. We prefer the form that states the type's intent directly ("`seal` cannot go here").

`equals` / `patch` are `never` for the same reason. The accident takes another shape for them: **the member is added, but the wiring is lost** (the third argument of `equals` never arrives, and the return value of `patch` skips the seal). §7.7 explains why they moved to dedicated steps.

**Keys that start with `__valof_` are `never` too.** Besides the five names, the type declares ``[key: `__valof_${string}`]: never``. `attach` sets `target.__valof_traits = traits` before registering the members, so `.impl({ __valof_traits: fn })` would overwrite the record, and none of a `dyn` box's members would be bound (measured: `Greetable.dyn(...).greet is not a function`). `Declarable` on the `Trait` side rejects the same prefix, so adding internal keys adds no checks.

**The `impl` prefix also belongs to the library.** `.impl({ implTrait: fn })` overwrites nothing, because `.impl(fns)` builds and returns a new object from `base()`, and the step methods are not assigned to it. The types `Sealed` / `Companion` have no steps either. The chain has ended, so nothing can collide. It is rejected anyway, because `User.implTrait(u)` reads as a step. Reserving the whole prefix means a new step never collides with a user's name. `fixed` is not rejected. It is a legitimate member name, as in `Money.fixed(m)`, and nothing can collide with it.

### No `implSeal` on a sealer

**2026-10-21: the sealer itself is removed (§6.12).**

**A sealer is the default seal itself.** A checked seal next to it would turn the first seal into "a hole that bypasses the check" (§6.1). `implSeal` is for a companion only.

### `implSeal` is not required

Should `Val.companion<V>().impl({…})` be allowed without a custom seal? **Yes.**

1. **Requiring it closes no hole.** `Val.of` is public API, and `Val.of<Age>(-1)` passes whether or not a seal exists
2. **It cannot be made consistent.** `Val.companion<V>()` is already a usable Companion as is (with `equals` / `patch`). Requiring a seal on `.impl` alone leaves the earlier step open
3. **It forces a fake seal.** A pass-through rubber stamp, `(v) => Val.of<V>(v)`, appears. A seal that reads as validation and does nothing is worse than no seal

A companion without a custom seal is a meaningful form too. For a type whose values come from a boundary (a decoder, a DB row, an external API), the right design bundles only behavior, has no constructor, and builds values with `Val.of`.

### No omittable parameters

A member with no parameters, an optional parameter, a default parameter or a rest parameter is a type error. Members are dual, so a call that leaves out an argument cannot be told apart from data-last (§6.11). A trailing `a: T | void` counts as optional. `a: T | undefined` is accepted.

### What is lost

A helper factory whose first parameter is not the Val (`Money.fromCents(n)` / `IsoDate.parse(s)`) cannot go in `.impl`. It is not "behavior on a value", so it makes more sense as a separate plain exported function. A constructor with several parameters (`Point.create(x, y)`) is covered by `implCreate`, so it is unaffected.

→ On 2026-10-26, the `implAssoc` step made room for these (§6.13).

## 6.6 `patch` cannot be overridden

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

### Rejected: `implPatch` (added once, then removed)

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

## 6.7 Separate seal and create

The default `patch` still had a hole the types could not close. "The constructor accepts the payload" is **a necessary condition, not a sufficient one**.

```ts
.implSeal((input: Fields): User => make({ id: crypto.randomUUID(), ...input }))
```

`SeedOf<User>` (`{id, name, email}`) is assignable to `Fields` (`{name, email}`), so the types accept `patch`. But what actually runs is `seal({ id, name, email })`, and this function discards the `id` it receives and assigns a new one. **The ID changes on every call, with no type error.**

The structure cannot reject this. Requiring "the argument is exactly the payload" would rule out `seal(input: object)`, a legitimate zod form. `object` and `Fields` are both proper supertypes of `SeedOf<V>`, and nothing tells them apart.

### Convention: a seal is idempotent (generation goes to `create`)

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

### Upper bound on the seal's argument: it must not accept `string`

`SealImpl<V>` sets only the lower bound (it must accept `SeedOf<V>`). `CheckedSeal<V, G>` checks the upper bound separately and makes it **a type error when the parameter accepts `string`**.

```ts
.implSeal((json: string, seal) => seal(JSON.parse(json))); // type error
.implSeal((input: unknown, seal) => seal(schema.parse(input))); // type error
.implSeal((input: object, seal) => seal(schema.parse(input))); // OK
```

`patch` passes the payload back to the seal (§6.8), so a wire-format decoder in the seal breaks the moment a value is derived from another value. The check rejects `unknown` and `{}`. `object` and `Record<string, unknown>` are wide enough for a schema library.

A Val whose payload is itself a `string` (`Val<"Email", string>`) is exempt. The types have no way to tell the payload from the wire format.

### A seal returns synchronously, 2026-10-14

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

### No `create` on a sealer

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

## 6.8 Make the seal the only gate

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

### The seal's argument stays immutable, and `Val.of` copies once

We once implemented a mutable seal argument (`PayloadOf<V>`), with the public `seal` deep-copying at the entry. The reasons were that normalization could `sort` an array, and that the payload could go to someone else's function that requires a mutable type. We dropped it:

1. **It becomes an immer-style mutable draft.** That contradicts the style of deriving values from values
2. **ES2023 made it unnecessary.** With `toSorted` / `toSpliced` / `patch` / `toReversed`, normalization can derive instead of mutate
3. **It copies twice.** The deep copy at the entry adds to the deep copy in `Val.of` at the end

With the argument back to `SeedOf<V>`, **the copy at the entry is not needed at all**. A seal that receives a readonly argument does not touch the caller's object (unless it casts), and `Val.of` takes ownership. Without a custom seal, the default seal (`copy`) makes that one copy.

What is lost: passing the payload as is to someone else's function that requires a mutable payload. Put `Val.unwrap` or a spread in between (§4).

The type of the public `seal` is the registered function itself. The zod form (`seal(u: object)`) still accepts wide input.

### Paths and copy counts

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

### Pass the default seal as the second argument

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

## 6.9 How the name became `seal`

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

## 6.10 `fixed`: keys excluded from the derivation paths

**On 2026-10-22, this moved to the companion type argument `Unpatchable<K>` (§6.12).** What follows records the time when it was a step.

The §8.4 pattern, keeping the `id` that `create` generated away from the derivation paths, could be written only by **overriding `patch`**. The override's body did not differ from the default by a single character. **Its only content was the patch type.** §6.5 / §6.6 decided "do not make people write rubber stamps", yet the most frequent pattern forced one.

A declaration step is added.

```ts
Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal(seal)
  .fixed<"id">();
```

### Keys are passed as a type argument (they do not exist at run time)

Passing the key as a string, `fixed("id")`, would make it known at run time too, but we chose the type argument alone. That matches the brand being a phantom, and the guarantee is the level §8.4 already accepts ("ordinary update paths cannot touch it. `Val.of` can forge it"). Restoring the old value at run time when the types are bypassed (through `any`, for example) would also hide bugs.

With `update` removed (§6.4), nothing remains at run time. The patch argument of `patch` becomes `Patch<Omit<SeedOf<V>, K>>`, a type-only operation.

### Name

It went through `implProtect` / `implFinal` / `implMinted`, became `unpatchable`, and was then renamed `fixed`.

- No `impl` prefix. `impl*` means "provide an implementation of X", but this step passes no function and only declares something about the type. **Names should tell steps that provide implementations apart from steps that declare properties**
- `final` brings in JVM vocabulary (`final val` / `sealed abstract class`) and invites misreading `seal` as in `sealed trait`. `finalize` reads both as a GC finalizer (`FinalizationRegistry`) and as the end of a builder (`.build()`)
- `minted` fits the role of `create` best, but its meaning is unclear on a type without `create`, and readers outside the English-speaking world find it hard to understand
- `unpatchable` takes its meaning only from the already public `Patch<T>`. It brings in no new metaphor and promises no more than it does

### `unpatchable` → `fixed`

When `with` was renamed to `patch` (§6.2), the stems collided. `unpatchable` restricted both derivation paths of the time, but the old name read as blocking only `patch`. That reading lets through the very forgery it was meant to prevent.

`fixed` shares no stem with `patch` and does not depend on whether `create` exists. It belongs with fixed-point and fixed rate, so it suggests neither inheritance nor visibility.

**It stays an adjective.** The decision above still holds: this step passes no function and only declares a property, and its name sets it apart from `impl*`, which provides implementations. `fix` would be an imperative and erase that distinction, and `.fix()` in a chain reads as "repair".

- **`final`**: still rejected as above. §6.9 names, as `seal`'s remaining risk, JVM vocabulary leading readers to misread `seal` as `sealed trait`, and `final` amplifies it
- **`lock`**: imperative and not misread, but only one boolean remains at run time, so "lock" promises too much
- The internal type `Patchable<V, P>` is renamed `Derivable<V, P>`. It is the surface of all derivation paths, so it should not carry the stem of one of them
