import { Val } from "valof";
const Prices = Val.Record.companion<Prices>().impl(() => ({
  total: (p) => Object.values(p).length,
  unused: (p) => Object.keys(p).length,
})).build();

Prices.total(prices);

type Prices = Val.Record<"Prices", string, number>;
declare const prices: Prices;
