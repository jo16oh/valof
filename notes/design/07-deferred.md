# 7. What was deferred (and why)

Each of these follows from the one-line principle in §1.

## 7.0 Gating the constructor

See §6.1. Once `Val.sealer` took over generating the constructor, nothing needs detecting or replacing. A constructor that is never generated cannot be bypassed.

## 7.1 Freezing at run time

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

## 7.2 Map / Set

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

## 7.3 Date / Temporal

**Both are removed from the allowed types.** Use an ISO 8601 string (`string`) or epoch milliseconds (`number`).

`Date`:

- Its mutators write to internal slots, so `Object.freeze` does not stop them. That contradicts the claim of immutability
- Its JSON round trip is asymmetric: `JSON.stringify` turns it into a string, and `JSON.parse` does not turn it back
- The default deep equals would compare it by reference, so it would need special handling

Wrapping it in a custom type is rejected for the same reasons as §7.2. Besides, once the wrapper grows date arithmetic (`addDays` / `diff` / formatting), **valof is writing a date library**. Time zones, DST, month ends and locales are open-ended work, too much for a value-object library to take on as a side task. A thin wrapper with no methods gains nothing, because the caller takes the date out anyway.

`Temporal` is immutable, so it is less bad than `Date`. Still, it is a class instance, and its JSON round trip is just as asymmetric. Allowing it would still make an exception to "plain objects only".

Without them the allowed types are just `Primitive | Val | ReadonlyArray | Readonly<Record>`, so **one line explains them**. Users do date arithmetic with whichever library they like (Temporal / date-fns / Luxon).

The core feature already covers the need to guarantee an ISO string in the type (§8.2).

## 7.4 TaggedEnum (as in Effect.ts)

An ADT needs its discriminant **as real data**, which breaks the premise that the brand is a phantom.

Also, nearly all the value of an ADT lies in the quality of its pattern matching, and ts-pattern is already strong there. Interop with it makes more sense than competing.

Deferred for v1. If valof adds it, it goes in a separate entry point.

## 7.5 Result type

See §6.3.

## 7.6 Dispatching from a parent to a child's custom equals

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

### Rejected: the variant that wraps primitives in a custom wrapper

This variant works around reason 1 by wrapping a primitive payload in an object such as `{ raw, [Symbol.equals], [Symbol.val]: true }`. It removes reasons 1 and 4, but it is not adopted.

**It buys exactly one thing**: dispatching a custom equals to a child with a primitive payload. It does not reduce deep copying. Copying a primitive already costs nothing, so the wrapper has no copy to remove. For object and array children, the ownership tracking in §4.1 already solves sharing without changing the semantics, and a wrapper only adds the cost of creating it.

**What it loses.**

1. **The symmetric JSON round trip.** `toJSON` fixes the output side, but `JSON.parse` returns a bare primitive. Restoring the wrapper needs a schema-driven revive, which means a codec layer. The reason §7.2 rejected a custom immutable type applies again
2. **Reason 3 (asymmetric equality) remains.** Values from `Val.of` and from JSON stay bare primitives, so pairs where only one side is wrapped come up routinely
3. **It breaks the Map / Set idiom in §8.1.** `Record<UserId, T>` and `Set<UserId>` work because a Val is a bare string at run time. A wrapper compares by reference, so `map.get()` misses with an `Email` whose content is equal
4. **Silent failure at boundaries.** The cost of `.raw` is not the keystrokes. Every boundary needs it, and on some paths forgetting it raises no type error (template literals, `===`, `switch`, React's `key`, building a URL, SQL parameters)
5. **As a design, it is worse than a class.** A class with one equals on the prototype is faster and uses less memory than an equals reference under a symbol key on every value. §7.2 / §7.3 already rejected that class because of `structuredClone`, and the wrapper has the same problem, and is less efficient

Being plain data is everything that sets this library apart. Dropping it would make valof compete with Effect Schema / Data with 1/50 of their API surface.

## 7.7 Leaving `equals` / `patch` in `.impl`

**Rejected. `.impl` holds only what attaches to the companion as is.**

A function in `.impl` attaches to the companion under its own name. These two did not; the library wired them.

- Their return type is fixed (`equals` returns `boolean`, `patch` returns what the seal returns)
- `equals` has its third argument (`deepEquals`) bound, so the public signature drops it
- The companion's type removes them from `M` with `Omit<M, "equals" | "patch">`

This showed at run time as well: the `for` loop in `attach` skipped these two with `continue`. The principle that `.impl` passes everything through was already broken.

`seal` and `create` had their own steps from the start, and `.impl` rejects them with `never` (§6.5). One rule then covers all of them.

> **What the library wires gets its own step. `.impl` holds only what attaches as is.**

They did not go to the same place. `equals` moved to `implEquals`. `patch` **went nowhere. The means to override it was removed altogether** (§6.6). The `never` that rejects them in `.impl` stays for both. **2026-09-15: `implEquals` is withdrawn (§5).** `.impl` no longer rejects `equals`, so a member of that name can be written. Not letting the user override the default is one thing. Letting a function of the same name pass through is another. That function overwrites the default at run time.

## 7.8 bigint, 2026-10-28

**Removed from the allowed types.** An integer below 2^53 fits in a `number`. A larger one goes in a Val wrapping a decimal integer string (§8.6).

`JSON.stringify(1n)` throws a TypeError. bigint was the only allowed type that broke the symmetric JSON round trip §1 guarantees. `structuredClone` handles it, so only the JSON boundary breaks, and the exception appears only there. This is the same reason §7.3 removed Date.

The type error has its own message (`JSON.stringify throws on a bigint; use a decimal string`). The type was accepted up to v0.11, so the message points migrating users to the replacement. A bigint in a union (`number | bigint`) gets the same message. The check sits in the last branch of `ValidateValue`, so an allowed payload never reaches it. symbol and the other primitives still get "not a plain value".

No run-time check is added. The development check looks only at objects with a prototype, not at symbols or functions, and it ignores bigint too. A custom seal may take something wider than the payload (§6.7), so a seal that takes `string | bigint` and turns it into a string can be written.

**The cost.** Since the number is stored as a string, the user pays for the following.

- Comparing strings does not order the numbers correctly (`"10" < "9"`). A companion member converts back with `BigInt()` and compares
- The seal enforces the canonical form (`/^(0|-?[1-9]\d*)$/`), so that `"010"` and `"10"` do not fail `equals` as different values (the §5 principle of building in canonical form)
- Every operation converts with `BigInt()`

### Rejected: keeping it

The argument was that boundaries other than JSON (`structuredClone`, React state) handle bigint, so it does no harm to users who never go through JSON. Not adopted.

- Exempting the JSON round trip from "a value is plain data" makes the §1 guarantee conditional on "if it contains no bigint". That contradicts the reason Date was removed (§7.3)
- It fails late. The types accept it, and the exception appears only on serialization, often at a server boundary or when saving to localStorage
- The wrapping takes the same form as `Val<"IsoDate", string>` in §8.2, so the library needs no new mechanism

The ban on a top-level `null` (§9) is outside this change.

### Holes valof does not guarantee against: non-finite numbers and sparse arrays

With bigint gone, two kinds of allowed value still break the symmetric JSON round trip. Neither throws. Both turn into `null`.

```ts
type N = Val<"N", { a: number; xs: string[] }>;
const N = Val.companion<N>().build();

JSON.stringify(N.seal({ a: NaN, xs: new Array<string>(1) })); // {"a":null,"xs":[null]}
```

- `NaN` / `Infinity` / `-Infinity`. Their type is `number`, so the types cannot reject them
- Sparse arrays. `new Array<string>(n)` has the type `string[]`, and its holes are written out as `null`. The literal `[, "x"]` has the type `(string | undefined)[]`, which the types reject

**valof does not guarantee against these.** The types cannot tell them apart, so closing the hole would take a run-time check. Some users deliberately use `Infinity`, as an upper bound for example, so these cannot be removed from the allowed types the way bigint was. `-0` turning into `0` does no harm, because `equals` treats the two as equal (§5).
