# API

## Functions

|                           |                                                     |
| ------------------------- | --------------------------------------------------- |
| `equals(a, b)`            | deeply compares two Vals of the same type           |
| `Val.of<V>(value)`        | applies the default seal, branding the value as `V` |
| `Val.of.nocopy<V>(value)` | the same, without copying the payload               |
| `Val.unwrap(value)`       | returns a mutable copy of the payload               |

## Builder

|                          |                                                               |
| ------------------------ | ------------------------------------------------------------- |
| `Val.companion<V, O?>()` | starts a companion, with the default seal and the options `O` |
| `.implSeal(f)`           | registers a custom seal                                       |
| `.implCreate(f)`         | registers a function that creates a payload                   |
| `.implCreate.noseal(f)`  | the same, bypassing the seal for a payload it always accepts  |
| `.impl(f)`               | adds the members `f` returns                                  |
| `.implTrait(Tr, f?)`     | implements a trait the type declares                          |
| `.implAssoc(f)`          | adds the members `f` returns, which do not take the Val       |
| `.build()`               | ends the chain, and returns the companion                     |

Write `implSeal` first, then `implCreate`. `impl`, `implTrait` and `implAssoc` come next, in any
order. `implSeal`, `implCreate` and `impl` are written once, and the other two any number of times.

The function passed to `impl`, `implTrait` and `implAssoc` receives `seal`, `create` and `patch`,
including the ones `PrivateSeal` and `PrivateCreate` remove from the companion. It receives `create`
only where `implCreate` registered one.

## Companion options

`Val.companion` accepts these options in a list after the type, in any combination.

|                  |                                     |
| ---------------- | ----------------------------------- |
| `PrivateSeal`    | removes `seal` from the companion   |
| `PrivateCreate`  | removes `create` from the companion |
| `Unpatchable<K>` | excludes keys `K` from `patch`      |

## Companion

`User` stands for the companion that belongs to the `User` type.

|                                 |                                       |                                                                     |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `User.seal(value)`              | every companion without `PrivateSeal` | applies the seal registered with `.implSeal(f)`, or the default one |
| `User.seal.nocopy(value)`       | every companion without `PrivateSeal` | the same as `User.seal`, without copying the payload                |
| `User.create(...args)`          | registered with `.implCreate(f)`      | creates a payload, then passes it to seal                           |
| `User.create.nocopy(...args)`   | registered with `.implCreate(f)`      | the same as `User.create`, without copying the payload              |
| `User.patch(user, patch)`       | `User` has an object payload          | deeply merges the patch, then seals it                              |
| `User.[member](user, ...args)`  | registered with `.impl(f)`            | runs a member defined for the companion                             |
| `User.[member](...args)(user)`  | registered with `.impl(f)`            | the same, with the value last                                       |
| `User.[member](...args)`        | registered with `.implAssoc(f)`       | runs a member that does not take the Val                            |
| `User.[member](...rest)(first)` | registered with `.implAssoc(f)`       | the same, with the first argument last                              |

## Types

|                       |                                                         |
| --------------------- | ------------------------------------------------------- |
| `Val<K, T>`           | a branded value type                                    |
| `AnyVal`              | a constraint over any Val                               |
| `SeedOf<V>`           | the payload accepted by seals                           |
| `PayloadOf<V>`        | the payload, with the brand removed at every depth      |
| `Patch<T>`            | the patch accepted for a payload                        |
| `Rec<V>`              | a Val's reference to itself, in its own payload         |
| `CompanionBuilder<V>` | a companion's builder, with the steps it can still take |
| `Companion<V, M>`     | the companion `.build()` returns                        |

You never write the last two. They are exported so that your own `.d.ts` can name them when you
re-export a companion.

## `valof/experimental`

<!-- prettier-ignore -->
> [!WARNING]
> Experimental. The design is still changing. See [Enums](enums.md) and [Traits](traits.md).

### Enum builder

|                                    |                                                                |
| ---------------------------------- | -------------------------------------------------------------- |
| `Enum.companion<E, O?>()`          | starts an enum's companion, with the options `O`               |
| `.tag(key)`                        | names the tag field the companion writes                       |
| `.implSeal(f)`                     | adds a seal. `E.seal` runs it before the tag selects a variant |
| `.implCreate(f)`                   | registers `E.create`                                           |
| `.impl(f)`                         | adds the members `f` returns, which take the union             |
| `.implTrait(Tr, f?)`               | implements a trait the enum declares                           |
| `.implAssoc(f)`                    | adds the members `f` returns, which do not take the union      |
| `.[VariantName].implSeal(f)`       | replaces that variant's seal                                   |
| `.[VariantName].implCreate(f)`     | replaces that variant's `create`                               |
| `.[VariantName].impl(f)`           | adds the members `f` returns, which take that variant          |
| `.[VariantName].implTrait(Tr, f?)` | implements a trait that variant declares                       |
| `.[VariantName].implAssoc(f)`      | adds the members `f` returns, which do not take that variant   |
| `.build()`                         | ends the chain, and returns the companion                      |

Each variant's steps come first, in the same order as `Val.companion`'s. The enum's steps follow in
that order. The first enum step removes the variants' steps from the chain.

The function passed to the enum's `impl`, `implTrait` and `implAssoc` receives `E.seal` and
`E.create`. The one passed to a variant's receives that variant's `seal`, `create` and `patch`.

### Enum companion options

`Enum.companion` accepts the [companion options](#companion-options) in a list after the enum. They
apply to the enum and every variant. To configure a specific variant's companion, add
`VariantOptions`:

|                        |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| `VariantOptions<N, O>` | adds options `O` for variant `N`: `PrivateCreate` and `Unpatchable<K>` |

### Enum companion

`E` stands for an enum's companion, and `[VariantName]` for the name of one of its variants.

|                                            |                                                |                                                                         |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `E.match(value, handlers)`                 | every enum                                     | matches on a variant's tag field, exhaustively or with `_` for the rest |
| `E.match(handlers)(value)`                 | every enum                                     | the same, with the value last                                           |
| `E[Tag].match(tag, handlers)`              | every enum                                     | matches on a tag string, the same way                                   |
| `E[Tag].match(handlers)(tag)`              | every enum                                     | the same, with the tag last, for every tag                              |
| `E[Tag].key`                               | every enum                                     | the tag field's name                                                    |
| `E.seal(payload)`                          | every enum without `PrivateSeal`               | builds the variant that the payload's tag selects                       |
| `E.create(...args)`                        | registered with `.implCreate(f)`               | creates a payload, then passes it to `E.seal`                           |
| `E.[member](value, ...args)`               | registered with `.impl(f)`                     | runs a member defined for the union                                     |
| `E.[member](...args)`                      | registered with `.implAssoc(f)`                | runs a member that does not take the union                              |
| `E.[VariantName].seal(payload)`            | every enum without `PrivateSeal`               | builds that variant from a payload including its tag                    |
| `E.[VariantName].create(fields)`           | every variant without `PrivateCreate`          | writes the tag and passes the payload to that variant's seal            |
| `E.[VariantName].create(...args)`          | registered with `.[VariantName].implCreate(f)` | the same, with the arguments `f` takes                                  |
| `E.[VariantName].patch(value, patch)`      | every variant                                  | derives a value of that variant, keeping the tag                        |
| `E.[VariantName].[member](value, ...args)` | registered with `.[VariantName].impl(f)`       | runs a member defined for that variant                                  |
| `E.[VariantName].[member](...args)`        | registered with `.[VariantName].implAssoc(f)`  | runs a member that does not take that variant                           |

### Enum types

|                                 |                                                     |
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

### Trait builder

|                         |                                                                                |
| ----------------------- | ------------------------------------------------------------------------------ |
| `Trait.companion<Tr>()` | starts the trait's own implementation                                          |
| `.impl(f)`              | implements the members `f` returns, once                                       |
| `.implAssoc(f)`         | adds the members `f` returns, which do not take a value implementing the trait |
| `.build()`              | ends the chain, and returns the companion                                      |

The function passed to `implAssoc` receives nothing. Its members stay on the trait's companion.
`implTrait` copies none of them onto a Val.

### Trait companion

|                            |                                               |
| -------------------------- | --------------------------------------------- |
| `Tr.dyn(companion, value)` | boxes a value with one Val's implementation   |
| `Tr.[member](...args)`     | runs a member registered with `.implAssoc(f)` |

### Trait types

|                      |                                                   |
| -------------------- | ------------------------------------------------- |
| `Trait<K, Shape, M>` | a contract Vals share                             |
| `Self`               | the implementing Val, inside a member's signature |
| `Final<F>`           | marks a member no Val may replace                 |
| `Dyn<Tr>`            | a boxed value, with the concrete type gone        |
| `AnyTrait`           | a constraint over any trait                       |
| `Members`            | the members a trait declares                      |
