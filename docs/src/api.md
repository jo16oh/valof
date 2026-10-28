# API Reference

## Functions

| API                       | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `equals(a, b)`            | deeply compares two Vals of the same type           |
| `Val.of<V>(value)`        | applies the default seal, branding the value as `V` |
| `Val.of.nocopy<V>(value)` | the same, without copying the payload               |
| `Val.unwrap(value)`       | returns a mutable copy of the payload               |

## Val Companion Builder

| Step                     | Description                                                   |
| ------------------------ | ------------------------------------------------------------- |
| `Val.companion<V, O?>()` | starts a companion, with the default seal and the options `O` |
| `.implSeal(f)`           | registers a custom seal                                       |
| `.implCreate(f)`         | registers a function that creates a payload                   |
| `.implCreate.noseal(f)`  | the same, bypassing the seal for a payload it always accepts  |
| `.impl(f)`               | adds the members `f` returns                                  |
| `.implTrait(Tr, f?)`     | implements a trait the type declares                          |
| `.implAssoc(f)`          | adds the members `f` returns, which do not take the Val first |
| `.build()`               | ends the chain, and returns the companion                     |

Write `implSeal` first, then `implCreate`. `impl`, `implTrait` and `implAssoc` come next, in any
order. `implSeal`, `implCreate` and `impl` are written once, and the other two any number of times.

The function passed to `impl`, `implTrait` and `implAssoc` receives `seal`, `create` and `patch`,
including the ones `PrivateSeal` and `PrivateCreate` remove from the companion. It receives `create`
only where `implCreate` registered one, and `patch` only for a Val that holds an object payload.

## Val Companion Options

`Val.companion` accepts any of these options in its second type argument.

| Option           | Description                         |
| ---------------- | ----------------------------------- |
| `PrivateSeal`    | removes `seal` from the companion   |
| `PrivateCreate`  | removes `create` from the companion |
| `Unpatchable<K>` | excludes keys `K` from `patch`      |

## Val Companion

`User` stands for the companion that belongs to the `User` type.

| API                             | Description                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `User.seal(value)`              | applies the seal registered with `.implSeal(f)`, or the default one. Removed by `PrivateSeal` |
| `User.seal.nocopy(value)`       | the same, without copying the payload                                                         |
| `User.create(...args)`          | creates a payload with the function `.implCreate(f)` registered, then passes it to the seal   |
| `User.create.nocopy(...args)`   | the same, without copying the payload                                                         |
| `User.patch(user, patch)`       | deeply merges the patch, then seals it. Only for an object payload                            |
| `User.[member](first, ...rest)` | runs a member registered with `.impl(f)`, `.implTrait(Tr, f?)` or `.implAssoc(f)`             |
| `User.[member](...rest)(first)` | the same, with the first argument last, for a member taking more than one argument            |

## Val Types

| Type                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `Val<K, T>`           | a branded value type                                    |
| `AnyVal`              | a constraint over any Val                               |
| `SeedOf<V>`           | the payload accepted by seals                           |
| `PayloadOf<V>`        | the payload, with the brand removed at every depth      |
| `Patch<T>`            | the patch accepted for a payload                        |
| `Rec<V>`              | a Val's reference to itself, in its own payload         |
| `CompanionBuilder<V>` | a companion's builder, with the steps it can still take |
| `Companion<V, M>`     | the companion `.build()` returns                        |

You never write the builder and companion types, here or for an enum or a trait. They are exported
so that your own `.d.ts` can name them when you re-export a companion.

## Enum Companion Builder

| Step                                  | Description                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `Enum.companion<E, O?>()`             | starts an enum's companion, with the options `O`                   |
| `.tag(key)`                           | names the tag field the companion writes                           |
| `.implSeal(f)`                        | adds a seal. `E.seal` runs it before the tag selects a variant     |
| `.implCreate(f)`                      | registers `E.create`                                               |
| `.implCreate.noseal(f)`               | the same, bypassing the seal for a payload it always accepts       |
| `.impl(f)`                            | adds the members `f` returns, which take the union                 |
| `.implTrait(Tr, f?)`                  | implements a trait the enum declares                               |
| `.implAssoc(f)`                       | adds the members `f` returns, which do not take the union first    |
| `.[VariantName].implSeal(f)`          | replaces that variant's seal                                       |
| `.[VariantName].implCreate(f)`        | replaces that variant's `create`                                   |
| `.[VariantName].implCreate.noseal(f)` | the same, bypassing the seal for a payload it always accepts       |
| `.[VariantName].impl(f)`              | adds the members `f` returns, which take that variant              |
| `.[VariantName].implTrait(Tr, f?)`    | implements a trait that variant declares                           |
| `.[VariantName].implAssoc(f)`         | adds the members `f` returns, which do not take that variant first |
| `.build()`                            | ends the chain, and returns the companion                          |

`.tag` comes first if the enum has a custom tag key. Each variant's steps follow, in the same order
as `Val.companion`'s. The enum's steps come after them, in that order. The first enum step removes
the variants' steps from the chain.

The function passed to the enum's `impl`, `implTrait` and `implAssoc` receives `E.seal`, and
`E.create` where the enum's `implCreate` registered one. The function passed to a variant's `impl`,
`implTrait` and `implAssoc` receives that variant's `seal`, `create` and `patch`.

## Enum Companion Options

`Enum.companion` accepts the [companion options](#val-companion-options) in its second type
argument. They apply to the enum and every variant. To configure a specific variant's companion, add
`VariantOptions`:

| Option                 | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `VariantOptions<N, O>` | adds options `O` for variant `N`: `PrivateCreate` and `Unpatchable<K>` |

## Enum Companion

`E` stands for an enum's companion, and `[VariantName]` for the name of one of its variants.

| API                                        | Description                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `E.match(value, handlers)`                 | matches on a variant's tag field, exhaustively or with `_` for the rest                                                                      |
| `E.match(handlers)(value)`                 | the same, with the value last                                                                                                                |
| `E.match(value, { [Otherwise]: f })`       | the same as `_`, for an enum with a variant named `_`                                                                                        |
| `E[Tag].match(tag, handlers)`              | matches on a tag string, the same way                                                                                                        |
| `E[Tag].match(handlers)(tag)`              | the same, with the tag last, for every tag                                                                                                   |
| `E[Tag].key`                               | the tag field's name                                                                                                                         |
| `E.seal(payload)`                          | builds the variant that the payload's tag selects. Removed by `PrivateSeal`                                                                  |
| `E.create(...args)`                        | creates a payload with the function `.implCreate(f)` registered, then passes it to `E.seal`                                                  |
| `E.[member](first, ...rest)`               | runs a member registered for the union with `.impl(f)`, `.implTrait(Tr, f?)` or `.implAssoc(f)`                                              |
| `E.[member](...rest)(first)`               | the same, with the first argument last, for a member taking more than one argument                                                           |
| `E.[VariantName].seal(payload)`            | builds that variant from a payload including its tag. Removed by `PrivateSeal`                                                               |
| `E.[VariantName].create(fields)`           | writes the tag and passes the payload to that variant's seal. Removed by `PrivateCreate`                                                     |
| `E.[VariantName].create(...args)`          | the same, with the arguments of the function `.[VariantName].implCreate(f)` registered                                                       |
| `E.[VariantName].patch(value, patch)`      | derives a value of that variant, keeping the tag                                                                                             |
| `E.[VariantName].[member](first, ...rest)` | runs a member registered for that variant with `.[VariantName].impl(f)`, `.[VariantName].implTrait(Tr, f?)` or `.[VariantName].implAssoc(f)` |
| `E.[VariantName].[member](...rest)(first)` | the same, with the first argument last, for a member taking more than one argument                                                           |

## Enum Types

| Type                            | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `Enum<K, D, X>`                 | a closed set of variants, as one union              |
| `Tag<T>`                        | names the tag field, intersected into `X`           |
| `VariantOf<E, N>`               | the type of one variant                             |
| `SeedFor<E, N>`                 | what that variant's `create` takes                  |
| `SealedPayload<E>`              | a tagged payload of one variant                     |
| `VariantsOf<E>` / `SharedOf<E>` | the declared variants, and the shared fields        |
| `NameOf<E>` / `TagOf<E>`        | the enum's name, and the tag field's name           |
| `AnyEnum`                       | a constraint over any enum                          |
| `EnumBuilder<E>`                | an enum's builder, with the steps it can still take |
| `EnumCompanion<E>`              | the enum's companion `.build()` returns             |

## Trait Companion Builder

| Step                    | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `Trait.companion<Tr>()` | starts the trait's own implementation                                                |
| `.impl(f)`              | implements the members `f` returns, once                                             |
| `.implAssoc(f)`         | adds the members `f` returns, which do not take a value implementing the trait first |
| `.build()`              | ends the chain, and returns the companion                                            |

Members registered with `implAssoc` are not copied onto a Val by `implTrait`.

## Trait Companion

| API                           | Description                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `Tr.dyn(companion, value)`    | boxes a value with one Val's implementation                                              |
| `Tr.[member](first, ...rest)` | runs a `Final` member registered with `.impl(f)`, or one registered with `.implAssoc(f)` |
| `Tr.[member](...rest)(first)` | the same, with the first argument last, where the member takes more than one argument    |

## Trait Types

| Type                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `Trait<K, Shape, M>` | a contract Vals share                               |
| `Self`               | the implementing Val, inside a member's signature   |
| `Final<F>`           | marks a member no Val may replace                   |
| `Dyn<Tr>`            | a boxed value, with the concrete type gone          |
| `AnyTrait`           | a constraint over any trait                         |
| `Members`            | the members a trait declares                        |
| `TraitBuilder<Tr>`   | a trait's builder, with the steps it can still take |
| `TraitCompanion<Tr>` | the trait's companion `.build()` returns            |
