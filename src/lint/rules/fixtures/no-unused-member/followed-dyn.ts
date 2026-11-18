import { Trait, Val, type Self } from "valof";
type Rule = Trait<"Rule", { kind: string }, { run: (self: Self) => string; explain: (self: Self) => string }>;
const Rule = Trait.companion<Rule>().build();

type A = Val<"A", Record<never, never>, Rule>;
const A = Val.companion<A>()
  .implTrait(Rule, () => ({ run: (a) => a.kind, explain: (a) => a.kind }))
  .build();

A.dyn<Rule>(a).run();
const boxed = A.dyn<Rule>(a);
boxed.run();
const { run } = A.dyn<Rule>(a);

const unrelated = { explain: 1 };
unrelated.explain;

declare const a: A;
