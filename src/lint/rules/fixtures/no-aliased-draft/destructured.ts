import { Val } from "valof";

type Order = Val<"Order", { id: string; total: number; note: { text: string } }>;
const Order = Val.companion<Order>().build();

declare const order: Order;

Order.patch(order, ({ ...rest }) => {
  rest.total = 1;
});
Order.patch(order, ({ id, ...rest }) => {
  rest.total = id.length;
});
Order.patch(({ ...rest }) => {
  rest.total = 2;
})(order);
// A plain object field taken by name is a draft itself, so its writes land.
Order.patch(order, ({ note }) => {
  note.text = "x";
});
// Only a `patch` recipe takes a draft.
[order].map(({ ...rest }) => rest);
