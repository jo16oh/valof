# Enums

<!-- prettier-ignore -->
> [!WARNING]
> Enums are experimental. They ship from `valof/experimental` so that an import says so, and the
> design is still changing.

An enum is a closed set of variants. A Val is one shape; an enum is a choice between several, and
because the set is closed, handling every case can be checked.

## Declare the variants in one record

```ts
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>();
const { Circle, Square } = Shape;

const circle = Circle({ r: 2 }); // { r: 2, _tag: "Circle" }
```

The record is the whole declaration. The union is derived from it, and so is each variant's brand:
`Circle` is branded `"Shape.Circle"`. Adding a variant is one line, in one place.

The constructor writes the tag. It does not take one, and it deep-copies its payload like any other
constructor.

## Match on the tag

```ts
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>();
declare const shape: Shape;
// ---cut---
const area = Shape.match(shape, {
  Circle: (c) => Math.PI * c.r * c.r,
  Square: (s) => s.side * s.side,
});
```

Each handler takes its own variant, narrowed, with no annotation. Every variant needs a handler, so
adding one to the declaration fails here rather than falling through at run time. The return type is
the handlers' union.

`match` sits on the companion because the tag's name is yours to choose, and a free function would
have to hard-code it.

Use `match` to split on the tag. For a condition inside a variant, reach for a pattern matching
library such as ts-pattern: `_tag` is real data, so `.with({ _tag: "Circle" }, …)` already works.

## Fields every variant holds

The third argument says what every variant holds:

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }, { id: string }>;
const Shape = Enum.companion<Shape>();

const circle = Shape.Circle({ id: "s1", r: 2 });

declare const shape: Shape;
shape.id; // readable off the union
```

Every constructor requires them, and the union reads them without a `match`.

The same argument declares the [traits](traits.md) the enum implements.

## Members

`.impl` collects the members that take the union, and `.implVariant` the ones that take a single
variant. Both take a callback, and what they hand it is the companion as it stands:

```ts
import { Enum } from "valof/experimental";
// ---cut---
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Shape = Enum.companion<Shape>()
  .implVariant(() => ({
    Circle: { diameter: (c) => c.r * 2 },
  }))
  .impl((self) => ({
    area: (s) =>
      self.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
      }),
  }));

Shape.Circle.diameter(Shape.Circle({ r: 2 })); // 4
```

A variant you write nothing for is left out of `implVariant`.

The callback is not decoration. A member over an enum reaches for `match` first, and naming `Shape`
inside its own initializer is a circularity TypeScript reports as TS7022. The callback breaks it.
Members from the same call are still circular, so one calling another needs a return annotation.

## A variant is a Val

It patches, it compares, and it nests:

```ts
import { equals, Val } from "valof";
import { Enum } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>();
// ---cut---
const circle = Shape.Circle({ r: 2 });

Shape.Circle.patch(circle, { r: 5 }); // { r: 5, _tag: "Circle" }
equals(circle, Shape.Circle({ r: 2 })); // true

type Holder = Val<"Holder", { id: string; shape: Shape }>;
const Holder = Val.sealer<Holder>();
const holder = Holder({ id: "h", shape: circle });

Holder.patch(holder, { shape: Shape.Square({ side: 1 }) });
```

A patch cannot reach the tag, so it cannot switch variants. A nested variant is a patch boundary
like any nested Val: replace it with one the constructor built, rather than merging into it.

## Name the tag field

The tag is real data and it crosses the wire, so the name is yours when an API already has one:

```ts
import { Enum, type Tag } from "valof/experimental";
// ---cut---
type Event = Enum<"Event", Tag<"kind"> & { Click: { x: number }; Key: { code: string } }>;
const Event = Enum.companion<Event>("kind");

Event.Click({ x: 1 }); // { x: 1, kind: "Click" }
```

`Tag` is a marker with no key of its own, so every name is still free for a variant. The companion
takes the name again because the proxy writes it at run time, and the type argument is not readable
from a value. Forget it, misspell it, or pass one where the default holds, and the type says so.

## Name one variant

`VariantOf` is the type of a single variant, and it is what errors and hovers print:

```ts
import { Enum, type VariantOf } from "valof/experimental";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
// ---cut---
type Circle = VariantOf<Shape, "Circle">;
```

Write the alias for the variants you talk about; the rest read as `VariantOf<Shape, "Circle">`
wherever they appear.

## Limits

- **Two variants at least.** One variant is a Val, and TypeScript loses the alias for a union of
  one, which breaks the declarations of a package that exports the companion.
- **A variant may not be called `then`.** A companion holding `then` is a thenable, and `await` on
  one never settles. The same name is rejected for a member of any companion.
