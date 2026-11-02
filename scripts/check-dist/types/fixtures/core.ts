// Core API under `vp run type-perf`. Deep payloads, tuples, records and every builder step,
// because those are where the recursive conditionals run.
import { equals, Val, type Patch, type SeedOf, type Unpatchable } from "valof";

type City = Val<"City", { name: string; zip?: string }>;
const City = Val.companion<City>().build();

type Money = Val<"Money", { amount: number; currency: string }>;
const Money = Val.companion<Money>().build();

type Line = Val<"Line", { sku: string; qty: number; unit: Money; tags: readonly string[] }>;
const Line = Val.companion<Line>().build();

type Address = Val<
  "Address",
  {
    city: City;
    street: { name: string; number: number; unit?: { floor: number; door: string } };
    at: readonly [number, number];
  }
>;
const Address = Val.companion<Address>().build();

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

const Order = Val.companion<Order, [Unpatchable<"id">]>()
  .implSeal((seed, seal) => seal(seed))
  .implCreate((seed: Omit<SeedOf<Order>, "id">) => ({ ...seed, id: "generated" }))
  .implAssoc(({ seal, create }) => ({
    fromShip: (id: string, ship: Address) => seal({ id, ship, lines: [], totals: {} }),
    blank: (ship: Address) => create({ ship, lines: [], totals: {} }),
  }))
  .impl(({ seal }) => ({
    label(o) {
      return `${o.id}: ${o.lines.length}`;
    },
    heaviest(o) {
      return o.lines.reduce((a, b) => (a.qty > b.qty ? a : b));
    },
    noted: (o, note: string) => seal({ ...o, note }),
  }))
  .build();

declare const order: Order;
declare const patch: Patch<SeedOf<Order>>;

export const derived = [
  // The patch stops at a nested Val, so the deep one runs inside `Address`.
  Order.patch(order, { ship: Address.patch(order.ship, { street: { name: "Shijo" } }) }),
  Address.patch(order.ship, { street: { unit: { floor: 2, door: "b" } } }),
  Order.patch(order, { totals: { vat: Money.seal({ amount: 1, currency: "JPY" }) } }),
  Order.patch(order, { note: undefined }),
  Order.patch(order, patch),
  Order.fromShip("o", order.ship),
  Order.fromShip(order.ship)("o"),
  Order.blank(order.ship),
  Order.create({
    ship: Address.seal({
      city: City.seal({ name: "Kyoto" }),
      street: { name: "Karasuma", number: 1 },
      at: [35, 135],
    }),
    lines: [
      Line.seal({
        sku: "a",
        qty: 1,
        unit: Money.seal({ amount: 1, currency: "JPY" }),
        tags: ["x"],
      }),
    ],
    totals: {},
  }),
  Val.of<Order>(order),
  Val.unwrap<Order>(order),
];

export const equal = [equals(order, order), equals(order.totals["vat"]!, order.totals["vat"]!)];
