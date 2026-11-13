// Oxlint's rule type, which it does not export: what `RuleTester.run` takes.
import type { RuleTester } from "oxlint/plugins-dev";

export type Rule = Extract<Parameters<RuleTester["run"]>[1], { create: unknown }>;

export type Context = Parameters<Rule["create"]>[0];

export type Body = Parameters<Context["sourceCode"]["getText"]>[0];
