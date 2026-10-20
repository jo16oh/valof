# API

## Values

|                                           |                                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| `equals(a, b)`                            | deeply compares two Vals of the same type                    |
| `Val.of<V>(value)`                        | applies the default seal with the type named                 |
| `Val.of.nocopy<V>(value)`                 | makes a payload the value without copying                    |
| `Val.unwrap(value)`                       | returns a mutable copy of the payload                        |
| `Val.sealer<V>()`                         | creates a callable default sealer                            |
| `Val.sealer<V>().impl(fns?)`              | adds the type's members, and ends the chain                  |
| `Val.companion<V>()`                      | starts a companion without a callable sealer                 |
| `Val.companion<V>().impl(fns?)`           | the same, on a companion                                     |
| `.implTrait(Tr, fns?)`                    | implements a trait the type declares                         |
| `Val.companion<V>().implSeal(f)`          | registers a custom seal                                      |
| `Val.companion<V>().implCreate(f)`        | registers a function that creates a payload                  |
| `Val.companion<V>().implCreate.noseal(f)` | the same, bypassing the seal for a payload it always accepts |
| `Val.companion<V>().fixed<K>()`           | excludes keys from `patch`                                   |

## Companion members

`User` stands for the companion that belongs to the `User` type.

|                               |                                  |                                             |
| ----------------------------- | -------------------------------- | ------------------------------------------- |
| `User(value)`                 | built with `Val.sealer<User>()`  | applies the default seal                    |
| `User.nocopy(value)`          | built with `Val.sealer<User>()`  | uses a deeply readonly payload without copy |
| `User.seal(value)`            | registered with `.implSeal(f)`   | applies the custom seal                     |
| `User.seal.nocopy(value)`     | registered with `.implSeal(f)`   | uses its non-copying terminal seal          |
| `User.create(...args)`        | registered with `.implCreate(f)` | creates a payload, then passes it to seal   |
| `User.create.nocopy(...args)` | registered with `.implCreate(f)` | creates and seals without terminal copying  |
| `User.patch(user, patch)`     | `User` has an object payload     | deeply merges the patch, then seals it      |
| `User[member](user, ...args)` | registered with `.impl(fns)`     | runs a member defined for the companion     |
| `User[member](...args)(user)` | registered with `.impl(fns)`     | the same, with the value last               |

## Types

|                       |                                                    |
| --------------------- | -------------------------------------------------- |
| `Val<K, T>`           | a branded value type                               |
| `AnyVal`              | a constraint over any Val                          |
| `SeedOf<V>`           | the payload accepted by constructors and seals     |
| `PayloadOf<V>`        | the payload, with the brand removed at every depth |
| `Patch<T>`            | the patch accepted for a payload                   |
| `Rec<V>`              | a Val's reference to itself, in its own payload    |
| `Sealer<V>`           | a callable sealer with every step still open       |
| `Sealed<V, M>`        | a finished callable companion                      |
| `CompanionBuilder<V>` | a companion with every step still open             |
| `Companion<V, M>`     | a finished companion                               |

You never write the last four. They are exported so that your own `.d.ts` can name them when you
re-export a companion.

## `valof/experimental`

<!-- prettier-ignore -->
> [!WARNING]
> Experimental. The design is still changing. See [Enums](enums.md) and [Traits](traits.md).

### Enum

|                                      |                                                   |
| ------------------------------------ | ------------------------------------------------- |
| `Enum<K, D, X>`                      | a closed set of variants, as one union            |
| `Enum.sealer<E>(tag?)`               | starts an enum whose variants are callable        |
| `Enum.companion<E>(tag?)`            | the same, for an enum with a custom seal          |
| `E.match(value, handlers)`           | matches on a variant's tag field, exhaustively    |
| `E.match(handlers)(value)`           | the same, with the value last                     |
| `E[Tag].match(tag, handlers)`        | matches on a tag string, also exhaustively        |
| `E[Tag].match(handlers)(tag)`        | the same, with the tag last, for every tag        |
| `E(payload)` / `E.seal(payload)`     | builds the variant that the payload's tag selects |
| `E[Tag].key`                         | the tag field's name                              |
| `E.Variant(payload)`                 | builds that variant, writing the tag              |
| `E.Variant.create(payload)`          | the same on a companion, through its seal         |
| `E.Variant.patch(value, patch)`      | derives a value of that variant, keeping the tag  |
| `.impl(fns?)`                        | adds members taking the union, and ends the chain |
| `.implVariant(N, sealer => …)`       | adds one variant's members, and its seal          |
| `.implSeal(seal)`                    | replaces the seal shared by every variant         |
| `.implTrait(Tr, fns?)`               | implements a trait the enum declares              |
| `Tag<T>`                             | names the tag field, intersected into `X`         |
| `VariantOf<E, N>`                    | the type of one variant                           |
| `SeedFor<E, N>`                      | what that variant's constructor takes             |
| `SealedPayload<E>`                   | what an `.implSeal` seal receives, tag included   |
| `VariantsOf<E>` / `SharedOf<E>`      | the declared variants, and the shared fields      |
| `NameOf<E>` / `TagOf<E>`             | the enum's name, and the tag field's name         |
| `AnyEnum`                            | a constraint over any enum                        |
| `EnumSealer<E>` / `EnumBuilder<E>`   | an enum with every step still open                |
| `EnumSealed<E>` / `EnumCompanion<E>` | a finished enum companion                         |

### Trait

|                            |                                                       |
| -------------------------- | ----------------------------------------------------- |
| `Trait<K, Shape, M>`       | a contract Vals share                                 |
| `Trait.companion<Tr>()`    | starts the trait's own implementation                 |
| `Tr.impl(fns)`             | implements members over the trait, and ends the chain |
| `Tr.dyn(companion, value)` | boxes a value with one Val's implementation           |
| `Self`                     | the implementing Val, inside a member's signature     |
| `Final<F>`                 | marks a member no Val may replace                     |
| `Dyn<Tr>`                  | a boxed value, with the concrete type gone            |
| `AnyTrait`                 | a constraint over any trait                           |
| `Members`                  | the members a trait declares                          |
