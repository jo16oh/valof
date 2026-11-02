import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * An `.implAssoc` member that names neither the type, nor its companion, nor a `seal` or `create`:
 * a helper placed on the companion. Only the member's own syntax is read, so one defined elsewhere
 * and passed in is not reported.
 */
export type UnrelatedAssoc = Val<"UnrelatedAssoc", { kind: "unrelated-assoc" }, Rule>;
export const UnrelatedAssoc = Val.companion<UnrelatedAssoc>()
  .implCreate(() => ({
    kind: "unrelated-assoc",
    description: "an `.implAssoc` member that names neither its type nor a `seal` or `create`",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: UnrelatedAssoc, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, stepMembers }) =>
    stepMembers
      .filter(({ step, related }) => step === "implAssoc" && !related)
      .map(({ companion, type, member, line, column }) =>
        Finding.seal({
          kind,
          file,
          line,
          column,
          message: `${companion}.${member} names neither ${type} nor a seal or create; move it out of the companion`,
        }),
      ),
  );
}
