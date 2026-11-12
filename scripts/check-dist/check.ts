import type { Result as R } from "@praha/byethrow";
import { Trait, type Dyn, type Self } from "#valof";

import type { CompatError } from "./checks/compat/index.ts";
import type { SizeError } from "./checks/size/index.ts";
import type { TypesError } from "./checks/types/index.ts";
import type { Report } from "./report.ts";

/** What any check fails with. */
export type CheckError = SizeError | TypesError | CompatError;

/**
 * One check of the built `dist`, reported under its name. `run` fails where it cannot report, as
 * on a build that breaks.
 */
export type Check = Trait<
  "Check",
  { name: string },
  { run: (self: Self) => R.ResultAsync<Dyn<Report>, CheckError> }
>;
export const Check = Trait.companion<Check>().build();
