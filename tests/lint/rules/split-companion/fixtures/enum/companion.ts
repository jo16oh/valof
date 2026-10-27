import { Enum } from "valof";

import type { Shape } from "./type.ts";

export const Shape = Enum.companion<Shape>().build();
