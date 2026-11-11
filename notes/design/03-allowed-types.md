# 3. Allowed types

The constructor and `Val.of` accept only the following types.

```ts
type Primitive = string | number | boolean;
```

`undefined` is not allowed as a value (§3.5). Neither is `bigint` (§7.8).
`null` is allowed inside objects and arrays but not at the top level (§9), because its intersection with the brand
is `never`, so it cannot be told apart as a distinct Val.

**Plain nested objects are forbidden. Nesting must always be a Val.**

## Why this restriction

1. **Lower inference cost.** The DeepReadonly recursion stops after one level (children are already readonly Vals). Conditional types stay shallow, so `tsc` stays fast
2. **Structural equality is well-defined.** There are no prototypes or cycles to consider
3. **Values always pass serialization boundaries.** `structuredClone` / JSON are always safe
4. **It pushes the design the right way.** Composing Vals is mandatory, which leads to a sound DDD-style structure

`ReadonlyArray` and `Record` are defined recursively. Without that, `readonly string[][]` (matrices, grids) and `Readonly<Record<string, Val>>` (ID indexes) could not be written. Each node is shallow, so the recursion does not make the cost blow up.

## Do not write `readonly` in a payload

`Val<K, T>` is `DeepReadonly<Checked<T>>`, so a payload written as mutable becomes readonly too, whether it is an array, a tuple or an object. So does `SeedOf`, and so do `Patch` (via `Derivable`) and `EqImpl`, which build on it. The API is the same whether the payload writes `readonly` or not.

**Writing it costs you.** `Val.unwrap` returns `PayloadOf<V>`, which is the type as written.

```ts
type R = Val<"R", { tags: readonly string[] }>;
Val.unwrap(v).tags.sort(); // ✗ readonly string[] has no sort
```

The purpose of unwrap, "a mutable copy to pass to code that does not know about readonly", is defeated by the `readonly` in the definition. The docs used to recommend `ReadonlyArray` / `Readonly<Record>` in both the allowed-types table and the examples, so both now use the plain form.

## Migration friction

Plain nested objects from API responses or existing code cannot be passed as is. The seal has to assemble the child Vals.

## Wrapping primitives directly

```ts
export type IsoDate = Val<"IsoDate", string>;
```

An important use case (§8.2).

## 3.5 `null` and `undefined`

|                        | Verdict                                         |
| ---------------------- | ----------------------------------------------- |
| Nested `null`          | Allowed                                         |
| Top-level `null`       | **Forbidden**                                   |
| `?` (absent key)       | Allowed                                         |
| `undefined` as a value | **Forbidden**                                   |
| `undefined` in a patch | Reserved to mean **delete the property** (§6.2) |

### Why "no `undefined` as a value" rather than "no `undefined`"

Only "the key exists but its value is `undefined`" breaks.

```ts
JSON.parse(JSON.stringify({ a: undefined })); // {}: the key disappears
structuredClone({ a: undefined }); // { a: undefined }: the key stays
```

The two serialization paths disagree. That is the real reason to forbid it.

Optional properties themselves are harmless. If the key does not exist, `JSON.stringify` does not emit it, and after `parse` the key still does not exist. `structuredClone` behaves the same, so the round trip is symmetric.

In TS, `?` is by far the most idiomatic form, so forbidding optional properties outright and forcing `nickname: string | null` is not acceptable. So an absent key is fine, and `undefined` as a value is forbidden.

### Checking with types

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

### A type alias cannot have a self-referencing constraint

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

### The `exactOptionalPropertyTypes` wall

With EOPT **off** (the TS default), `{ a?: string }` and `{ a?: string | undefined }` are literally the same type, and the language has no way to tell them apart. So the following cannot be detected.

```ts
const raw: { nickname?: string } = { nickname: undefined }; // legal with EOPT:false
User(raw); // passes the type check. The key exists and its value is undefined
```

With EOPT on, `Record<K, undefined> extends Pick<T, K>` can detect it. Enabling it can produce many errors in existing code, so **it is not required**.

When freeze was cut (§7.1), the argument was "breaking it needs `as any`". This one **leaks from ordinary code with no cast**. So this guarantee is weaker.

### Defuse it in two layers

1. Remove `undefined` from `Primitive`
2. Add the `Validate` above
3. **Strongly recommend EOPT: true** in the README, without requiring it
4. `patch` reads an `undefined` key in a patch as deletion and drops it after the merge (§6.2)
5. **The default deep equals ignores keys whose value is `undefined`** (§5)

Item 5 does the work. If `{ a: undefined }` and `{}` are equal, the disagreement between the two serialization paths **can no longer be observed**. The runtime cost is almost zero, and it comes along with the implementation that makes the comparison independent of key order.

Types prevent most of it, and equals defuses the rest. This balances adoption cost and guarantees better than requiring EOPT to close the gap fully in types.

### Interop friction

`undefined` comes from many places in TS (`Array.prototype.find`, `Map.get`, index access with `noUncheckedIndexedAccess` on, OpenAPI/GraphQL codegen, form libraries, destructuring defaults). More places need a `?? null` before passing to seal.

That is **exactly where a smart constructor should normalize**, consistent with §5's principle of "construct in canonical form". The README states it as the message "normalize at the boundary".

### A side benefit

`undefined` cannot exist as a value, so `undefined` in a `patch`'s patch **can serve as a deletion sentinel** (§6.2).

```ts
User.patch(user, { nickname: undefined }); // deletes nickname
```

If both `null` and `undefined` were allowed as values, this sentinel would not work. A dedicated sentinel would be needed to tell "set it to `null`" from "delete it".

In this library, updating a value always creates a new object, so "assign `undefined` to a property" never happens in the first place. Removing `undefined` from the value space loses no expressiveness.

Likewise, deep equals never faces the awkward question of whether `{ a: undefined }` equals `{}`.

## 3.6 Forbid unions of objects

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

### A field holding Vals of different types, 2026-11-12

`equals` compares structure, so it finds two Vals of different types with the same fields equal.

```ts
type Order = Val<"Order", { money: Dollar | Yen }>;
equals(Order.seal({ money: dollar(1) }), Order.seal({ money: yen(1) })); // true
```

JSON does not record which type the field held either. A field typed `Impl<Priced>` has the same problem without a union. It holds any Val implementing the trait.

- `Validate` rejects both below the root, and the message points to an Enum. An enum's tag distinguishes the variants in `equals` and in JSON
- **The check compares brands, or an enum's name, not member types.** A Val with a boolean payload is `V<true> | V<false>` under one brand. An enum's variants carry different brands but one name, so it compares the enum's `NameOf`. Two enums, or an enum and a Val, are rejected
- **An `Impl` is rejected alone, not only in a union.** This withdraws "A union of `Impl`s can be written in a field" (§15.1, 2026-11-04). `Impl` stays the type for a variable or a parameter
- **Rejected: a runtime brand that `equals` compares** (§5). The type rule rejects such a field at no runtime cost
- **`Rec<Dollar> | Rec<Yen>` is rejected too.** `Validate` reads a `Rec` by its keys before the Val check, so the `Rec` branch rejects a union of its own
- **`DeepReadonlyValue` no longer maps `Impl`.** No payload holds one now, so the branch that kept a `Dyn` box out of an `Impl` field (§15.1, 2026-11-04) was dead
- Cost: core 8,893 → 8,854, trait 24,668 → 24,436, `index.d.ts` 103.73 → 103.93 kB. Reusing `NameOf` rather than a new helper kept `index.d.ts` under its 104 kB budget

## 3.7 Self-reference: `Rec`

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

### The type argument is unconstrained

`Rec<V extends AnyVal>` makes the constraint check force `V` to resolve, which brings back the cycle. So `Rec<number>` passes and
opens to `number`, and `Rec<Other>` (a `Rec` that is not self-referencing) opens to `Other`. **There is no need to block it.** The opened type is
identical to writing `number` or `Other`, so it does no harm (§14.26).

### Rejected shapes

- **`interface Tree extends Val<"app/Tree", TreeShape> {}`** → TS2310. Getting the base members requires the type
  itself. The usual trick of breaking a cycle through an interface does not work here
- **Reusing the existing `Self`** → not possible. The deferral relies on **the marker carrying the name in a type argument**.
  `Self` has no type argument, so `Val` would build the self-reference inside its own definition, and the cycle would be
  `Val`'s definition itself, not `Tree`. Users who never write recursive types would be caught in it too
- **Recursing through the brand string** (`Rec<"app/Tree">` + declaration merging into a global registry) → not verified.
  Unneeded once `Rec<Tree>` worked. Making users write `declare module` is already too expensive
