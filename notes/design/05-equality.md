# 5. Equality

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

## API

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

## Requirements for the default implementation

- Deep structural comparison
- **Independent of key order** (sort the keys, then compare). The Set representation in §8.1 needs it, and it is the correct behavior anyway
- **Ignore keys whose value is `undefined`.** `{ a: undefined }` and `{}` are equal. This makes a serialization difference between two paths unobservable when an `undefined` leaks in with EOPT off (§3.5)

## Constraint: a parent cannot call a child's custom equals

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

## Solution: construct in canonical form

A type that needs a custom equals **becomes correct under structural equality once its seal normalizes it**.

```ts
const Email = Val.companion<Email>().implSeal(
  (s: string, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

`Email` no longer needs `implEquals`, and a parent's structural comparison gives the right answer. Establishing invariants in a smart constructor is standard practice for value objects, so this constraint leads toward the right design.

`implEquals` itself stays, documented as "applies only to a top-level comparison, not when a parent compares". It is an escape hatch, not the recommended path.

## The `implEquals` spec

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

### Rejected: a bare companion or function as an array's spec

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

### Rejected: fold the spec into `deepEquals` (size reduction)

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

### Rejected: bind the seal for with / update in one helper

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

### Rejected: a free function `Val.eqBy`

The form `.impl({ equals: Val.eqBy({ ... }) })`. We do not adopt it, for three reasons.

1. **Inference becomes a gamble.** `V` would be inferred from the return type's context, and "inference from a contextual return type plus a mapped-type constraint" is a weak spot of TypeScript. In a builder step, `V` is already fixed, and the question disappears
2. **Added to `Val`, it cannot be dropped.** A bundler cannot drop a property of `const Val = {...}`, so users who never call it pay 181 B gzip (measured by adding `toEq` to the existing bundle). A standalone export could be dropped, but "which module do I import eqBy from?" would stay forever
3. **`equals` would have three forms** (hand-written / eqBy / default)

### Rejected: keep the wiring target in `.impl`

→ §7.7

### Allow omission? (yes)

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

### Rejected: forbid custom comparison on a plain payload

This option narrows the spec to "which children use their own equality, and which are excluded". A Val position accepts only a companion, and an unbranded position accepts only an exclusion marker (`Val.ignore`). It turns the §5 principle, that equality belongs to the type and is declared in one place, directly into types.

We do not adopt it, because the types cannot guarantee the other half of the principle. No type can say "require `implEquals` only when a nested child has a custom equals" (3 above). So tightening only the Val positions does not establish the invariant, and only reduces expressiveness. That also removes the value of adding one more sentinel, `Val.ignore`. `updatedAt: () => true` stays.

## Rejected: a runtime brand that `equals` compares, 2026-11-12

The idea was to give each value a private field holding its companion's symbol, so that `equals` tells apart two values with the same payload and different brands. `Val.of` builds a value without a companion, so it would be removed.

- **A boundary drops the brand, and nothing can restore it.** A private field does not survive JSON, `structuredClone`, `postMessage` or RSC props. A companion's seal restores its own brand, but valof has no runtime schema, so `Order.seal(JSON.parse(text))` cannot brand the `Money` inside. An `Order` built in the process and one parsed from JSON would hold the same payload and compare unequal. Treating a missing brand as matching any brand removes what the comparison was for
- **`patch` would have to carry the brand.** Merging a nested Val builds a new object, and a spread does not copy a private field, so `patch` would give each merged child the brand of the child it replaces
- **A primitive Val cannot carry one.** `Val<"UserId", string>` and `Val<"OrderId", string>` are strings at run time, so `equals` would tell brands apart for object Vals only
- **The types already cover the case.** The first argument of `equals` fixes the type of the second, so comparing two brands is a type error. Unions of objects are forbidden (§3.6), and an enum's variants differ by tag. What remains is a value whose type was erased or cast
- **`Val.of` is the constructor of a type without a custom seal (§2.2), and the lift at a boundary (§8.3).** Removing it would make a companion mandatory for every Val

**Also rejected: a check in `equals`, in development builds only, that throws on two different brands.** It would catch an incorrect cast, but the first three points still apply, so it could check only values that carry a brand.
