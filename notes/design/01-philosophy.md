# 1. Design philosophy

> **Values are plain data. Behavior lives outside them.**

Every design decision follows from this one line.

Restricting values to plain objects, arrays and primitives guarantees the following.

- Data that crosses JSON or `structuredClone` intact seals into an equal Val again. Neither boundary carries the
  brand, so the receiver seals the data again
- They fit directly in React state or a Redux store
- Immutable updates do not lose the prototype
- The brand is a phantom type, so it leaves no cost and no trace at runtime

The constructor deep-copies its argument by default (§4.1). This is not zero-cost. It is the minimum price for making "values are data" hold at runtime too. `.nocopy` can remove it, only where ownership can be confirmed separately.

Companion members are dual, data-first / data-last (§6.11). Values have no methods, so this is what lets you write `pipe(u, User.rename("x"))`. Each call pays a few ns. Unlike the copy, this price buys ergonomics, not correctness.

A class gives none of these. §7 collects what was given up to keep this principle.

**`any` and `never` written as a type are outside the guarantees** (user, 2026-11-18). Placing either where a
type argument names a Val, a trait, a key or an option is visibly wrong to anyone who knows TypeScript, and a linter
can find it, as it finds a cast. The types still reject them where that is cheap and keeps another check's message from misleading the reader, but a hole that only `any` or `never` opens is not a bug.

**`structuredClone` is outside the guarantees** (2026-11-18). Within one thread, TypeScript types
`structuredClone<T>(value: T): T`, so a clone has the Val's type. The seal never received it, it is not frozen, and it
has lost the ownership record (§4.1). Valof does not reject it, just as it does not reject a cast. The allowed types
happen to pass through it. Valof promises nothing more.
