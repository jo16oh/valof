# Installation

```sh
npm install valof
```

<!-- prettier-ignore -->
> [!IMPORTANT]
> Valof is pre-1.0. A minor release can change the API.

Valof requires TypeScript 5.9 or later. The recommended compiler options are:

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, even though JSON
serialization drops that key.
