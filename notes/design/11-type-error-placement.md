# 11. Where to surface type errors

Detecting a rule and making the compiler treat it as a failure are two different things. Computing a marker and putting it in a type checks nothing. There are only two places to put it.

## 11.1 A: parameter position

The check's result becomes the argument's type.

```
Argument of type '{ tag: (x) => string; }' is not assignable to
  parameter of type '"another trait already answers to one of these names"'.
```

The sentence appears as is, so it is readable. Each entry point needs its own, and one is easy to forget.

Putting it in the return type is not A. The failure lands on the line that assigns the companion, away from the call, and reads as a different problem (see the JSDoc of `Takes`).

## 11.2 B: verdict position

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

## 11.3 The criterion

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

## 11.4 A third position checks nothing

The same shape of bug showed up three times. Each one put the marker where nothing reads it.

- `TraitBrand` put `Invalid` in `__valof_internal_phantom_trait_brands`. `AnyVal` looks only at `__valof_internal_phantom_brand`, so a Val whose shape did not fit passed the constructor.
- `Declarable` was referenced only from the return type of `Trait.companion`. `implTrait` without a companion does not pass through there, so members claiming the names `equals` or `patch` landed on the Val. At run time `N.equals(a, b)` called the trait's implementation, which takes only one argument.
- `Checked<Shape>` in `Trait` left the marker on the shape side of an intersection. No constraint reads it there.

None of these was A or B. **When you write a new check, confirm it sits at A or B.** If it sits at neither, the check does not exist.

The way to confirm is mutation. Remove the check and see whether the `@ts-expect-error` becomes unused. If nothing goes red, the test checks nothing.

## 11.5 Dropped alternatives

- **Putting it in the return type** (§11.1). Considered once for `Takes`, and rejected.
- **Writing both A and B.** After `Declarable` moved to B, the A-side gate left in `Alone` was removed. When the same check lives in two places, fixing the B side leaves the A side behind as an unreachable defence. In fact, adding `Fits` made `V extends ShapeOf<Tr>` in `Takes` unreachable, and it was dropped.
