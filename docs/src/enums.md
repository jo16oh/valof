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

const circle = Shape.Circle.create({ r: 2 }); // { r: 2, _tag: "Circle" }

Shape.Circle.patch(circle, { r: 5 }); // { r: 5, _tag: "Circle" }, the tag stays
equals(circle, Shape.Circle.seal({ _tag: "Circle", r: 2 })); // true
```

The record is the whole declaration. The union is derived from it, and so is each variant's brand:
`Shape.Circle` is branded `"Shape.Circle"`. Adding a variant is one line, in one place.

Call a variant through the companion. `const { Circle } = Shape` works, and a reader of
`Circle.create({ r: 2 })` then has to find which enum declared it. `const Round = Shape.Circle`
gives it another name, which `companion-mismatch` reports.

`create` writes the tag and passes the payload to the variant's seal. The seal takes the payload a
value holds, tag included, so a value survives a round trip through JSON:
`Shape.Circle.seal(JSON.parse(JSON.stringify(circle)))`. Both deep-copy their payload like any other
constructor. For a payload that carries its tag, or a tag that arrives alone, see
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
| the fields of a variant you already know                      | `Shape.Circle.create(fields)`     |
| a payload carrying its tag, such as a schema library's output | `Shape.seal(payload)`             |
| the tag alone, with the fields kept elsewhere                 | `Shape[Tag].match(tag, handlers)` |

`Shape.seal(payload)` reads the tag, selects that variant, and passes the payload to its seal.
Passing a field of another variant is a type error, even when the tag is a union. Where the variant
is known, `Shape.Circle.seal(payload)` accepts the same payload and returns that variant.

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
  New: () => Command.New.create({ name: input.args[0] ?? "" }),
  Rename: () => Command.Rename.create({ from: input.args[0] ?? "", to: input.args[1] ?? "" }),
  Check: () => Command.Check.create({}),
});
```

Every tag the argument's type allows needs a handler, so adding a variant to the declaration fails
here too, as it does for `match`. `_` handles the remaining tags here too. A handler takes no
argument and calls its variant's `create`, so each payload is checked against its own variant.

## Common shape for every variant

The third argument is the shape: the fields every variant holds. It is the same argument a
[trait](traits.md) takes.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
const Task = Enum.companion<Task>().build();

const todo = Task.Todo.create({ id: "t1", text: "write the docs" });
console.log(todo.id); // t1
```

Every variant's `create` and seal require the shape, the union reads it without a `match`, and
`VariantOf` carries it.

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

Shape.Circle.diameter(Shape.Circle.create({ r: 2 })); // 4
```

A variant you write nothing for keeps the default companion. Each variant's steps follow the order a
Val's do: `implSeal`, then `implCreate`, then `impl` (once) and `implTrait`. The enum's steps follow
the same order. The first of them removes the variants' steps from the chain.

## Check the payload

A variant's `.implSeal` replaces that variant's seal, the same as [a Val's](custom-constructors.md).
It receives the payload with its tag, so it can check the tag the way it checks any other field:

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .Circle.implSeal((c, seal) => (c.r > 0 ? seal(c) : new Error("r must be positive")))
  .build();

Shape.Circle.create({ r: 2 }); // VariantOf<Shape, "Circle"> | Error
Shape.Square.create({ side: 1 }); // VariantOf<Shape, "Square">
```

Whatever a seal returns propagates, as it does for a Val. `create` and `patch` derive through the
same seal, so no construction skips it. `Shape.seal` passes the payload to the variant's seal, so
its return is the variants' returns, as a union.

A variant's seal sees the tag of every payload it receives, and a payload whose tag is not a
declared variant reaches none of them. A payload from `JSON.parse` is `any`, so its tag can hold
such a name. To pass such a payload to `Shape.seal`, register the enum's `.implSeal`. It runs in
`Shape.seal` before the tag selects a variant, so it can reject the tag:

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
`patch` do not pass through the enum's seal, because the variant is already known there. A payload a
schema library has already checked, typed as a variant's payload, needs no enum seal.

## Create a payload

`.implCreate` replaces `create`, the same as [a Val's](custom-constructors.md). On a variant, it
creates that variant's payload without the tag, and the tag is written before its seal receives it.
On the enum, it creates a tagged payload, which `Shape.seal` receives:

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

Without `.implCreate`, a variant's `create` accepts the fields, and the enum has no `create`.
`.implCreate.noseal` works on both, as it does on a Val.

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

Named.dyn(Item.Book, Item.Book.create({ label: "Dune", pages: 412 })).named(); // "Dune, 412 pages"
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
`Order.seal` reaches every variant through the tag. `PrivateCreate` removes `create`, the default
one or one `.implCreate` registered. On the enum, it removes every variant's `create` and
`Order.create`. In `OptionsFor`, it removes one variant's `create`.

## Custom tag key

The tag is real data, not a phantom. It crosses the wire, so you can customize the name when an API
already has one:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
const Event = Enum.companion<Event>().tag("kind").build();

Event.Click.create({ x: 1 }); // { x: 1, kind: "Click" }
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
