import { Trait, Val, type Self } from "valof";

type Rule = Trait<"Rule", { kind: string }, { run: (self: Self) => string; explain: (self: Self) => string }>;
const Rule = Trait.companion<Rule>().build();

type A = Val<"A", { kind: "a" }, Rule>;
const A = Val.companion<A>()
  .implTrait(Rule, () => ({ run: (a) => a.kind, explain: (a) => a.kind }))
  .build();

// @ts-expect-error -- the form valof 0.12 and earlier accept, which the scripts pinned to it write
Rule.dyn(A, a).run();

declare const a: A;
