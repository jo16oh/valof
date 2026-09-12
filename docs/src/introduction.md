# Introduction

![valof-brand](../../assets/valof-brand.svg)

> Write robust domain logic in TypeScript just by following the convention.

Valof is a value-object helper for TypeScript.

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

## Installation

```bash
pnpm install valof
```

## License

MIT
