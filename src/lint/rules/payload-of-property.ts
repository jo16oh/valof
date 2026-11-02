import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * `PayloadOf<X>` inside a payload: `total: PayloadOf<Money>` is accepted and holds `Money`'s
 * payload without its brand, so nothing stops a value `Money.seal` would reject. As the payload, or
 * as the base intersected at its top, it is what `PayloadOf` is for.
 */
export type PayloadOfProperty = Val<"PayloadOfProperty", { kind: "payload-of-property" }, Rule>;
export const PayloadOfProperty = Val.companion<PayloadOfProperty>()
  .implCreate(() => ({
    kind: "payload-of-property",
    description: "a `PayloadOf<X>` inside a payload, which drops the brand and the seal of `X`",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: PayloadOfProperty, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, nestedPayloadOfs }) =>
    nestedPayloadOfs.map(({ alias, wrapped, line, column }) =>
      Finding.seal({
        kind,
        file,
        line,
        column,
        message: `${alias} holds PayloadOf<${wrapped}>, which drops ${wrapped}'s brand and its seal; hold ${wrapped}`,
      }),
    ),
  );
}
