// @ts-expect-error -- the module is absent on purpose
import { other } from "./elsewhere.ts";

export type Id = other.Val<"Id", string>;
