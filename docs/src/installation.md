# Installation

```sh
npm install valof
```

The recommended compiler options are:

- `strict` (the default since TypeScript 6)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, even though JSON
serialization drops that key.
