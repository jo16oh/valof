# API

## Values

|                                    |                                                      |
| ---------------------------------- | ---------------------------------------------------- |
| `equals(a, b)`                     | deeply compares two Vals of the same type            |
| `Val.of<V>(value)`                 | applies the default seal with the type named         |
| `Val.unwrap(value)`                | returns a mutable copy of the payload                |
| `Val.sealer<V>()`                  | creates a callable default sealer                    |
| `Val.sealer<V>().impl(fns)`        | adds the type's functions to the callable sealer     |
| `Val.companion<V>()`               | starts a companion without a callable sealer         |
| `Val.companion<V>().impl(fns)`     | adds the type's functions and finishes the companion |
| `Val.companion<V>().implSeal(f)`   | registers a custom seal                              |
| `Val.companion<V>().implCreate(f)` | registers a function that creates a payload          |
| `Val.companion<V>().fixed<K>()`    | excludes keys from `patch`                           |

## Companion functions

`User` stands for the companion that belongs to the `User` type.

|                                |                                  |                                           |
| ------------------------------ | -------------------------------- | ----------------------------------------- |
| `User(value)`                  | built with `Val.sealer<User>()`  | applies the default seal                  |
| `User.seal(value)`             | registered with `.implSeal(f)`   | applies the custom seal                   |
| `User.create(...args)`         | registered with `.implCreate(f)` | creates a payload, then passes it to seal |
| `User.patch(user, patch)`      | `User` has an object payload     | deeply merges the patch, then seals it    |
| `User.function(user, ...args)` | registered with `.impl({ ... })` | runs a function defined for the companion |

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
