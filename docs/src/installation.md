# Installation

```sh
npm install valof
```

The recommended compiler options are:

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, even though JSON
serialization drops that key.
