# Valof

[![npm](https://img.shields.io/npm/v/valof.svg)](https://www.npmjs.com/package/valof)

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, a constructor and a companion that collects the
functions for the type. Values stay **plain objects, arrays and primitives** — no classes, no
prototypes. Around 1 kB gzipped.

What you get:

- nominal typing with a phantom brand — nothing to pay at runtime
- no `as` cast anywhere in your code
- one place for a type's constructor and its functions
- symmetric JSON round trips
- plain data, drops into React / Solid / Svelte / Vue state, see
  [Framework state](patterns.md#framework-state)

```bash
pnpm install valof
```
