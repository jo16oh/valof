import { Val } from "../../index.ts";

import { Exports, type Scan } from "../scan/index.ts";
import type { SymbolRef } from "../scan/bindings.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/**
 * A member whose type annotation hides a default or a rest parameter of its implementation:
 * `const toWire: ToWire = (u, sep = ",") => …` passed as `.impl(() => ({ toWire }))`. The checker
 * sees only the annotation, so it cannot reject the member. The value-last call counts the
 * parameters at run time, where a default and a rest do not count, and picks the wrong form.
 *
 * The rule reports every such parameter, whatever the annotation declares. The development check in
 * `build` rejects every one too.
 */
export type HiddenOptional = Val<"HiddenOptional", { kind: Kind }, Rule>;
export const HiddenOptional = Val.companion<HiddenOptional>()
  .implCreate(() => ({
    kind: Kind.seal("hidden-optional"),
    description: "a default or rest parameter that a member's type annotation hides",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: HiddenOptional, scans: readonly Scan[]): Finding[] {
  const exports = Exports.from(scans);
  const identity = (ref: SymbolRef): string => Exports.identify(exports, ref);
  const used = new Set(scans.flatMap(({ memberSources }) => memberSources.map(identity)));

  return scans.flatMap(({ file, hiddenParameters }) =>
    hiddenParameters
      .filter(({ ref }) => used.has(identity(ref)))
      .map(({ name, property, rest, at }) => {
        const what = rest ? "rest parameter" : "default";
        return Finding.seal({
          kind,
          file,
          at,
          message: `the annotation on ${property === null ? name : `${name}.${property}`} hides this ${what} from the types. A member cannot have a ${what}, because the argument count decides whether a call passes the value last; drop the ${what}, or write the member inline`,
        });
      }),
  );
}
