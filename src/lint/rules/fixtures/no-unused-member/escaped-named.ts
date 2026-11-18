import { Trait, Val, type Self } from "valof";
type Rule = Trait<"Rule", { kind: string }, { run: (self: Self) => string; explain: (self: Self) => string }>;
const Rule = Trait.companion<Rule>().build();

type A = Val<"A", Record<never, never>, Rule>;
const A = Val.companion<A>()
  .implTrait(Rule, () => ({ run: (a) => a.kind, explain: (a) => a.kind }))
  .build();

type B = Val<"B", Record<never, never>, Rule>;
const B = Val.companion<B>()
  .implTrait(Rule, () => ({ run: (b) => b.kind, explain: (b) => b.kind }))
  .build();

const rules = [A.dyn<Rule>(a)];
for (const rule of rules) rule.run();

declare const a: A;
