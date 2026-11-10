import type { Money } from "../passed.ts";

// Names the type, but in another file, which the rule does not read.
export const cents = (money: Money): number => money.cents;
