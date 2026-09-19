import { Val } from "valof";
import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>().impl();

export type User = Val<"User", { id: string }>;
export const User = Val.sealer<User>().impl({ helper: (u) => u.id });
