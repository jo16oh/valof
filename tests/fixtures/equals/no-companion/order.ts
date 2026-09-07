import type { Val } from "valof";
import type { Money } from "./money.ts";

// No companion anywhere, so nothing can call `Order.equals`.
export type Order = Val<"Order", { id: string; total: Money }>;
