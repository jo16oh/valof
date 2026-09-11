import type { Trait as Tr } from "valof";
import type * as valof from "valof";

export type Named = Tr<"Name", { name: string }>;
export type Sized = valof.Trait<"Sized", { size: number }>;
