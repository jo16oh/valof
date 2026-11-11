import { Enum } from "valof";

// @ts-expect-error -- the split itself is what TypeScript rejects
import type { Shape } from "./type.ts";

// @ts-expect-error -- the split itself is what TypeScript rejects
export const Shape = Enum.companion<Shape>().build();
