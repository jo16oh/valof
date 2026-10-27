# Enums

An enum is a discriminated union declared in one place. Each variant is a Val, and the enum is the
union of those Vals. The variants form a closed set, so TypeScript can check that every variant is
handled.

> For the limits of a hand-written discriminated union, see
> [TypeScript problems Valof addresses](typescript-problems.md#enums).

## Declare the variants

```ts
import { Enum, equals } from "valof";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>().build();

const circle = Shape.Circle.create({ r: 2 }); // { r: 2, _tag: "Circle" }

Shape.Circle.patch(circle, { r: 5 }); // { r: 5, _tag: "Circle" }, the tag stays
equals(circle, Shape.Circle.seal({ _tag: "Circle", r: 2 })); // true
```

Each key of the second type argument is a variant, and its value is that variant's payload. Valof
derives the union and each variant's brand from this one declaration. To add a variant, add a key to
this declaration.

Call a variant through the companion, as in `Shape.Circle.create(…)`.

The default `create` takes every field except the tag. It adds the tag field and passes the payload
to the variant's seal. The seal takes a payload that includes the tag field. To build a value from a
tag alone, see [Build a value](#build-a-value).

`patch` cannot change the tag, so it cannot turn a value into another variant.

Declare at least two variants. `Enum` rejects a declaration with one variant, because one variant is
a Val.

## Match on the tag

```ts
import { Enum } from "valof";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().build();
declare const shape: Shape;
// ---cut---
const area = Shape.match(shape, {
  Circle: (c) => Math.PI * c.r * c.r,
  Square: (s) => s.side * s.side,
});
```

Each handler receives its own variant. Without `_`, `match` requires a handler for every variant.
Adding a variant to the declaration then causes a type error here until the variant has a handler,
rather than falling through at run time. You write no `break` or `assertNever`, and enable no lint
rule. `match` returns the union of the handlers' return types.

`_` handles the variants that have no handler of their own.[^otherwise] Its argument is narrowed to
those variants:

```ts
import { Enum } from "valof";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>().build();
declare const shape: Shape;
// ---cut---
const size = Shape.match(shape, {
  Circle: (c) => c.r,
  _: (rest) => rest.side,
});
```

`_` also handles a variant added to the declaration later, with no type error.

## Build a value

An enum value can be built from three kinds of input, and each has its own call:

| When you have                                                  | Use                               |
| -------------------------------------------------------------- | --------------------------------- |
| the fields of a variant you already know                       | `Shape.Circle.create(fields)`     |
| a payload including its tag, such as a schema library's output | `Shape.seal(payload)`             |
| the tag alone, with the fields kept elsewhere                  | `Shape[Tag].match(tag, handlers)` |

The default `Shape.seal(payload)` reads the tag, selects that variant, and passes the payload to the
variant's seal. When you know which variant the payload is, call that variant's seal, as in
`Shape.Circle.seal(payload)`.

When you have the tag alone, `Shape[Tag].match` calls the handler for that tag. For example, the
first argument on a command line is a subcommand, and the subcommand decides how to read the
remaining arguments:

```ts
import { Enum, Tag } from "valof";
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

As with `match`, every tag in the argument's type needs a handler, or `_` handles the rest. Without
`_`, adding a variant to the declaration causes a type error here too.

## Common shape for every variant

The third type argument of `Enum` is the shape, which lists the fields that every variant has. A
[trait](traits.md) takes the same shape, as its second type argument.

```ts
import { Enum } from "valof";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
const Task = Enum.companion<Task>().build();

const todo = Task.Todo.create({ id: "t1", text: "write the docs" });
console.log(todo.id); // t1
```

Every variant's `create` and seal require those fields. A value of the union type has them, so you
can read them without narrowing it.

The third type argument also declares the [traits](traits.md) that the enum implements. See
[Implement Traits on an Enum](traits.md#implement-traits-on-an-enum).

## Build the companion

You build the companion in one chain. [`.tag`](#custom-tag-key) comes first if the enum has a custom
tag key. Then each variant's steps follow, after the variant's name, as in `.Circle.impl(…)`. They
are the same steps as in `Val.companion`. The enum's own steps come after them, and `.build()` ends
the chain.

```ts
import { Enum } from "valof";
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

A variant with no steps keeps the default companion. Write a variant's steps in the same order as in
`Val.companion`: `implSeal`, then `implCreate`, then `impl` (once), `implTrait` and `implAssoc` in
any order. Write the enum's steps in the same order too. After the first enum step, the chain no
longer offers the variants' steps.

## Check the payload

A variant's `.implSeal` replaces the variant's seal. The tag is a field of the payload, so the seal
can check it like any other field:

```ts
import { Enum } from "valof";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .Circle.implSeal((c, seal) => (c.r > 0 ? seal(c) : new Error("r must be positive")))
  .build();

Shape.Circle.create({ r: 2 }); // VariantOf<Shape, "Circle"> | Error
Shape.Square.create({ side: 1 }); // VariantOf<Shape, "Square">
```

Register the enum's `.implSeal` to check a payload that has not been validated, such as an object
from `JSON.parse`. It runs in `Shape.seal` before the tag selects a variant, so it can also reject a
tag that selects no variant:

```ts
import { Enum, type SealedPayload } from "valof";

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
variant's own `seal`, `create` and `patch` do not run the enum's `.implSeal`.

## Create a payload

Each variant has a default `create`, which takes every field except the tag. The enum has no default
`create`. `.implCreate` replaces a variant's `create`, or adds one to the enum.

A function given to a variant's `.implCreate` returns a payload without the tag field. Valof adds
the tag field before the variant's seal receives the payload. A function given to the enum's
`.implCreate` returns a payload with the tag field, and the enum's seal receives it:

```ts
import { Enum } from "valof";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;

const Task = Enum.companion<Task>()
  .Todo.implCreate((text: string) => ({ id: crypto.randomUUID(), text }))
  .implCreate((at: number) => ({ _tag: "Done" as const, id: crypto.randomUUID(), at }))
  .build();

Task.Todo.create("write the docs"); // VariantOf<Task, "Todo">
Task.create(Date.now()); // Task
```

`.implCreate.noseal` also works on the enum.

## A trait on one variant

A trait intersected into one variant's payload applies to that variant alone, and that variant
implements it:

```ts
import { Enum, Trait, type Self } from "valof";
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
import { Enum, type VariantOptions } from "valof";
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

`VariantOptions<"Shipped", […]>` applies the options in its list to `Shipped` alone.
`VariantOptions` accepts `Unpatchable` and `PrivateCreate`, but not `PrivateSeal`.

`PrivateSeal` removes `Order.seal` and every variant's `seal`, because `Order.seal` can build any
variant from its tag. `PrivateCreate` removes `create`, whether it is the default one or one
registered with `.implCreate`. On the enum, it removes `Order.create` and every variant's `create`.
In `VariantOptions`, it removes that variant's `create`.

## Custom tag key

The tag is real data, not a phantom type like the brand. It is serialized with the value, so you can
rename it to the field name that an API already uses:

```ts
import { Enum, Tag } from "valof";
// ---cut---
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
const Event = Enum.companion<Event>().tag("kind").build();

Event.Click.create({ x: 1 }); // { x: 1, kind: "Click" }
Event[Tag].key; // "kind"
```

`Tag` is declared in the third type argument, beside the shared fields, because every variant has
the tag field. `.tag` must be the first step. `.tag` is required for a renamed tag, and it rejects a
misspelled name. With the default tag, the builder has no `.tag`.

`Event[Tag].key` returns the tag's name. Pass it to a schema library that asks for the
discriminator.

## Use a variant's type

`VariantOf` is the type of one variant. Write it where you need it.

```ts
import { Enum, type VariantOf } from "valof";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
// ---cut---
const area = ({ r }: VariantOf<Shape, "Circle">) => r * r * Math.PI;
```

[^otherwise]:
    For an enum that has a variant named `_`, write `[Otherwise]` in place of `_` to handle the
    rest. `Otherwise` is a symbol exported from `valof`.
