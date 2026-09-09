import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;
type Order = Val<"Order", { id: string }>;

export type Either = User | Order;
export type Ro = Readonly<User>;
export type Wrap<T> = T;
export type Plain = string;

const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
});
const Order = Val.sealer<Order>().impl({
  id: (o) => o.id,
});

export const greet = (u: User): string => User.greet(u);
export const id = (o: Order): string => Order.id(o);
