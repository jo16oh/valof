import { Val } from "valof";

type Money = Val<"Money", { cents: number }>;
const Money = Val.companion<Money>()
  .implAssoc(({ seal }) => ({
    fromCents: (n: number) => seal({ cents: n }),
    total: (all: readonly Money[]) => all.length,
    euros: (n: number): number => Money.fromCents(n).cents,
    zero: seal({ cents: 0 }),
    rate: 100,
    format: (n: number) => `${n / 100}`,
  }))
  .build();

export const read = [Money.fromCents, Money.total, Money.euros, Money.zero, Money.rate, Money.format];
