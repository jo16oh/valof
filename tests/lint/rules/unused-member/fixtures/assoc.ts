import { Val } from "valof";

type Money = Val<"Money", { cents: number }>;
const Money = Val.companion<Money>()
  .implAssoc(({ seal }) => ({
    fromCents: (n: number): Money => seal({ cents: n }),
    zero: seal({ cents: 0 }),
  }))
  .implAssoc(() => ({ unit: "cent" }))
  .build();

export const one = Money.fromCents(1);
