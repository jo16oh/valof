# Allowed Types

Only three things can be a payload:

|            |                                                                |
| ---------- | -------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `null` (below the top level) |
| Arrays     | `allowed[]`, or a tuple: `[allowed, allowed]`                  |
| Objects    | `{ k: allowed }`, or `Record<string, allowed>`                 |

A Val is itself one of these, so Vals nest. A field may hold `null` or a primitive beside one other
kind, as `string[] | null` or `User | null`. A union of objects is rejected. A tuple keeps its
positions and its length. One with a rest element (`[string, ...number[]]`) reads as an array
instead, since a fixed length is what distinguishes the two.

A payload cannot contain a type parameter, and a Val's brand cannot be one. To declare several Vals
with the same payload, share it with `Payload`:

```ts
import { Val, type Payload } from "valof";

type Contact = Payload<{ name: string; email: string }>;
type Customer = Val<"Customer", Contact>;
type Supplier = Val<"Supplier", Contact>;
```

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
all classes. See [Dates](patterns.md#dates) and [Map / Set](patterns.md#map--set) instead.

A class of plain fields is the one TypeScript cannot distinguish from an object, and sealing one
throws in development.

## A type that references itself

A tree holds trees. Write the self-reference as `Rec<Tree>`.

```ts
import { Val, type Rec } from "valof";

// ---cut---
type Tree = Val<"Tree", { value: number; children: Rec<Tree>[] }>;
const Tree = Val.companion<Tree>().build();

const leaf = Tree.seal({ value: 1, children: [] });
const root = Tree.seal({ value: 2, children: [leaf] });

root.children[0]; // Tree
```

`Rec` is erased. The value holds a `Tree`, and the constructor takes one. It exists for the
declaration alone.

Without it the declaration compiles and the first use of the type fails.

```ts
// @errors: 2615
import { Val } from "valof";

// ---cut---
type Tree = Val<"Tree", { value: number; children: Tree[] }>;

const Tree = Val.companion<Tree>().build();
```
