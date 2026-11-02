import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A custom seal that holds the default seal's result outside its `return`, in a chain whose create
 * is `.implCreate.noseal`. Development checks that the seal called the default one and kept the
 * value, and a seal that does so and then returns a failure passes. Production skips the seal for
 * created values, so a value the seal would reject gets made.
 *
 * Any call held in a variable is reported, since following the value to the `return` takes data
 * flow: `return ok(seal(x))` is the form to write. A seal defined elsewhere and passed in is left
 * alone, and so is any chain with an ordinary create, where discarding the result is legitimate.
 */
export type UnreturnedSeal = Val<"UnreturnedSeal", { kind: "unreturned-seal" }, Rule>;
export const UnreturnedSeal = Val.companion<UnreturnedSeal>()
  .implCreate(() => ({
    kind: "unreturned-seal",
    description: "a seal whose default result does not reach its return, beside a noseal create",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: UnreturnedSeal, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, heldSeals }) =>
    heldSeals
      .filter(({ noseal }) => noseal)
      .map(({ companion, line, column }) =>
        Finding.seal({
          kind,
          file,
          line,
          column,
          message: `${companion}'s seal holds the default seal's result outside its return, and production skips the check after it; return seal(…) itself`,
        }),
      ),
  );
}
