import type { Result as R } from "@praha/byethrow";
import { Trait, type Self } from "#valof";

import type { CompatError } from "./compat/index.ts";
import type { SizeError } from "./size/index.ts";
import type { TypesError } from "./types/index.ts";

/** What any check fails with. */
export type CheckError = SizeError | TypesError | CompatError;

/** What a check found, printed whole and then judged. */
export type Report = Trait<
  "Report",
  Record<never, never>,
  {
    render: (self: Self) => string;
    /** Fails where what the check found is over a budget, stale or incompatible. */
    verdict: (self: Self) => R.Result<void, CheckError>;
  }
>;
export const Report = Trait.companion<Report>().build();
