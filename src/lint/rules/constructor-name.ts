import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * The names a constructor may have. A word boundary follows, so `createdAt` and `fromage` do not
 * count.
 */
const CONSTRUCTOR = /^(?:from|parse|create)(?:$|[A-Z0-9_])/;

/**
 * A constructor in `.implAssoc` named otherwise, and a member of `.impl` named as one.
 *
 * A constructor is a function member that calls `seal` or `create`, the step's or the companion's.
 * One delegating to a sibling constructor is not one. A member of `.impl` takes the value first, so
 * one named like a constructor is a constructor in the wrong step. With a primitive payload,
 * `fromYears(n: number)` is accepted as a member taking the value.
 */
export type ConstructorName = Val<"ConstructorName", { kind: "constructor-name" }, Rule>;
export const ConstructorName = Val.companion<ConstructorName>()
  .implCreate(() => ({
    kind: "constructor-name",
    description:
      "a constructor in `.implAssoc` not named `from*`, `parse*` or `create*`, or a member of `.impl` named like one",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: ConstructorName, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, stepMembers }) =>
    stepMembers.flatMap(
      ({ companion, type, member, step, function: isFunction, constructs, at }) => {
        const named = CONSTRUCTOR.test(member);
        const message =
          step === "implAssoc" && isFunction && constructs && !named
            ? `${companion}.${member} makes a ${type}; name it from*, parse* or create*`
            : step === "impl" && named
              ? `${companion}.${member} is named like a constructor, and takes a ${type}; move it to .implAssoc, or rename it`
              : undefined;
        return message ? [Finding.seal({ kind, file, at, message })] : [];
      },
    ),
  );
}
