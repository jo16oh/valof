# Enums

<!-- prettier-ignore -->
> [!WARNING]
> Enums are experimental. They ship from `valof/experimental` so that an import says so, and the
> design is still changing.

An enum is a discriminated union declared in one place. Each variant is a Val, and the enum is the
union of those Vals. The variants form a closed set, so TypeScript can check that every variant is
handled.

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

Each key of the second type argument is a variant, and its value is that variant's payload. Valof
derives the union and each variant's brand from this one declaration. The brand of `Shape.Circle` is
`"Shape.Circle"`. To add a variant, add a key to this declaration.

Call a variant through the companion, as in `Shape.Circle.create(…)`.

The default `create` takes the fields without the tag. It adds the tag and passes the payload to the
variant's seal. The seal takes the payload with its tag. Both deep-copy the payload, like any other
constructor. To build a value from a payload that has its tag, or from a tag alone, see
[Build a value](#build-a-value).

`patch` and `equals` work on a variant as on any Val. A variant can also be nested in another
payload. `patch` cannot change the tag, so it cannot turn a value into another variant.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Style = Enum<"Style", { Solid: { width: number }; Dashed: { gap: number } }>;
type Card = Enum<"Card", { Plain: { w: number }; Framed: { w: number; style: Style } }>;
```

As with any nested Val, a patch replaces a nested variant rather than merging into it. Derive the
nested variant with its own `patch`, so that its own seal checks the change.

Declare at least two variants. `Enum` rejects a declaration with one variant, because one variant is
a Val. TypeScript also drops the alias of a union with one member, which breaks the declaration
files of a package that exports the companion.

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

Each handler receives its own variant, already narrowed, so it needs no type annotation. `match`
requires a handler for every variant. Adding a variant to the declaration causes a type error here
until the variant has a handler, rather than falling through at run time. You write no `break` or
`assertNever`, and enable no lint rule. `match` returns the union of the handlers' return types.

`_` handles the variants that have no handler of their own. Its argument is narrowed to those
variants:

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

`_` also handles a variant added to the declaration later, with no type error.[^otherwise]

Use `match` to branch on the tag. To branch on the fields inside a variant, use a pattern matching
library such as ts-pattern. The tag is an ordinary field, so `.with({ _tag: "Circle" }, …)` already
works.

## Build a value

An enum value can be built from three kinds of input, and each has its own call:

| When you have                                                  | Use                               |
| -------------------------------------------------------------- | --------------------------------- |
| the fields of a variant you already know                       | `Shape.Circle.create(fields)`     |
| a payload including its tag, such as a schema library's output | `Shape.seal(payload)`             |
| the tag alone, with the fields kept elsewhere                  | `Shape[Tag].match(tag, handlers)` |

`Shape.seal(payload)` reads the tag, selects that variant, and passes the payload to the variant's
seal. A payload with a field of another variant is a type error. When you know the variant,
`Shape.Circle.seal(payload)` takes the same payload and returns that variant.

When you have the tag alone, `Shape[Tag].match` calls the handler for that tag. For example, the
first argument on a command line is a subcommand, and the subcommand decides how to read the
remaining arguments:

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

As with `match`, every tag in the argument's type needs a handler, so adding a variant to the
declaration causes a type error here too. `_` handles the remaining tags. A handler takes no
argument. It calls its variant's `create`, so TypeScript checks each payload against that variant.

## Common shape for every variant

The third type argument of `Enum` is the shape, which lists the fields that every variant has. A
[trait](traits.md) takes the same shape, as its second type argument.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
const Task = Enum.companion<Task>().build();

const todo = Task.Todo.create({ id: "t1", text: "write the docs" });
console.log(todo.id); // t1
```

Every variant's `create` and seal require those fields. A value of the union type has them, so you
can read them without `match`. `VariantOf` includes them too.

The same type argument also declares the [traits](traits.md) that the enum implements.

## Build the companion

You build the companion in one chain. Each variant's steps come first, after the variant's name, as
in `.Circle.impl(…)`. They are the same steps as in `Val.companion`. The enum's own steps follow,
and `.build()` ends the chain.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
  .impl(() => ({
    // Annotate the return type of a member that uses `match`, a variant or another member
    // through the companion. Without it, the return type is an implicit `any`. The same applies
    // to a variant's member.
    area: (s): number =>
      Shape.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
      }),
  }))
  .build();

Shape.Circle.diameter(Shape.Circle.create({ r: 2 })); // 4
```

A variant with no steps keeps the default companion. A variant's steps go in the same order as in
`Val.companion`: `implSeal`, then `implCreate`, then `impl` (once), `implTrait` and `implAssoc` in
any order. The enum's steps go in the same order. After the first enum step, the chain no longer
offers the variants' steps.

## Check the payload

A variant's `.implSeal` replaces the variant's seal, as it does in
[`Val.companion`](custom-constructors.md). The seal receives the payload with its tag, so it can
check the tag like any other field:

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

As for a Val, `create` and `patch` return whatever the seal returns, so no way of building a variant
skips its seal, except `.implCreate.noseal`. Without an enum `.implSeal`, `Shape.seal` returns the
union of what the variants' seals return.

Register the enum's `.implSeal` to check a payload that has not been validated, such as an object
from `JSON.parse`. It runs in `Shape.seal` before the tag selects a variant, so it can also reject a
tag that selects no variant:

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

The `seal` that the enum's `.implSeal` receives selects the variant and runs that variant's seal. A
variant's own `seal`, `create` and `patch` skip the enum's seal, because they already know the
variant. A payload that a schema library has already validated as one variant's payload does not
need the enum's seal.

## Create a payload

`.implCreate` replaces `create`, as it does in [`Val.companion`](custom-constructors.md). A
variant's `.implCreate` returns the payload without the tag. Valof adds the tag before the variant's
seal receives the payload. The enum's `.implCreate` returns a payload with its tag, and `Task.seal`
receives it:

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

Without `.implCreate`, a variant's `create` takes the fields, and the enum has no `create`.
`.implCreate.noseal` works on a variant and on the enum, as it does in `Val.companion`.

## A trait on one variant

A trait intersected into one variant's payload applies to that variant alone, and that variant
implements it:

```ts
import { Enum, Trait, type Self } from "valof/experimental";
// ---cut---
type Named = Trait<"Named", { label: string }, { named: (self: Self) => string }>;
const Named = Trait.companion<Named>().build();

type Item = Enum<"Item", { Book: { pages: number } & Named; Pen: { ink: string } }>;
const Item = Enum.companion<Item>()
  .Book.implTrait(Named, () => ({ named: (b) => `${b.label}, ${b.pages} pages` }))
  .build();

Named.dyn(Item.Book, Item.Book.create({ label: "Dune", pages: 412 })).named(); // "Dune, 412 pages"
```

A variant cannot declare a trait that the enum already declares. `dyn` selects the implementation
from the companion passed to it. If both declared the trait, `Named.dyn(Item, book)` and
`Named.dyn(Item.Book, book)` would call different implementations.

## Companion options

The second type argument of `Enum.companion` takes the same options as in `Val.companion`.
`Unpatchable<"id">` excludes `id` from `patch` on every variant that has it. `VariantOptions` adds
options for one variant:

```ts
import type { Unpatchable } from "valof";
import { Enum, type VariantOptions } from "valof/experimental";
// ---cut---
type Order = Enum<
  "Order",
  { Pending: { note: string }; Shipped: { note: string; shippedAt: number } },
  { id: string }
>;

const Order = Enum.companion<
  Order,
  [Unpatchable<"id">, VariantOptions<"Shipped", [Unpatchable<"shippedAt">]>]
>().build();
```

`PrivateSeal` goes on the enum only, not in `VariantOptions`. It removes `Order.seal` and every
variant's `seal`, because `Order.seal` can build any variant from its tag. `PrivateCreate` removes
`create`, whether it is the default one or one registered with `.implCreate`. On the enum, it
removes `Order.create` and every variant's `create`. In `VariantOptions`, it removes that variant's
`create`.

## Custom tag key

The tag is real data, not a phantom type like the brand. It is serialized with the value, so you can
rename it to the field name that an API already uses:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
const Event = Enum.companion<Event>().tag("kind").build();

Event.Click.create({ x: 1 }); // { x: 1, kind: "Click" }
Event[Tag].key; // "kind"
```

`Tag` goes in the third type argument, beside the shared fields, because every variant has the tag
field. `.tag` must be the first step. The companion writes the tag at run time, and a type argument
does not exist at run time. TypeScript requires `.tag` for a renamed tag and rejects a misspelled
name. With the default tag, the builder has no `.tag`.

`Event[Tag].key` returns the tag's name. Pass it to a schema library that asks for the
discriminator.

## Use a variant's type

`VariantOf` is the type of one variant. Type errors and hovers print this type. Write it where you
need it.

```ts
import { Enum, type VariantOf } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
// ---cut---
const area = ({ r }: VariantOf<Shape, "Circle">) => r * r * Math.PI;
```

[^otherwise]:
    For an enum that has a variant named `_`, write `[Otherwise]` in place of `_` to handle the
    rest. `Otherwise` is a symbol exported from `valof/experimental`.
