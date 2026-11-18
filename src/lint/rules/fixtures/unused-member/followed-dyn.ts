import { Trait, Val, type Self } from "valof";
type Rule = Trait<"Rule", { kind: string }, { run: (self: Self) => string; explain: (self: Self) => string }>;
const Rule = Trait.companion<Rule>().build();

type A = Val<"A", { kind: "a" }, Rule>;
const A = Val.companion<A>()
  .implTrait(Rule, () => ({ run: (a) => a.kind, explain: (a) => a.kind }))
  .build();

Rule.dyn(A, a).run();
const boxed = Rule.dyn(A, a);
boxed.run();
const { run } = Rule.dyn(A, a);

const unrelated = { explain: 1 };
unrelated.explain;

declare const a: A;
