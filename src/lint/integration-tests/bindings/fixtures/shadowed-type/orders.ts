// @ts-expect-error -- the module is absent on purpose
import { Other as Val } from "./elsewhere.ts";

export type OtherId = Val<"Id", string>;
