import { Enum, Trait, type Self } from "valof";

export type Named = Trait<"Named", {}, { named: (self: Self) => string }>;
export const Named = Trait.companion<Named>().build();

export type Item = Enum<"Item", { Book: { pages: number } & Named; Pen: { ink: string } & Named }>;
export const Item = Enum.companion<Item>()
  .Book.implAssoc(() => ({ blank: () => 0 }))
  .Book.implTrait(Named, () => ({ named: (b) => `${b.pages} pages` }))
  .build();
