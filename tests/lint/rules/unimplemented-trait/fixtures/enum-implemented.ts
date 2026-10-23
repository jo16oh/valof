import { Enum, Trait } from "valof/experimental";

export type Labelled = Trait<"Labelled", { id: string }>;
export const Labelled = Trait.companion<Labelled>().impl({ label: (l) => `#${l.id}` }).build();

export type Shape = Enum<
  "Shape",
  { Circle: { r: number }; Square: { side: number } },
  Labelled & { id: string }
>;
export const Shape = Enum.companion<Shape>().implTrait(Labelled).build();
