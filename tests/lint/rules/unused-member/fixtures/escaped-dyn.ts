type Rule = Trait<
  "Rule",
  { kind: string },
  { run: (self: unknown) => string; explain: (self: unknown) => string }
>;
const Rule = Trait.companion<Rule>().build();

type Dead = Val<"Dead", { kind: "dead" }, Rule>;
const Dead = Val.companion<Dead>()
  .implTrait(Rule, () => ({ run: () => "dead", explain: () => "dead" }))
  .build();

type Unused = Val<"Unused", { kind: "unused" }, Rule>;
const Unused = Val.companion<Unused>()
  .implTrait(Rule, () => ({ run: () => "unused", explain: () => "unused" }))
  .build();

const box = (companion: never, value: never) => Rule.dyn(companion, value);
const RULES = [box(Dead, Dead.seal({ kind: "dead" })), Rule.dyn(Unused, Unused.seal({ kind: "unused" }))];
for (const rule of RULES) rule.run();
