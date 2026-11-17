# Allowed Types

Only three things can be a payload:

|            |                                                                |
| ---------- | -------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `null` (below the top level) |
| Arrays     | `allowed[]`, or a tuple: `[allowed, allowed]`                  |
| Objects    | `{ k: allowed }`, with every key listed                        |

A record keyed by any string, such as `Record<string, Money>`, is not a payload. Declare a
[`Val.Record`](patterns.md#map--set) for it.

A Val is itself one of these, so Vals nest. A Val may share a field only with `null`, as
`User | null`. [`equals`](utilities.md#equals) compares structurally, so in a field of
`Dollar | Yen` it would find a `Dollar` of 1 equal to a `Yen` of 1. Declare an [enum](enums.md) of
those types instead. Its tag distinguishes the variants. Any other field may hold `null` or a
primitive beside one other kind, as `string[] | null` or `string | string[]`. A union of objects is
rejected, and so is a field holding an [`Impl`](traits.md#implement-it-on-a-val). A tuple keeps its
positions and its length. Valof treats one with a rest element (`[string, ...number[]]`) as an array
instead, since a fixed length is what distinguishes the two.

Every key is required. Type a field that may hold nothing as `T | undefined` or `T | null`. The
value keeps the key. `JSON.stringify` leaves out a key holding `undefined`. An array element cannot
be `undefined`, since JSON writes it as `null`. For a tuple whose last elements may be missing,
declare a union of tuples, as `[number, number] | [number, number, number]`.

```ts
// @errors: 2344
import { Val } from "valof";

// ---cut---
type Profile = Val<"Profile", { name: string; bio: string | undefined }>; // ✓
type Draft = Val<"Draft", { name: string; bio?: string }>; // a key cannot be optional
```

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

Neither a class instance nor a function can be a payload. `Date`, the `Temporal` types, `Map` and
`Set` are all classes. See [Dates](patterns.md#dates) and [Map / Set](patterns.md#map--set) instead.

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

Without it, the declaration is a type error.

```ts
// @errors: 2615
import { Val } from "valof";

// ---cut---
type Tree = Val<"Tree", { value: number; children: Tree[] }>;
```
