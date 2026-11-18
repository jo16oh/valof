import { Val } from "valof";

type Order = Val<"Order", { id: string; total: number; note: { text: string } }>;
const Order = Val.companion<Order>().build();

declare const order: Order;
declare function audit(o: object): void;

Order.patch(order, (d) => {
  const kept = d;
  kept.total = 1;
});
Order.patch(order, (d) => {
  Object.assign(d, { id: "x" });
});
Order.patch(order, (d) => {
  [1].forEach(() => audit(d));
});
Order.patch(order, function (d) {
  const both = [d, { d }];
  Reflect.set(both, "0", 1);
});
Order.patch((d) => {
  audit(d);
})(order);
