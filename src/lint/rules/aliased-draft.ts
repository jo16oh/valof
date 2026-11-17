import { Val } from "../../lib/index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/** A recipe's draft used as a value rather than to reach a field. */
export type AliasedDraft = Val<"AliasedDraft", { kind: Kind }, Rule>;
export const AliasedDraft = Val.companion<AliasedDraft>()
  .implCreate(() => ({
    kind: Kind.seal("aliased-draft"),
    description: "a recipe's draft passed, bound, or put in an array or an object",
    warns: false,
    optIn: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/**
 * Reports each use of a recipe's draft other than a field access or a spread. Under another name,
 * the draft's type no longer keeps a key readonly, so a write could reach a key `patch` excludes.
 */
function findings({ kind }: AliasedDraft, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, draftAliases }) =>
    draftAliases.map((at) =>
      Finding.seal({
        kind,
        file,
        at,
        message:
          "a recipe uses its draft only to reach a field; branch on the Val you patch, or pass the field itself (`d.total`)",
      }),
    ),
  );
}
