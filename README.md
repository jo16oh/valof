<br>
<br>

<div align="center" style="margin-top: 8rem; margin-bottom: 4rem;">
  <img src="./assets/valof-brand.svg" alt="Valof" width="364">
  <p><strong><em>Write robust domain logic in TypeScript just by following the conventions.</em></strong></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm"></a>
  </p>
</div>

<br>
<br>

Valof is an opinionated value-object helper for TypeScript that enforces the conventions through
types and linting.

## What you get

- **Nominal-ish typing with a phantom brand**: TypeScript distinguishes one Val type from another,
  with nothing to pay at runtime.

- **Values as plain data**: Vals stay objects, arrays and primitives. They serialize without
  adapters and fit directly into React and other framework state. No classes, no prototypes.

- **Deeply readonly**: Values are deeply readonly. Constructors copy their inputs, so an original
  reference cannot mutate them.

- **No `as` casts in your code**: Valof owns the cast required to construct a branded value.

- **Companion object**: Keep a type's constructor and functions together without a class. The first
  Val parameter is inferred.

- **"Parse, don't validate"**: Every creation and update goes through one `seal`. Use any validation
  library and any Result type.

- **Copy only what changes**: `patch` copies only the paths it changes. Untouched branches keep
  their reference identity.

- **Type-aware linting**: Catch convention violations through ESLint, Oxlint or the standalone
  command.

- **Lightweight**: About 1.1 kB gzipped, with no runtime dependencies.

Read the [documentation](docs/src/introduction.md) for more details.

## Installation

```sh
pnpm install valof
```

## Showcase

```ts
// ここにAPIを網羅したfancyなexampleを入れる
import { Val } from "valof";

export type UserId = Val<"UserId", string>;
export type OrderId = Val<"OrderId", string>;

const UserId = Val.sealer<UserId>();
let orderId: OrderId;
```

## Development

```bash
vp install              # install dependencies
vp test                 # run the tests
vp check                # format, lint, type check
vp pack                 # build
vp run size             # measure the bundle against its budget
vp run type-perf        # measure the typecheck performance
vp run ts-compatibility # type check the published .d.mts against every TypeScript line
```

## License

MIT
