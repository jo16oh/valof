# 4. DeepReadonly

A type defined with `Val` is DeepReadonly. The restriction in §3 stops the recursion after one level, so the cost is low.

## 4.1 The constructor owns (copies) its argument by default

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

### Neither types nor lint can close it

**TS has no linear or affine types.** There is no way to express "I took ownership of this argument", so whether the caller keeps a reference
is not written at the call site. How long `const raw` lives crosses function boundaries, so
valof-lint cannot see it either. Nobody checks a hand-written `[...arr]`, and forgetting it in one place becomes a silent aliasing
bug.

**The extra cost comes from not telling apart inputs that have no alias.** In `User({ id: "a", name: "bob" })`, nobody else holds that
object, so hand-written code would not copy it. valof pays 47 ns. The object is not in `owned`, so
the WeakSet does not help. It is a common call, and here the cost is pure waste.

### Removing the copy with `.nocopy`, 2026-09-15

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

### Ownership tracking: do not rebuild nodes we created

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

### Rejected: holding the ownership mark under a symbol key

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

### What production `nocopy` costs, measured 2026-11-11

valof-lint builds every AST node with `create.nocopy`. Converting `src/val.ts` (6,798 nodes) took 4.5 ms in production, and `adopt` took half of it. Measured with Node 24.21 / M-series, `NODE_ENV=production`, per object over 6,800 objects. `adopt` checks `owned` and then adds to `adopted`. The benchmarks approximate that with `has` + `add` on one WeakSet. Each table here and in the next section is a separate run. The long-lived WeakSet's figure varies between them, from 116 to 210 ns.

| Cost                                                           | ns/object |
| -------------------------------------------------------------- | --------- |
| `N.A.create.nocopy` on a variant, whole call                   | 166       |
| `has` + `add` on one long-lived WeakSet, as `owned`, `adopted` | 138       |
| `has` + `add` on a WeakSet made for this round                 | 46        |
| `Map.prototype.set`                                            | 27        |
| `{ ...payload, type }`, the spread `mint` uses to add the tag  | 5         |

**Registering in the WeakSet is about 80% of `nocopy`.** The set's age and size make it slow, not rehashing. A hash table rehashes only when it doubles, which costs constant time per entry on average.

| `has` + `add` on                                 | default | `--max-semi-space-size=128` |
| ------------------------------------------------ | ------- | --------------------------- |
| a WeakSet made for this round                    | 44 ns   | 43 ns                       |
| one long-lived WeakSet, its entries soon garbage | 210 ns  | 123 ns                      |
| a WeakSet holding 200,000 live entries           | 268 ns  | 204 ns                      |

- **Most of the gap is GC.** A long-lived WeakSet is in the old generation. Each young object registered in it is an ephemeron that every scavenge has to process. With fewer scavenges (`--max-semi-space-size=128`), it drops from 210 ns to 123 ns
- **The rest is the table's size.** With 200,000 entries it is still 204 ns with fewer scavenges, which points to cache misses

### Rejected: splitting the ownership WeakSets into small ones

The idea was a `Map` of small WeakSets, a new one every K registrations, each counting its live entries through a `FinalizationRegistry` and removed from the `Map` once the count reaches 0, for `owned` and `adopted` alike. `has` + `add` on a WeakSet made for this round takes 44 ns, against 138 ns on the long-lived one.

| Per object                                                 | ns/object | WeakSets alive at most |
| ---------------------------------------------------------- | --------- | ---------------------- |
| one long-lived WeakSet, as now                             | 116       | 1                      |
| `FinalizationRegistry.register` alone                      | 17        |                        |
| split every 1,024: `has` over every set, `add`, `register` | 4,354     | 1,993                  |
| split every 8,192                                          | 686       | 250                    |

- **A lookup has to check every set.** JS exposes no identity hash, so nothing tells which set holds an object. The common case in `adopt` is a miss (`owned.has` on a payload just built)
- **The sets are not removed in time.** A `FinalizationRegistry` callback runs after a GC, as a task of its own. No set is removed during a synchronous burst, such as converting one file, so the sets accumulate

**Rejected because JS exposes no identity hash: a B-tree or any ordered structure.** Objects cannot be ordered without an identity hash. Giving each one an id needs a WeakMap, which costs about what a WeakSet does, or a mark on the object, which "Rejected: holding the ownership mark under a symbol key" rejects. Holding the objects in anything but a WeakSet, a WeakMap or a WeakRef keeps them alive.

### A `patch` that changes nothing returns the value itself

Even with sharing, a no-op `patch` creates a new root, so the identity changes and a re-render runs. `patch` already loops once over the keys of the merged payload, so the identity comparison runs in that same loop. This matches Immer's `produce`.

- Caught: `patch(v, { name: same value })`, `patch(v, {})`, deleting a key the value does not have
- Not caught: passing a new child Val with an equal value. **Once it went through a constructor, being a new instance is the natural JS behavior**, so this is by design
- With a custom seal, the value still goes through the seal, because the seal owns the shape of the return value. The `copy` inside recognizes the value and returns the same node, so the identity of the `Result`'s contents is kept

The short-circuit skips the seal only for the default seal. §6.8's "every path to a value goes through seal" still holds for custom seals.

### Sharing creates diamonds, not cycles

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

### No interference with GC

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

### Split only the values you update into nested Vals

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

### Sealing nested Vals is enforced by types (except the `PayloadOf` hole)

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

## Known friction

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

## Benchmarks

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

## 4.2 Keep tuples

Tuple payloads used to be flattened by `DeepReadonly`. `ReadonlyArray<infer E>` also accepted tuples and flattened them into `ReadonlyArray<DeepReadonly<E>>`. `SeedOf` sits on top of it, so the APIs derived from it (`patch`'s patch, §5's `implEquals` spec) could not express per-position handling.

**`number extends T["length"]` separates arrays from tuples.** The tuple side is a homomorphic mapped type, so positions, length, labels and `readonly` are all kept. The same branch went into both `Validate` and `DeepReadonly`.

```ts
: [T] extends [ReadonlyArray<infer E>]
  ? number extends T["length"]
    ? ReadonlyArray<DeepReadonly<E>>
    : { readonly [I in keyof T]: DeepReadonly<T[I]> }
```

### Optional elements and `undefined`

Optional tuple elements (`readonly [string, number?]`) are allowed on the same footing as optional object keys. A missing element just makes the array shorter, and it round-trips through JSON. `readonly [string | undefined, number]`, on the other hand, is like putting `undefined` on a required key, so it is rejected (§3.5). An `undefined` in an array becomes `null` under `JSON.stringify`, which silently changes the value.

`Required<T>` tells the two apart inside the mapped type. Only optional elements lose `undefined`.

```ts
[I in keyof T]: undefined extends Required<T>[I]
  ? Invalid<"a tuple element cannot be undefined; use null or make it optional">
  : Validate<Exclude<T[I], undefined>>;
```

### Rest elements fall back to arrays

`readonly [string, ...number[]]` has `number` as its `length`, so the check falls straight to the array side. Positions are lost, but it is not unsound. **This follows from the criterion "is the length fixed"**, and fixing it would need a different check. Left as is until someone asks for it.

### The message improved too

Previously, a union of elements missed the `Function` branch and fell into the object branch, which gave `Invalid<"not a plain value">`. Now each position goes through `Validate`, so the wording matches arrays.

```
Val<"InTuple", { t: readonly [string, () => void] }>
  → readonly [string, Invalid<"functions are not allowed">]
```

### Cost

Measuring the same payload shape as an array and as a tuple, 200 types × 3 levels: Types +69 / Instantiations +147 (0.06%). An identical tuple type is instantiated only once, so what matters is **the number of distinct tuple types**. Payloads without tuples change by +0.01%, and the runtime is unchanged.

As a type, this is a breaking change, so it goes into 0.3.0. For a type with a `readonly [A, B]` payload, assignments that used to pass as `ReadonlyArray<A | B>` no longer pass.

## 4.3 Open `Rec`

`DeepReadonly` opens `Rec<V>` to `V`. This is the one place where §3.7's marker disappears from the value.

```ts
export type DeepReadonly<T> =
  IsRec<T> extends true ? (T extends Rec<infer V> ? V : T) : DeepReadonlyValue<T>;
```

### Detect by key, not by assignability

`[T] extends [Rec<unknown>]` reads `Rec<Tree>`'s type argument. That is exactly the resolution `Rec` defers, and it gives
TS2615 at `Val.sealer<Tree>()`. Checking by key does not touch the type argument.

```ts
type IsRec<T> = string extends keyof T ? false : keyof Rec<unknown> extends keyof T ? true : false;
```

An index signature matches every key, so it is excluded first. Otherwise `Record<string, Money>` is detected as `Rec`
and passes through unvalidated.

### Drop `undefined` from optional keys before descending

An optional key's type arrives in the form `{ at: Rec<Tree> } | undefined`. As a union, the walk stops one level
short, and the inner `Rec` does not open. The value never holds `undefined` (a key is either present or absent, and §3.5 rejects
`undefined` on a required key), so it is dropped before descending.

```ts
readonly [K in keyof T]: DeepReadonly<Exclude<T[K], undefined>>;
```

### Array detection moved to `keyof`

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
