import { Trait, Val, type Dyn, type Self } from "valof";

type Rule = Trait<"Rule", { kind: string }, { run: (self: Self) => string }>;
const Rule = Trait.companion<Rule>().build();
type Named = Trait<"Named", { kind: string }, { label: (self: Self) => string }>;
const Named = Trait.companion<Named>().build();

type A = Val<"A", { kind: "a" }, Rule & Named>;
const A = Val.companion<A>()
  .implTrait(Rule, () => ({ run: (a) => a.kind }))
  .implTrait(Named, () => ({ label: (a) => a.kind }))
  .build();

type B = Val<"B", { kind: "b" }, Rule & Named>;
const B = Val.companion<B>()
  .implTrait(Rule, () => ({ run: (b) => b.kind }))
  .implTrait(Named, () => ({ label: (b) => b.kind }))
  .build();

A.dyn<Rule & Named>(a).label();
const kept = (box: Dyn<Rule & Named>) => box;
const boxes = [kept(B.dyn<Rule & Named>(b))];
for (const box of boxes) box.label();

declare const a: A;
declare const b: B;
