import { Val } from "valof";
import type { OrderLine } from "./line.ts";

export type Order = Val<"Order", { id: string; lines: readonly OrderLine[] }>;

export const Order = Val.sealer<Order>();
