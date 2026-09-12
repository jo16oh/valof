# TypeScript

**TypeScript 5.9 or later.**

Recommended compiler options:

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, and that key is
dropped when the value is serialized into JSON.
