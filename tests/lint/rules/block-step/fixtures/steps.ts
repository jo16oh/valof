import { Enum, Trait, Val, type Self } from "valof";

type Named = Trait<"Named", { name: string }, { label: (self: Self) => string }>;
const Named = Trait.companion<Named>()
  .impl(() => {
    return { label: (n) => n.name };
  })
  .build();

type User = Val<"User", { name: string }, Named>;
const User = Val.companion<User>()
  .implSeal((user, seal) => {
    const name = user.name.trim();
    return seal({ name });
  })
  .implTrait(Named, function () {
    return {};
  })
  .impl(() => ({ greet: (u) => u.name }))
  .implAssoc(() => {
    const guest = "guest";
    return { guestName: () => guest };
  })
  .build();

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const members = () => ({ area: (s: Shape) => 0 });
const Shape = Enum.companion<Shape>()
  .Circle.impl(() => {
    return { diameter: (c) => c.r * 2 };
  })
  .impl(members)
  .build();

type Id = Val<"Id", string>;
const built = Val.companion<Id>();
const Id = built.impl(function () {
  return { short: (i) => i.slice(0, 4) };
}).build();

const other = { impl: (f: () => unknown) => f() };
other.impl(() => {
  return 1;
});

export const read = [Id.short, User.greet, User.guestName, User.label, Shape.area, Shape.Circle.diameter];
