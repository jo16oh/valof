// Core API under `vp run type-perf`. Deep payloads, tuples, records and every builder step,
// because those are where the recursive conditionals run.
import { Val, type Patch, type PayloadOf, type SeedOf } from "valof";

type City = Val<"City", { name: string; zip?: string }>;
const City = Val.sealer<City>();

type Money = Val<"Money", { amount: number; currency: string }>;
const Money = Val.sealer<Money>().implEquals((a, b) => a.amount === b.amount);

type Line = Val<"Line", { sku: string; qty: number; unit: Money; tags: readonly string[] }>;
const Line = Val.sealer<Line>();

type Address = Val<
  "Address",
  {
    city: City;
    street: { name: string; number: number; unit?: { floor: number; door: string } };
    at: readonly [number, number];
  }
>;
const Address = Val.sealer<Address>();

type Order = Val<
  "Order",
  {
    id: string;
    ship: Address;
    lines: readonly Line[];
    totals: Readonly<Record<string, Money>>;
    note?: string;
  }
>;

const Order = Val.companion<Order>()
  .implCreate((seed: Omit<SeedOf<Order>, "id">) => ({ ...seed, id: "generated" }))
  .implSeal((seed, seal) => seal(seed))
  .fixed<"id">()
  .impl({
    label(o) {
      return `${o.id}: ${o.lines.length}`;
    },
    heaviest(o) {
      return o.lines.reduce((a, b) => (a.qty > b.qty ? a : b));
    },
  });

declare const order: Order;
declare const patch: Patch<PayloadOf<Order>>;

export const derived = [
  // The patch stops at a nested Val, so the deep one runs inside `Address`.
  Order.patch(order, { ship: Address.patch(order.ship, { street: { name: "Shijo" } }) }),
  Address.patch(order.ship, { street: { unit: { floor: 2, door: "b" } } }),
  Order.patch(order, { totals: { vat: Money({ amount: 1, currency: "JPY" }) } }),
  Order.patch(order, { note: undefined }),
  Order.patch(order, patch),
  Order.update(order, (o) => ({ ship: o.ship, lines: o.lines, totals: o.totals, note: "x" })),
  Order.create({
    ship: Address({
      city: City({ name: "Kyoto" }),
      street: { name: "Karasuma", number: 1 },
      at: [35, 135],
    }),
    lines: [Line({ sku: "a", qty: 1, unit: Money({ amount: 1, currency: "JPY" }), tags: ["x"] })],
    totals: {},
  }),
  Val.of<Order>(Val.unwrap<Order>(order)),
];

export const equal = [
  Order.equals(order, order),
  Money.equals(order.totals["vat"]!, order.totals["vat"]!),
];
