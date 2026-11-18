import { Val } from "../../lib/index.ts";
import type { ReadonlyWritten, Scan } from "../scan/index.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/** What to write in place of each spelling. */
const FIXES: Readonly<Record<ReadonlyWritten["spelling"], string>> = {
  readonly: "drop `readonly`",
  Readonly: "write the type `Readonly<…>` wraps",
  ReadonlyArray: "write `T[]` for `ReadonlyArray<T>`",
};

/**
 * A `readonly`, `Readonly<…>` or `ReadonlyArray<…>` written in a Val's payload. The Val makes the
 * payload readonly anyway, and `Val.unwrap` returns it as written, so the copy it hands out stays
 * readonly.
 */
export type ReadonlyPayload = Val<"ReadonlyPayload", Record<never, never>, Rule>;
export const ReadonlyPayload = Val.companion<ReadonlyPayload>()
  .implCreate(() => ({
    kind: Kind.seal("no-readonly-payload"),
    description:
      "`readonly`, `Readonly<…>` or `ReadonlyArray<…>` in a Val's or a variant's payload",
    warns: true,
    optIn: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/** Reports each one at its first token. */
function findings({ kind }: ReadonlyPayload, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, readonlyWritten }) =>
    readonlyWritten.map(({ at, spelling }) =>
      Finding.seal({
        kind,
        file,
        at,
        message: `a Val's payload is already readonly; ${FIXES[spelling]}, since \`Val.unwrap\` returns the payload as written`,
      }),
    ),
  );
}
