# Valof

<div align="center" style="margin-top: 8rem; margin-bottom: 4rem;">
  <img src="./assets/valof-brand.svg" alt="Valof" width="364">
  <p><strong><em>Write robust domain logic in TypeScript just by following the conventions.</em></strong></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm"></a>
  </p>
</div>

<br>

Valof is an opinionated value-object helper for TypeScript that enforces the conventions through
types and linting.

What you get:

- **Plain data**: Vals stay objects, arrays and primitives. They serialize without adapters and fit
  directly into React and other framework state. No classes, no prototypes.

- **Nominal-ish typing with a phantom brand**: TypeScript distinguishes one Val type from another,
  with nothing to pay at runtime.

- **No `as` casts in your code**: Valof owns the cast required to construct a branded value.

- **Companion object**: a namespace for a type's constructor and functions, with the first Val
  parameter inferred.

- **"Parse, don't validate" by convention**: every creation and update goes through one `seal`. Use
  any validation library and any Result type.

- **Deep readonly**: constructors copy their inputs, so an original reference cannot mutate a Val.

- **Copy only what changes**: `patch` reaches any depth without nested spreads. Untouched branches
  remain referentially equal.

- **Built-in type-aware linter**: detects violations of Valof's rules through ESLint, Oxlint or its
  standalone command.

- **Lightweight**: starts from 1.25 kB gzipped, with no runtime dependencies.

Read the [documentation](docs/src/introduction.md) for more details.

## Installation

```bash
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
