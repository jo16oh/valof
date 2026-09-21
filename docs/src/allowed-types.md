# Allowed types

Only three things can be a payload:

|            |                                                                        |
| ---------- | ---------------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint`; `null` below the top level |
| Arrays     | `allowed[]`, or a tuple: `[allowed, allowed]`                          |
| Objects    | `{ k: allowed }`, or `Record<string, allowed>`                         |

A Val is itself one of these, so Vals nest. A tuple keeps its positions and its length. One with a
rest element (`[string, ...number[]]`) reads as an array instead, since a fixed length is what
distinguishes the two.

## Write the payload plain

`Val` makes the payload deeply readonly on its own, so `readonly` in the definition changes nothing
about the value. Writing it makes [`Val.unwrap`](utilities.md#valunwrap) return a readonly payload,
which is what `unwrap` exists to avoid.

```ts
import { Val } from "valof";

declare const post: Post;
// ---cut---
type Post = Val<"Post", { tags: string[] }>; // not `readonly string[]`

post.tags; // readonly string[] all the same
Val.unwrap(post).tags.sort(); // ✓ returns a mutable `string[]`
```

## Classes and functions

Neither a class instance nor a function can be a payload. `Date`, `Temporal`, `Map` and `Set` are
all classes; see [Dates](patterns.md#dates) and [Map / Set](patterns.md#map--set) instead.
TypeScript rejects them, on the first use of the Val rather than on the `type` line.

A class of plain fields is the one TypeScript cannot distinguish from an object. Sealing one throws
in development. A production build skips that check and copies the own enumerable keys, so a `Date`
is copied as `{}`, and an instance keeps its fields but loses its prototype.

## A type that references itself

A tree holds trees. Write the self-reference as `Rec<Tree>`.

```ts
import { Val, type Rec } from "valof";

// ---cut---
type Tree = Val<"Tree", { value: number; children: Rec<Tree>[] }>;
const Tree = Val.sealer<Tree>();

const leaf = Tree({ value: 1, children: [] });
const root = Tree({ value: 2, children: [leaf] });

root.children[0]; // Tree
```

`Rec` is erased. The value holds a `Tree`, the constructor takes a `Tree`, and `patch` and the
companion's members work as they do for any other type. It exists for the declaration alone.

Without it the declaration compiles and the first use of the type fails. Resolving `Tree` would need
`Tree`, and a `Rec` is a reference to an interface, which TypeScript resolves later.

```ts
// @errors: 2589
import { Val } from "valof";

// ---cut---
type Tree = Val<"Tree", { value: number; children: Tree[] }>;

const Tree = Val.sealer<Tree>();
```
