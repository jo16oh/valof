import { Val } from "../../index.ts";
import { resolve } from "node:path";

import { symbolIdentity, type Scan } from "../scan/index.ts";
import type { Arity } from "../types.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A member whose type annotation declares a parameter the implementation gives a default or a
 * rest: `const toWire: ToWire = (u, sep = ",") => …` passed as `.impl(() => ({ toWire }))`. The
 * checker sees only the annotation, so it cannot reject the member. The value-last call counts the
 * parameters at run time, where a default and a rest do not count, and picks the wrong form.
 *
 * TypeScript counts the annotation's parameters, through an alias or an import. A default after
 * the parameters the annotation declares is not reported, because the type does not offer it.
 */
export type HiddenOptional = Val<"HiddenOptional", { kind: "hidden-optional" }, Rule>;
export const HiddenOptional = Val.companion<HiddenOptional>()
  .implCreate(() => ({
    kind: "hidden-optional",
    description: "a default or rest parameter that a member's type annotation hides",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans, _context, types) => findings(rule, scans, types) }))
  .build();

function findings({ kind }: HiddenOptional, scans: readonly Scan[], types: () => Arity): Finding[] {
  const identity = symbolIdentity(scans);
  const used = new Set(scans.flatMap(({ memberSources }) => memberSources.map(identity)));
  const candidates = scans.flatMap(({ file, hiddenParameters }) =>
    hiddenParameters.filter(({ ref }) => used.has(identity(ref))).map((one) => ({ file, one })),
  );
  if (candidates.length === 0) return [];
  const arity = types();
  return candidates.flatMap(({ file, one: { name, offset, property, parameter, rest, at } }) => {
    const declared = arity(resolve(file), offset, property ?? undefined);
    if (declared === undefined || declared <= parameter) return [];
    const what = rest ? "rest parameter" : "default";
    return [
      Finding.seal({
        kind,
        file,
        at,
        message: `the annotation on ${property === null ? name : `${name}.${property}`} declares the parameter this ${what} makes optional, so a call with the value last finds the wrong arity; drop the ${what}, or write the member inline`,
      }),
    ];
  });
}
