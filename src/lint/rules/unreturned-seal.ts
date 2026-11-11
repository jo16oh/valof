import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/**
 * A custom seal that holds the default seal's result outside its `return`, in a chain whose create
 * is `.implCreate.noseal`. Development checks that the seal called the default one and kept the
 * value, and a seal that does so and then returns a failure passes. Production skips the seal for
 * created values, so a value the seal would reject is created.
 *
 * Any call held in a variable is reported, since following the value to the `return` needs
 * data-flow analysis. `return ok(seal(x))` is the form to write. A seal defined elsewhere and
 * passed in is not reported, and neither is any chain with an ordinary create, where discarding the
 * result is legitimate.
 */
export type UnreturnedSeal = Val<"UnreturnedSeal", { kind: Kind }, Rule>;
export const UnreturnedSeal = Val.companion<UnreturnedSeal>()
  .implCreate(() => ({
    kind: Kind.seal("unreturned-seal"),
    description:
      "a seal that keeps the default seal's result outside its return, in a chain with `.implCreate.noseal`",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: UnreturnedSeal, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, heldSeals }) =>
    heldSeals
      .filter(({ noseal }) => noseal)
      .map(({ companion, at }) =>
        Finding.seal({
          kind,
          file,
          at,
          message: `${companion}'s seal keeps the default seal's result outside its return, so a value it rejects can still be created; return seal(…) itself`,
        }),
      ),
  );
}
