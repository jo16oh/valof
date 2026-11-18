import { Val } from "valof";

type Order = Val<"Order", { id: string; total: number }>;
const Order = Val.companion<Order>().build();

declare const order: Order;

Order.patch(order, <T extends { total: number }>(d: T) => {
  d.total = 1;
});
Order.patch(order, function <T extends { total: number }>(d: T) {
  d.total = 2;
});
Order.patch(<T extends { total: number }>(d: T) => {
  d.total = 3;
})(order);
Order.patch(order, <T>() => {});
other.update(order, <T>(d: T) => d);

declare const other: { update: <T>(o: Order, f: (d: T) => T) => void };
