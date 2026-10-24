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
| `.impl(fns)`             | adds the type's members                                       |
| `.implTrait(Tr, fns?)`   | implements a trait the type declares                          |
| `.build()`               | ends the chain, and returns the companion                     |

Write `implSeal` first, then `implCreate`. `impl` and `implTrait` come next, in any order. Each step
except `implTrait` is written once.

## Companion options

The list `O` after the type in `Val.companion<V, O>()` takes these, in any combination.

|                  |                                     |
| ---------------- | ----------------------------------- |
| `PrivateSeal`    | removes `seal` from the companion   |
| `PrivateCreate`  | removes `create` from the companion |
| `Unpatchable<K>` | excludes keys `K` from `patch`      |

## Companion

`User` stands for the companion that belongs to the `User` type.

|                               |                                       |                                                                     |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `User.seal(value)`            | every companion without `PrivateSeal` | applies the seal registered with `.implSeal(f)`, or the default one |
| `User.seal.nocopy(value)`     | every companion without `PrivateSeal` | the same as `User.seal`, without copying the payload                |
| `User.create(...args)`        | registered with `.implCreate(f)`      | creates a payload, then passes it to seal                           |
| `User.create.nocopy(...args)` | registered with `.implCreate(f)`      | the same as `User.create`, without copying the payload              |
| `User.patch(user, patch)`     | `User` has an object payload          | deeply merges the patch, then seals it                              |
| `User.member(user, ...args)`  | registered with `.impl(fns)`          | runs a member defined for the companion                             |
| `User.member(...args)(user)`  | registered with `.impl(fns)`          | the same, with the value last                                       |

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

|                                      |                                                                |
| ------------------------------------ | -------------------------------------------------------------- |
| `Enum.companion<E, O?>()`            | starts an enum's companion, with the options `O`               |
| `.tag(key)`                          | names the tag field the companion writes                       |
| `.implSeal(f)`                       | adds a seal. `E.seal` runs it before the tag selects a variant |
| `.implCreate(f)`                     | registers `E.create`                                           |
| `.impl(fns)`                         | adds members taking the union                                  |
| `.implTrait(Tr, fns?)`               | implements a trait the enum declares                           |
| `.[VariantName].implSeal(f)`         | replaces that variant's seal                                   |
| `.[VariantName].implCreate(f)`       | replaces that variant's `create`                               |
| `.[VariantName].impl(fns)`           | adds that variant's members                                    |
| `.[VariantName].implTrait(Tr, fns?)` | implements a trait that variant declares                       |
| `.build()`                           | ends the chain, and returns the companion                      |

The enum's steps come first, in a Val's order, and each variant's steps follow in the same order.
The first variant step removes the enum's steps from the chain.

### Enum companion options

The list `O` after the enum in `Enum.companion<E, O>()` accepts the
[companion options](#companion-options), which apply to `E` and every variant. To configure a
specific variant's companion, add `VariantOptions`:

|                        |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| `VariantOptions<N, O>` | adds options `O` for variant `N`: `PrivateCreate` and `Unpatchable<K>` |

### Enum companion

`E` stands for an enum's companion, and `[VariantName]` for the name of one of its variants.

|                                          |                                                |                                                                         |
| ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `E.match(value, handlers)`               | every enum                                     | matches on a variant's tag field, exhaustively or with `_` for the rest |
| `E.match(handlers)(value)`               | every enum                                     | the same, with the value last                                           |
| `E[Tag].match(tag, handlers)`            | every enum                                     | matches on a tag string, the same way                                   |
| `E[Tag].match(handlers)(tag)`            | every enum                                     | the same, with the tag last, for every tag                              |
| `E[Tag].key`                             | every enum                                     | the tag field's name                                                    |
| `E.seal(payload)`                        | every enum without `PrivateSeal`               | builds the variant that the payload's tag selects                       |
| `E.create(...args)`                      | registered with `.implCreate(f)`               | creates a payload, then passes it to `E.seal`                           |
| `E.member(value, ...args)`               | registered with `.impl(fns)`                   | runs a member defined for the union                                     |
| `E.[VariantName].seal(payload)`          | every enum without `PrivateSeal`               | builds that variant from a payload including its tag                    |
| `E.[VariantName].create(fields)`         | every variant without `PrivateCreate`          | writes the tag and passes the payload to that variant's seal            |
| `E.[VariantName].create(...args)`        | registered with `.[VariantName].implCreate(f)` | the same, with the arguments `f` takes                                  |
| `E.[VariantName].patch(value, patch)`    | every variant                                  | derives a value of that variant, keeping the tag                        |
| `E.[VariantName].member(value, ...args)` | registered with `.[VariantName].impl(fns)`     | runs a member defined for that variant                                  |

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

|                         |                                           |
| ----------------------- | ----------------------------------------- |
| `Trait.companion<Tr>()` | starts the trait's own implementation     |
| `.impl(fns)`            | implements members over the trait, once   |
| `.build()`              | ends the chain, and returns the companion |

### Trait companion

|                            |                                             |
| -------------------------- | ------------------------------------------- |
| `Tr.dyn(companion, value)` | boxes a value with one Val's implementation |

### Trait types

|                      |                                                   |
| -------------------- | ------------------------------------------------- |
| `Trait<K, Shape, M>` | a contract Vals share                             |
| `Self`               | the implementing Val, inside a member's signature |
| `Final<F>`           | marks a member no Val may replace                 |
| `Dyn<Tr>`            | a boxed value, with the concrete type gone        |
| `AnyTrait`           | a constraint over any trait                       |
| `Members`            | the members a trait declares                      |
