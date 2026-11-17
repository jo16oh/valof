import { Val } from "valof";
const Prices = Val.Map.companion<Prices>().impl(() => ({
  total: (p) => Object.values(p).length,
  unused: (p) => Object.keys(p).length,
})).build();

Prices.total(prices);

type Prices = Val.Map<"Prices", string, number>;
declare const prices: Prices;
