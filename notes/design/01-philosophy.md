# 1. Design philosophy

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
