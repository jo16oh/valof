import { Val } from "../../lib/index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/** An import from `valof/internal/*`, which the package exports for declaration output alone. */
export type InternalImport = Val<"InternalImport", Record<never, never>, Rule>;
export const InternalImport = Val.companion<InternalImport>()
  .implCreate(() => ({
    kind: Kind.seal("no-internal-import"),
    description: "an import or a re-export from `valof/internal/*`",
    // The import works today, but no code a user writes needs `valof/internal/*`, and the import can
    // break in any release.
    warns: false,
    optIn: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports each import and re-export whose module is under `valof/internal/`. A user's emitted
 * declarations reference the types there, so the package exports the path. An editor offers the
 * path when it completes an import.
 */
function findings({ kind }: InternalImport, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, internalImports }) =>
    internalImports.map((at) =>
      Finding.seal({
        kind,
        file,
        at,
        message:
          "`valof/internal/*` is exported for declaration output, and can change in any release; import from `valof`",
      }),
    ),
  );
}
