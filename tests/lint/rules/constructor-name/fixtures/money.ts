import { Val } from "valof";

type Money = Val<"Money", { cents: number }>;
const Money = Val.companion<Money>()
  .implCreate(() => ({ cents: 0 }))
  .implAssoc(({ seal, create: make }) => ({
    fromCents: (n: number): Money => seal({ cents: n }),
    read: (text: string): Money => seal({ cents: Number(text) }),
    random: (): Money => make(),
    cents: (n: number): Money => Money.fromCents(n),
    sum: (all: readonly Money[]): Money => Money.seal({ cents: all.length }),
    zero: seal({ cents: 0 }),
  }))
  .impl(() => ({
    fromage: (m) => m.cents,
    createdAt: (m) => m.cents,
    fromYears: (m) => m.cents,
  }))
  .build();

export const read = [Money.fromCents, Money.read, Money.random, Money.cents, Money.sum, Money.zero];
export const more = [Money.fromage, Money.createdAt, Money.fromYears];
