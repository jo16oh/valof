import { Val } from "valof";
import type { OrderLine } from "./line.ts";

export type Order = Val<"Order", { id: string; lines: OrderLine[] }>;

export const Order = Val.sealer<Order>();
