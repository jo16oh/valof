<div align="center">
  <img src="assets/valof-brand.svg" alt="Valof" width="250">
  <h1>The Valof Book</h1>
  <p>v{{valof-version}}</p>
  <p><em>Write robust domain logic in TypeScript<br>just by following the conventions.</em></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm"></a>
  </p>
</div>

The Valof Book is both a guide and a reference. Read it in order to learn the conventions, or use
the sidebar to find a specific topic.

<!-- prettier-ignore -->
> [!IMPORTANT]
> Valof is pre-1.0. A minor release can change the API. Read the release notes before upgrading.

## Why Valof?

Valof is a TypeScript library for branded, immutable domain types, such as value objects and enums.
It enforces the conventions through types and linting.

- **Nominal-ish typing with a phantom brand**: TypeScript distinguishes one Val type from another,
  with nothing to pay at runtime.

- **Values as plain data**: Vals stay objects, arrays and primitives. They serialize without
  adapters and fit directly into React and other framework state. No classes, no prototypes.

- **Immutability**: Vals are immutable. Their types are deeply readonly, and `seal` copies its
  input, so an original reference cannot mutate them.

- **No `as` casts in your code**: Valof owns the cast required to construct a branded value.

- **Companion object**: Keep a type's constructor and functions together without a class. The first
  Val parameter is inferred.

- **"Parse, don't validate"**: Every creation and derivation goes through one `seal`.[^seal] Use any
  validation library and any Result type.

- **Copy only what changes**: `patch` copies only the paths it changes. Untouched branches keep
  their reference identity.

- **Rust-like abstractions**: `Enum` is a closed set of variants with exhaustive `match`. `Trait`
  shares behavior across Vals. `dyn` adds dynamic dispatch without classes, holding different types
  together.

- **Built-in linter**: Catch convention violations through ESLint, Oxlint or the standalone command.
  [Linting](linting.md) shows the setup.

- **Lightweight**: Starts from <!-- valof-minimal-bundle-size -->965 B
  gzipped<!-- /valof-minimal-bundle-size -->, with no runtime dependencies.

> For background on individual features, see
> [TypeScript problems Valof addresses](typescript-problems.md).

[^seal]:
    `Val.of` is an escape hatch that applies the default seal rather than a companion's, and the
    [linter](linting.md#rules) warns on it for a type that has a companion. A `create` registered
    with `.implCreate.noseal` skips the seal in production.
