import { Enum, Trait, Val, type Self } from "valof";

type Named = Trait<"Named", { name: string }, { label: (self: Self) => string }>;
const Named = Trait.companion<Named>()
  .impl(() => {
    const at = "@";
    return { label: (n) => at + n.name };
  })
  .build();

type User = Val<"User", { name: string }, Named>;
const User = Val.companion<User>()
  .implSeal((user, seal) => {
    const name = user.name.trim();
    return seal({ name });
  })
  .implTrait(Named, function () {
    function shout(text: string): string {
      return text.toUpperCase();
    }
    return { label: (u) => shout(u.name) };
  })
  .impl(() => ({ greet: (u) => u.name }))
  .implAssoc(() => {
    let guests = 0;
    return { guestName: () => `guest${++guests}` };
  })
  .build();

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const members = () => ({ area: (s: Shape) => 0 });
const Shape = Enum.companion<Shape>()
  .Circle.impl(() => {
    class Cache {}
    return { diameter: (c) => (new Cache(), c.r * 2) };
  })
  .Square.impl(() => {
    return { perimeter: (s) => s.side * 4 };
  })
  .impl(members)
  .build();

type Id = Val<"Id", string>;
const built = Val.companion<Id>();
const Id = built.impl(function () {
  const length = 4;
  return { short: (i) => i.slice(0, length) };
}).build();

const other = { impl: (f: () => unknown) => f() };
other.impl(() => {
  const state = 1;
  return state;
});

export const read = [
  Id.short,
  User.greet,
  User.guestName,
  User.label,
  Shape.area,
  Shape.Circle.diameter,
  Shape.Square.perimeter,
];
