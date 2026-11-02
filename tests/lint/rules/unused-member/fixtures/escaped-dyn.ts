import { Trait, Val, type Self } from "valof";
type Rule = Trait<
  "Rule",
  { kind: string },
  { run: (self: Self) => string; explain: (self: Self) => string }
>;
const Rule = Trait.companion<Rule>().build();

type Dead = Val<"Dead", { kind: "dead" }, Rule>;
const Dead = Val.companion<Dead>()
  .implTrait(Rule, () => ({ run: (d) => d.kind, explain: (d) => d.kind }))
  .build();

type Unused = Val<"Unused", { kind: "unused" }, Rule>;
const Unused = Val.companion<Unused>()
  .implTrait(Rule, () => ({ run: (u) => u.kind, explain: (u) => u.kind }))
  .build();

const box = <W extends Rule>(companion: Parameters<typeof Rule.dyn<W>>[0], value: W) =>
  Rule.dyn(companion, value);
const RULES = [box(Dead, Dead.seal({ kind: "dead" })), Rule.dyn(Unused, Unused.seal({ kind: "unused" }))];
for (const rule of RULES) rule.run();
