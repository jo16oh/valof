import { Val } from "valof";

type Order = Val<"Order", { id: string; total: number; note: { text: string } }>;
const Order = Val.companion<Order>().build();

declare const order: Order;
declare function eligible(total: number): boolean;

Order.patch(order, (d) => {
  d.total = d.total + 1;
  d["id"] = "x";
  const note = d.note;
  note.text = "t";
  if (eligible(d.total)) d.id = "y";
  const copy = { ...d };
  copy.id = "z";
  [1].forEach((d) => audit(d));
  const shape = { d: 1 };
  shape.d = 2;
});

declare function audit(n: number): void;
