// No `.implEquals` anywhere, so nothing can dispatch and the rule needs no TypeScript.
const Money = Val.sealer<Money>().impl({
  cents: (m) => m.amount * 100,
});

Money.cents(money);
