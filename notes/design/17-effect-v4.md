# 17. Effect v4, investigated, 2026-09-10

v4 has been an RC since 2026-08-12, with the code in `Effect-TS/effect-smol`. This covers only what
overlaps with valof's decisions.

## No typeclass package

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

## Equality lives in the value

```ts
export interface Equal extends Hash.Hash {
  [symbol](that: Equal): boolean;
}
```

A symbol-keyed method sits on the value. This is the opposite of §1. A JSON round trip does not give
back the same thing. `Data` offers only the two extremes. `Data.Class` has a prototype, and
`Data.taggedEnum` is plain but has no behavior. **The middle is empty.** §15.1's `dyn` (dynamic
dispatch while staying plain) fits there.

## The benefit of no classes, on the equality side

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

## What they have and we do not

`Data.struct` has `Equal` / `Hash`, so it goes straight into a `HashMap` / `HashSet`. valof defers
Map / Set (§7.2, with the alternative in §8.1).

**Structural sharing is not a difference.** v4 added an `Optic` module. Optics and plain spread both
keep the identity of untouched branches (`{...s, a: {...s.a, b: v}}` already does). What valof saves is
effort; it adds no capability: one `patch` at any depth, with no optic declarations and no chain of spreads.
