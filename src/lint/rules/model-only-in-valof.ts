import { Val } from "../../index.ts";
import type { ModelSettings } from "../index.ts";
import type { Scan, Shape } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A named data type outside Valof: an object type, an array, a tuple, a primitive, a utility type
 * or an interface, declared with `type` or `interface`. `Payload<…>` names a type for a payload,
 * which may then appear in a Valof type and in the function passed to `implSeal` or `implCreate`.
 *
 * Off unless enabled, because it enforces a way of modelling and reports nothing broken.
 */
export type ModelOnlyInValof = Val<
  "ModelOnlyInValof",
  {
    kind: "model-only-in-valof";
    optIn: true;
    classes: boolean;
    constraints: boolean;
    extraction: boolean;
  },
  Rule
>;
export const ModelOnlyInValof = Val.companion<ModelOnlyInValof>()
  .implCreate(({ classes = false, constraints = false, extraction = false }: ModelSettings) => ({
    kind: "model-only-in-valof",
    description: "a data type declared outside Valof, off by default",
    warns: false,
    optIn: true,
    classes,
    constraints,
    extraction,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/** What each shape says, and the setting that has to ask for it. */
const SAID: Record<
  Shape,
  { setting?: "classes" | "constraints" | "extraction"; say: (name: string) => string }
> = {
  data: {
    say: (name) =>
      `${name} declares a data type outside Valof; model it as a Val, an Enum or a Trait`,
  },
  interface: {
    say: (name) =>
      `${name} declares a data type outside Valof; model it as a Val, an Enum or a Trait`,
  },
  primitive: {
    say: (name) =>
      `${name} names a primitive type outside Valof; make it a Val, or Payload<…> for a payload`,
  },
  "nested-object": {
    say: (name) => `${name} nests an object that is not a Val; nest a Val instead`,
  },
  class: {
    setting: "classes",
    say: () => "a class declares data outside Valof; model it as a Val",
  },
  constraint: {
    setting: "constraints",
    say: () => "this constraint declares a data shape; write a Trait or an Enum",
  },
  extraction: {
    setting: "extraction",
    say: (name) => `${name} takes its type out of a value; declare a Val instead`,
  },
};

function findings(rule: ModelOnlyInValof, scans: readonly Scan[]): Finding[] {
  const { kind } = rule;
  const vals = new Set(
    scans.flatMap(({ aliases, enumAliases }) =>
      [...aliases, ...enumAliases].map(({ alias }) => alias),
    ),
  );
  const payloads = new Set(scans.flatMap(({ models }) => models.payloadAliases));
  const at = (
    file: string,
    { line, column }: { line: number; column: number },
    message: string,
  ): Finding => Finding.seal({ kind, file, line, column, message });
  return scans.flatMap(({ file, models }) => [
    ...models.models
      .filter(({ shape }) => {
        const { setting } = SAID[shape];
        return setting === undefined || rule[setting];
      })
      .map((one) => at(file, one, SAID[one.shape].say(one.name))),
    ...models.payloadWraps
      .filter(({ name }) => vals.has(name))
      .map((one) =>
        at(
          file,
          one,
          `${one.alias} wraps the Val ${one.name} in Payload; write PayloadOf<${one.name}>`,
        ),
      ),
    ...models.outside
      .filter(({ name }) => payloads.has(name))
      .map((one) =>
        at(
          file,
          one,
          `${one.name} is a payload type; use it in a Valof type, or in the function passed to implSeal or implCreate`,
        ),
      ),
  ]);
}
