# Allowed types

Only three things can live inside a Val:

|            |                                                                        |
| ---------- | ---------------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint`; `null` below the top level |
| Arrays     | `ReadonlyArray<allowed>`, or a tuple: `readonly [allowed, allowed]`    |
| Objects    | `{ readonly k: allowed }`, or `Readonly<Record<string, allowed>>`      |

A Val is itself one of these, so Vals nest. A tuple keeps its positions and its length. One with a
rest element (`readonly [string, ...number[]]`) reads as an array instead, since a fixed length is
what distinguishes the two.

Neither a class instance nor a function can go in. `Date`, `Temporal`, `Map` and `Set` are all
classes; see [Dates](patterns.md#dates) and [Map / Set](patterns.md#map--set) instead. TypeScript
rejects them, on the first use of the Val rather than on the `type` line.

A class of plain fields is the one TypeScript cannot distinguish from an object. Sealing one throws
in development. A production build skips that check and copies the own enumerable keys, so a `Date`
comes out as `{}`, and an instance keeps its fields but loses its prototype.
