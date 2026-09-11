# API

|                                    |                                                                   |
| ---------------------------------- | ----------------------------------------------------------------- |
| `Val<K, T>`                        | a branded value type                                              |
| `Val.of<V>(value)`                 | the default seal, with the type named explicitly                  |
| `Val.unwrap(value)`                | a mutable copy of the payload                                     |
| `Val.sealer<V>()`                  | the default seal, carrying `equals` / `patch` / `update`          |
| `Val.sealer<V>().impl(fns)`        | the constructor plus your functions                               |
| `Val.companion<V>().impl(fns)`     | functions only — no constructor                                   |
| `.implEquals(spec)`                | replaces `equals`: your own comparison, or a spec per child       |
| `Val.companion<V>().implSeal(f)`   | replaces the `seal`: a constructor that can validate inputs       |
| `Val.companion<V>().implCreate(f)` | registers `create`: a constructor that generates values inside it |
| `Val.companion<V>().fixed<K>()`    | takes keys out of `patch` / `update`                              |
| `AnyVal`                           | a constraint over any Val                                         |
| `SeedOf<V>`                        | what a value can be grown from                                    |
| `PayloadOf<V>`                     | the payload behind the brand                                      |
| `Patch<T>`                         | what `patch` takes, over a payload                                |
| `Sealer<V>`                        | what `Val.sealer<V>()` returns, never written                     |
| `Sealed<V, M>`                     | what its `.impl(fns)` returns, never written                      |
| `CompanionBuilder<V>`              | what `Val.companion<V>()` returns, never written                  |
| `Companion<V, M>`                  | what its `.impl(fns)` returns, never written                      |

The last four are exported only so that your own `.d.ts` can name them when you re-export a
companion — there is no reason to import one yourself.
