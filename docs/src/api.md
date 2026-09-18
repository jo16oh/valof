# API

## Values

|                                    |                                                    |
| ---------------------------------- | -------------------------------------------------- |
| `equals(a, b)`                     | deeply compares two Vals of the same type          |
| `Val.of<V>(value)`                 | applies the default seal with the type named       |
| `Val.of.nocopy<V>(value)`          | makes a payload the value without copying          |
| `Val.unwrap(value)`                | returns a mutable copy of the payload              |
| `Val.sealer<V>()`                  | creates a callable default sealer                  |
| `Val.sealer<V>().impl(fns)`        | adds the type's members to the callable sealer     |
| `Val.companion<V>()`               | starts a companion without a callable sealer       |
| `Val.companion<V>().impl(fns)`     | adds the type's members and finishes the companion |
| `Val.companion<V>().implSeal(f)`   | registers a custom seal                            |
| `Val.companion<V>().implCreate(f)` | registers a function that creates a payload        |
| `Val.companion<V>().fixed<K>()`    | excludes keys from `patch`                         |

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
| `User[member](user, ...args)` | registered with `.impl({ ... })` | runs a member defined for the companion     |

## Types

|                       |                                                  |
| --------------------- | ------------------------------------------------ |
| `Val<K, T>`           | a branded value type                             |
| `AnyVal`              | a constraint over any Val                        |
| `SeedOf<V>`           | the payload accepted by constructors and seals   |
| `PayloadOf<V>`        | the payload behind the brand                     |
| `Patch<T>`            | the patch accepted for a payload                 |
| `Sealer<V>`           | what `Val.sealer<V>()` returns, never written    |
| `Sealed<V, M>`        | what its `.impl(fns)` returns, never written     |
| `CompanionBuilder<V>` | what `Val.companion<V>()` returns, never written |
| `Companion<V, M>`     | what its `.impl(fns)` returns, never written     |

The last four are exported only so that your own `.d.ts` can name them when you re-export a
companion. There is no reason to import one yourself.

## `valof/experimental`

<!-- prettier-ignore -->
> [!WARNING]
> Experimental. The design is still changing. See [Enums](enums.md) and [Traits](traits.md).

### Enum

|                                      |                                              |
| ------------------------------------ | -------------------------------------------- |
| `Enum<K, D, X>`                      | a closed set of variants, as one union       |
| `Enum.sealer<E>(tag?)`               | starts an enum whose variants are callable   |
| `Enum.companion<E>(tag?)`            | the same, for an enum with a seal of its own |
| `E.match(value, handlers)`           | dispatches on the tag, exhaustively          |
| `E[Variant](payload)`                | builds that variant, writing the tag         |
| `E[Variant].create(payload)`         | the same on a companion, through its seal    |
| `E[Variant].patch(value, patch)`     | derives a variant, never reaching the tag    |
| `E(payload)` / `E.seal(payload)`     | draws the frame from the tag, and seals      |
| `.impl(fns?)`                        | adds members taking the union, and closes    |
| `.implVariant(N, fns)`               | builds one variant                           |
| `.implSeal(seal)`                    | replaces the seal every variant passes       |
| `.implTrait(Tr, fns)`                | implements a trait the enum declares         |
| `Tag<T>`                             | names the tag field, intersected into `X`    |
| `VariantOf<E, N>`                    | the type of one variant                      |
| `SeedFor<E, N>`                      | what that variant's constructor takes        |
| `SealedPayload<E>`                   | what the boundary entry takes, tag included  |
| `VariantsOf<E>` / `SharedOf<E>`      | the declared variants, and the shared fields |
| `NameOf<E>` / `TagOf<E>`             | the enum's name, and the tag field's name    |
| `AnyEnum`                            | a constraint over any enum                   |
| `EnumSealer<E>` / `EnumBuilder<E>`   | what the steps return, never written         |
| `EnumSealed<E>` / `EnumCompanion<E>` | what `.impl` closes with, never written      |

Every step takes a callback, which is handed the companion as it stands. A member over an enum
reaches for `match`, and naming the companion inside its own initializer is TS7022. `.impl` ends the
chain.

### Trait

|                                         |                                                   |
| --------------------------------------- | ------------------------------------------------- |
| `Trait<K, Shape, M>`                    | a contract Vals share                             |
| `Trait.companion<Tr>()`                 | starts the trait's own implementation             |
| `Trait.companion<Tr>().impl(fns)`       | implements members over the shape                 |
| `Tr.dyn(companion, value)`              | boxes a value with one Val's implementation       |
| `Val.sealer<V>().implTrait(Tr, fns)`    | implements a trait the Val declares               |
| `Val.companion<V>().implTrait(Tr, fns)` | the same, without a callable sealer               |
| `Self`                                  | the implementing Val, inside a member's signature |
| `Final<F>`                              | marks a member no Val may replace                 |
| `Dyn<Tr>`                               | a boxed value, with the concrete type gone        |
| `AnyTrait`                              | a constraint over any trait                       |
| `Members`                               | the members a trait declares                      |
