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

const Shape = Enum.sealer<Shape>();

const circle = Shape.Circle({ r: 2 }); // { r: 2, _tag: "Circle" }

Shape.Circle.patch(circle, { r: 5 }); // { r: 5, _tag: "Circle" }, the tag stays
equals(circle, Shape.Circle({ r: 2 })); // true
```

The record is the whole declaration. The union is derived from it, and so is each variant's brand:
`Shape.Circle` is branded `"Shape.Circle"`. Adding a variant is one line, in one place.

Call a variant through the companion. `const { Circle } = Shape` works, and a reader of
`Circle({ r: 2 })` then has to find which enum declared it. `const Round = Shape.Circle` gives it
another name, which `companion-mismatch` reports.

The constructor writes the tag. It does not take one, and it deep-copies its payload like any other
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

A nested variant is a patch boundary like any nested Val. Replace it with one the constructor built,
rather than merging into it.

Define two variants at least. One variant is a Val, and TypeScript loses the alias for a union of
one, which breaks the declarations of a package that exports the companion.

## Match on the tag

```ts
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.sealer<Shape>();
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

`match` sits on the companion because the tag's name is customizable, and a free function would have
to hard-code it.

Use `match` to split on the tag. For a condition inside a variant, a pattern matching library such
as ts-pattern fits. `_tag` is real data, so `.with({ _tag: "Circle" }, …)` already works.

## Build a value

An enum value can be built from three kinds of input, and each has its own call:

| When you have                                                 | Use                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| a payload for a variant you already know                      | `Shape.Circle(payload)`, or `Shape.Circle.create(payload)` on a companion |
| a payload carrying its tag, such as a schema library's output | `Shape(payload)`, or `Shape.seal(payload)` on a companion                 |
| the tag alone, with the fields kept elsewhere                 | `Shape[Tag].match(tag, handlers)`                                         |

`Shape(payload)` reads the tag, selects that variant, and accepts only its fields. Passing a field
of another variant is a type error, even when the tag is a union.

When the tag arrives alone, `[Tag].match` selects the handler from the tag. On a command line, the
first argument is the subcommand, and how to read the rest depends on it:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Command = Enum<
  "Command",
  { new: { name: string }; rename: { from: string; to: string }; check: Record<never, never> }
>;
const Command = Enum.sealer<Command>();
declare const [subcommand, ...args]: ["new" | "rename" | "check", ...string[]];

const command = Command[Tag].match(subcommand, {
  new: () => Command.new({ name: args[0] ?? "" }),
  rename: () => Command.rename({ from: args[0] ?? "", to: args[1] ?? "" }),
  check: () => Command.check({}),
});
```

Every tag the argument's type allows needs a handler, so adding a variant to the declaration fails
here too, as it does for `match`. A handler takes no argument and calls its variant's constructor,
so each payload is checked against its own variant.

## Common shape for every variant

The third argument is the shape: the fields every variant holds. It is the same argument a
[trait](traits.md) takes.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Task = Enum<"Task", { Todo: { text: string }; Done: { at: number } }, { id: string }>;
const Task = Enum.sealer<Task>();

const todo = Task.Todo({ id: "t1", text: "write the docs" });
console.log(todo.id); // t1
```

Every constructor requires the shape, the union reads it without a `match`, and `VariantOf` carries
it.

The same argument declares the [traits](traits.md) the enum implements.

## Members

`.impl` collects the members that take the union, and `.implVariant` builds one variant, named in
the first argument. `.implVariant` takes a callback, passed that variant's steps.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.sealer<Shape>()
  .implVariant("Circle", (sealer) => sealer.impl({ diameter: (c) => c.r * 2 }))
  .impl({
    // A member calling `match`, a variant, or a sibling annotates its return type, to avoid an
    // implicit `any`. A member written inside `.implVariant` reaches the enum's companion the
    // same way.
    area: (s): number =>
      Shape.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
      }),
  });

Shape.Circle.diameter(Shape.Circle({ r: 2 })); // 4
```

A variant you write nothing for keeps the default companion, and a variant already built cannot be
named again. The steps are already that variant's companion, so a callback with nothing to collect
returns the argument: `.implVariant("Circle", (sealer) => sealer)`. What a step returns is closed.
That variant takes no further step.

No step chooses between a sealer and a companion. `Enum.sealer` makes every variant callable,
`Enum.companion` builds every one with `.create`, so the entry point you choose for the enum applies
to every variant.

`.impl` takes one call, which closes every step, so nothing can add a second seal to a companion you
export. Call it with nothing where there is no member to collect:
`Enum.sealer<Shape>().implVariant(…).impl()`.

## Check the payload

`Enum.sealer` accepts every payload the type allows. When construction has rules of its own, start
from `Enum.companion`, the same as [a Val](custom-constructors.md). Every variant then builds with
`.create`, and the enum gains a `seal` of its own.

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }, { id: string }>;

const Shape = Enum.companion<Shape>()
  .implSeal((payload, seal) => (payload.id ? seal(payload) : new Error("id must not be empty")))
  .implVariant("Circle", (companion) =>
    companion.implSeal((payload, seal) =>
      payload.r > 0 ? seal(payload) : new Error("r must be positive"),
    ),
  )
  .impl();

Shape.Circle.create({ id: "s1", r: 2 }); // VariantOf<Shape, "Circle"> | Error
Shape.Square.create({ id: "s2", side: 1 }); // VariantOf<Shape, "Square"> | Error
```

The enum's seal checks what every variant holds; a variant's own seal checks its own payload. A
payload runs the variant's seal, then the enum's, then the default seal that brands and copies it,
so a variant with no seal of its own is still checked by the enum's. Compose them yourself where a
check depends on the other's result. Inside a variant's seal, `seal(payload)` is the enum's seal, so
its result is the enum's return, the error included.

Write `.implSeal` before the first `.implVariant`, which the type enforces. A variant's default seal
is the enum's, read from the chain as it stands.

Whatever a seal returns propagates, as it does for a Val. The union in it narrows to the variant the
payload named. `patch` derives through the same seal, so no derivation skips it.

`Shape.seal` passes a tagged payload through the same seals. Its return is the variants' returns, as
a union.

## Custom tag key

The tag is real data, not a phantom. It crosses the wire, so you can customize the name when an API
already has one:

```ts
import { Enum, Tag } from "valof/experimental";
// ---cut---
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
const Event = Enum.sealer<Event>("kind");

Event.Click({ x: 1 }); // { x: 1, kind: "Click" }
Event[Tag].key; // "kind"
```

`Tag` goes in the third argument, beside the shared fields, because the tag is a field every variant
holds. It is a marker with no key of its own, so every name is still free for a variant. The
companion takes the name again because the proxy writes it at run time, and the type argument is not
readable from a value. Forget it, misspell it, or pass one where the default applies, and the type
says so.

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
