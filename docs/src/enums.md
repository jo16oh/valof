# Enums

<!-- prettier-ignore -->
> [!WARNING]
> Enums are experimental. They ship from `valof/experimental` so that an import says so, and the
> design is still changing.

An enum is a closed set of variants. A Val is one shape; an enum is a choice between several, and
because the set is closed, handling every case can be checked.

> For the limits of a hand-written discriminated union, see
> [TypeScript problems Valof addresses](typescript-problems.md#enums).

## Declare the variants

```ts
import { equals } from "valof";
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>().build();

const circle = Shape.Circle.seal({ r: 2 }); // { r: 2, _tag: "Circle" }

Shape.Circle.patch(circle, { r: 5 }); // { r: 5, _tag: "Circle" }, the tag stays
equals(circle, Shape.Circle.seal({ r: 2 })); // true
```

The record is the whole declaration. The union is derived from it, and so is each variant's brand:
`Shape.Circle` is branded `"Shape.Circle"`. Adding a variant is one line, in one place.

Call a variant through the companion. `const { Circle } = Shape` works, and a reader of
`Circle.seal({ r: 2 })` then has to find which enum declared it. `const Round = Shape.Circle` gives
it another name, which `companion-mismatch` reports.

A variant's seal writes the tag. It does not take one, and it deep-copies its payload like any other
seal. For a payload that carries its tag, or a tag that arrives alone, see
[Build a value](#build-a-value).

A variant is a Val. It patches, it compares, and it nests. A patch cannot reach the tag, so it
cannot switch variants.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Style = Enum<"Style", { Solid: { width: number }; Dashed: { gap: number } }>;
type Card = Enum<"Card", { Plain: { w: number }; Framed: { w: number; style: Style } }>;
```

A nested variant is a patch boundary like any nested Val. Replace it with one a seal built, rather
than merging into it.

Define two variants at least. One variant is a Val, and TypeScript loses the alias for a union of
one, which breaks the declarations of a package that exports the companion.

## Match on the tag

```ts
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().build();
declare const shape: Shape;
// ---cut---
const area = Shape.match(shape, {
  Circle: (c) => Math.PI * c.r * c.r,
  Square: (s) => s.side * s.side,
});
```

Each handler takes its own variant, narrowed, with no annotation. Every variant needs a handler, so
adding one to the declaration fails here rather than falling through at run time. No `break`, no
`assertNever`, and no lint rule to enable. The return type is the handlers' union.

`_` handles the variants that have no handler of their own, with its argument narrowed to them:

```ts
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().build();
declare const shape: Shape;
// ---cut---
const size = Shape.match(shape, {
  Circle: (c) => c.r,
  _: (rest) => rest.side,
});
```

`_` then handles a variant added to the declaration, with no type error.

`match` sits on the companion because the tag's name is customizable, and a free function would have
to hard-code it.

Use `match` to split on the tag. For a condition inside a variant, a pattern matching library such
as ts-pattern fits. `_tag` is real data, so `.with({ _tag: "Circle" }, …)` already works.

## Build a value

An enum value can be built from three kinds of input, and each has its own call:

| When you have                                                 | Use                               |
| ------------------------------------------------------------- | --------------------------------- |
| a payload for a variant you already know                      | `Shape.Circle.seal(payload)`      |
| a payload carrying its tag, such as a schema library's output | `Shape.seal(payload)`             |
| the tag alone, with the fields kept elsewhere                 | `Shape[Tag].match(tag, handlers)` |

`Shape.seal(payload)` reads the tag, selects that variant, and passes the payload to its seal.
Passing a field of another variant is a type error, even when the tag is a union.

When the tag arrives alone, `[Tag].match` selects the handler from the tag. On a command line, the
first argument is the subcommand, and how to read the rest depends on it:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Command = Enum<
  "Command",
  { New: { name: string }; Rename: { from: string; to: string }; Check: Record<never, never> }
>;
const Command = Enum.companion<Command>().build();
// The subcommand, already normalized to its tag, and the arguments after it.
declare const input: { tag: "New" | "Rename" | "Check"; args: readonly string[] };

const command = Command[Tag].match(input.tag, {
  New: () => Command.New.seal({ name: input.args[0] ?? "" }),
  Rename: () => Command.Rename.seal({ from: input.args[0] ?? "", to: input.args[1] ?? "" }),
  Check: () => Command.Check.seal({}),
});
```

Every tag the argument's type allows needs a handler, so adding a variant to the declaration fails
here too, as it does for `match`. `_` handles the remaining tags here too. A handler takes no
argument and calls its variant's seal, so each payload is checked against its own variant.

## Common shape for every variant

The third argument is the shape: the fields every variant holds. It is the same argument a
[trait](traits.md) takes.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
const Task = Enum.companion<Task>().build();

const todo = Task.Todo.seal({ id: "t1", text: "write the docs" });
console.log(todo.id); // t1
```

Every variant's seal requires the shape, the union reads it without a `match`, and `VariantOf`
carries it.

The same argument declares the [traits](traits.md) the enum implements.

## Build the companion

The companion is one chain. Each variant's steps come first, under its name, and they are the steps
of a Val's companion. The enum's own steps follow, and `.build()` closes the chain.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .Circle.impl({ diameter: (c) => c.r * 2 })
  .impl({
    // A member calling `match`, a variant, or a sibling annotates its return type, to avoid an
    // implicit `any`. A variant's member reaches the companion the same way.
    area: (s): number =>
      Shape.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
      }),
  })
  .build();

Shape.Circle.diameter(Shape.Circle.seal({ r: 2 })); // 4
```

A variant you write nothing for keeps the default companion. Each variant's steps follow the order a
Val's do: `implSeal`, then `implCreate`, then `impl` (once) and `implTrait`. The enum's steps follow
the same order. The first of them removes the variants' steps from the chain.

## Check the payload

A variant's `.implSeal` replaces that variant's seal, the same as [a Val's](custom-constructors.md).
It receives the payload without the tag, and the seal it calls writes the tag:

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .Circle.implSeal((c, seal) => (c.r > 0 ? seal(c) : new Error("r must be positive")))
  .build();

Shape.Circle.seal({ r: 2 }); // VariantOf<Shape, "Circle"> | Error
Shape.Square.seal({ side: 1 }); // VariantOf<Shape, "Square">
```

Whatever a seal returns propagates, as it does for a Val. `patch` derives through the same seal, so
no derivation skips it. `Shape.seal` passes a tagged payload to the variant's seal, so its return is
the variants' returns, as a union.

`Shape.seal` reads the tag before any variant's seal runs. A payload from `JSON.parse` is `any`, and
its tag can hold a variant name the declaration lacks. No variant's seal sees that payload. The
enum's own `.implSeal` runs in `Shape.seal` before the tag selects a variant, so it can reject the
tag:

```ts
import { Enum, type SealedPayload } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
// A discriminated union from a schema library, on `_tag`.
declare const schema: {
  safeParse(
    input: unknown,
  ): { success: true; data: SealedPayload<Shape> } | { success: false; error: Error };
};
// ---cut---
const Shape = Enum.companion<Shape>()
  .implSeal((input: object, seal) => {
    const result = schema.safeParse(input);
    return result.success ? seal(result.data) : result.error;
  })
  .build();

Shape.seal(JSON.parse('{ "_tag": "Triangle" }')); // the schema's Error
```

The seal it receives selects the variant and runs its seal. A variant's own `seal`, `create` and
`patch` do not pass through the enum's seal, because the tag is already known there.

## Create a payload

`.implCreate` registers `create`, the same as [a Val's](custom-constructors.md). On a variant, it
creates that variant's payload, which its seal receives. On the enum, it creates a tagged payload,
which `Shape.seal` receives:

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;

const Task = Enum.companion<Task>()
  .Todo.implCreate((text: string) => ({ id: crypto.randomUUID(), text }))
  .implCreate((at: number) => ({ _tag: "Done" as const, id: crypto.randomUUID(), at }))
  .build();

Task.Todo.create("write the docs"); // VariantOf<Task, "Todo">
Task.create(Date.now()); // Task
```

Without `.implCreate`, there is no `create`. `.implCreate.noseal` works on both, as it does on a
Val.

## A trait on one variant

A trait intersected into one variant's payload belongs to that variant alone, and the variant
implements it:

```ts
import { Enum, Trait, type Self } from "valof/experimental";
// ---cut---
type Named = Trait<"Named", { label: string }, { named: (self: Self) => string }>;
const Named = Trait.companion<Named>().build();

type Item = Enum<"Item", { Book: { pages: number } & Named; Pen: { ink: string } }>;
const Item = Enum.companion<Item>()
  .Book.implTrait(Named, { named: (b) => `${b.label}, ${b.pages} pages` })
  .build();

Named.dyn(Item.Book, Item.Book.seal({ label: "Dune", pages: 412 })).named(); // "Dune, 412 pages"
```

A trait the enum declares cannot be declared again on a variant. `dyn` selects the implementation by
the companion it receives, so `Named.dyn(Item, book)` and `Named.dyn(Item.Book, book)` would call
different ones.

## Companion options

The list after the enum accepts the same options as a Val's. `Unpatchable<K>` excludes `K` from
`patch` on every variant that holds it. `OptionsFor` adds options for one variant:

```ts
import type { Unpatchable } from "valof";
import { Enum, type OptionsFor } from "valof/experimental";
// ---cut---
type Order = Enum<
  "Order",
  { Pending: { note: string }; Shipped: { note: string; shippedAt: number } },
  { id: string }
>;

const Order = Enum.companion<
  Order,
  [Unpatchable<"id">, OptionsFor<"Shipped", [Unpatchable<"shippedAt">]>]
>().build();
```

`PrivateSeal` goes on the enum alone. It removes `Order.seal` and every variant's `seal`, because
`Order.seal` reaches every variant through the tag.

## Custom tag key

The tag is real data, not a phantom. It crosses the wire, so you can customize the name when an API
already has one:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
const Event = Enum.companion<Event>().tag("kind").build();

Event.Click.seal({ x: 1 }); // { x: 1, kind: "Click" }
Event[Tag].key; // "kind"
```

`Tag` goes in the third argument, beside the shared fields, because the tag is a field every variant
holds. `.tag` is the first step, because the companion writes the tag at run time, and the type
argument is not readable from a value. The type requires it, rejects a misspelled name, and the
builder has no `.tag` where the default applies.

`Event[Tag].key` returns the name, for a schema library that asks for the discriminator.

## Use a variant's type

`VariantOf` is the type of a single variant, and it is what errors and hovers print. Write it where
you need it.

```ts
import { Enum, type VariantOf } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
// ---cut---
const area = ({ r }: VariantOf<Shape, "Circle">) => r * r * Math.PI;
```
