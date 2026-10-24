# API

## Values

|                                        |                                                              |
| -------------------------------------- | ------------------------------------------------------------ |
| `equals(a, b)`                         | deeply compares two Vals of the same type                    |
| `Val.of<V>(value)`                     | applies the default seal, branding the value as `V`          |
| `Val.of.nocopy<V>(value)`              | the same, without copying the payload                        |
| `Val.unwrap(value)`                    | returns a mutable copy of the payload                        |
| `Val.companion<V>()`                   | starts a companion, with the default seal                    |
| `Val.companion<V, [PrivateSeal]>()`    | the same, without `seal` on the companion                    |
| `Val.companion<V, [PrivateCreate]>()`  | the same, without `create` on the companion                  |
| `Val.companion<V, [Unpatchable<K>]>()` | the same, with keys `K` excluded from `patch`                |
| `.implSeal(f)`                         | registers a custom seal                                      |
| `.implCreate(f)`                       | registers a function that creates a payload                  |
| `.implCreate.noseal(f)`                | the same, bypassing the seal for a payload it always accepts |
| `.impl(fns)`                           | adds the type's members                                      |
| `.implTrait(Tr, fns?)`                 | implements a trait the type declares                         |
| `.build()`                             | ends the chain, and returns the companion                    |

Write `implSeal` first, then `implCreate`. `impl` and `implTrait` come next, in any order.
`.build()` ends the chain and returns the companion. Each step except `implTrait` is written once.

## Companion members

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

### Enum

|                                 |                                                                             |
| ------------------------------- | --------------------------------------------------------------------------- |
| `Enum<K, D, X>`                 | a closed set of variants, as one union                                      |
| `Enum.companion<E, O?>()`       | starts an enum's companion, with the options `O`                            |
| `.tag(key)`                     | names the tag field the companion writes; first, where `Tag<T>` is set      |
| `E.match(value, handlers)`      | matches on a variant's tag field, exhaustively or with `_` for the rest     |
| `E.match(handlers)(value)`      | the same, with the value last                                               |
| `E[Tag].match(tag, handlers)`   | matches on a tag string, the same way                                       |
| `E[Tag].match(handlers)(tag)`   | the same, with the tag last, for every tag                                  |
| `E.seal(payload)`               | builds the variant that the payload's tag selects                           |
| `E.create(...args)`             | registered with `.implCreate(f)`; creates a payload, then passes it to seal |
| `E[Tag].key`                    | the tag field's name                                                        |
| `E.Variant.create(fields)`      | writes the tag and passes the payload to that variant's seal                |
| `E.Variant.seal(payload)`       | builds that variant from a payload including its tag                        |
| `E.Variant.create(...args)`     | registered with `.Variant.implCreate(f)`, in place of the one above         |
| `E.Variant.patch(value, patch)` | derives a value of that variant, keeping the tag                            |
| `.Variant.implSeal(seal)`       | replaces that variant's seal; `.Variant` also has a Val's other steps       |
| `.implSeal(seal)`               | adds a seal `E.seal` runs before the tag selects a variant; once            |
| `.implCreate(f)`                | registers `E.create`; once, after `.implSeal`                               |
| `.impl(fns)`                    | adds members taking the union, once                                         |
| `.implTrait(Tr, fns?)`          | implements a trait the enum declares                                        |
| `.build()`                      | ends the chain, and returns the companion                                   |
| `Tag<T>`                        | names the tag field, intersected into `X`                                   |
| `VariantOf<E, N>`               | the type of one variant                                                     |
| `SeedFor<E, N>`                 | what that variant's `create` takes                                          |
| `SealedPayload<E>`              | a tagged payload of one variant                                             |
| `VariantOptions<N, O>`          | the options one variant adds, in the list after `E`                         |
| `VariantsOf<E>` / `SharedOf<E>` | the declared variants, and the shared fields                                |
| `NameOf<E>` / `TagOf<E>`        | the enum's name, and the tag field's name                                   |
| `AnyEnum`                       | a constraint over any enum                                                  |
| `EnumBuilder<E>`                | an enum's builder, with the steps it can still take                         |
| `EnumCompanion<E>`              | the enum's companion `.build()` returns                                     |

### Trait

|                            |                                                   |
| -------------------------- | ------------------------------------------------- |
| `Trait<K, Shape, M>`       | a contract Vals share                             |
| `Trait.companion<Tr>()`    | starts the trait's own implementation             |
| `.impl(fns)`               | implements members over the trait, once           |
| `.build()`                 | ends the chain, and returns the companion         |
| `Tr.dyn(companion, value)` | boxes a value with one Val's implementation       |
| `Self`                     | the implementing Val, inside a member's signature |
| `Final<F>`                 | marks a member no Val may replace                 |
| `Dyn<Tr>`                  | a boxed value, with the concrete type gone        |
| `AnyTrait`                 | a constraint over any trait                       |
| `Members`                  | the members a trait declares                      |
