import { Val } from "valof";
import { Money } from "./money.ts";

export type Charges = Val<"Charges", Money[]>;

// One entry stands for every element, which is the `[]` the payload walk spells.
export const Charges = Val.sealer<Charges>().implEquals([Money]);
