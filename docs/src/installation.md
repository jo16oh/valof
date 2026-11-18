# Installation

```sh
npm install valof
```

The recommended compiler options are:

- `strict` (the default since TypeScript 6)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `patch` accepts `{ k: undefined }` for a field that cannot
hold `undefined`.
