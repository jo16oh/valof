import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RULES, lint as run, type Resolver } from "../../src/lint/index.ts";

// Named rather than spelled as a kind: a test that names a rule reads the same object the
// registry does, so renaming a kind is one edit and no test string follows it.
export {
  AliasedVal,
  BrandMismatch,
  BypassedCompanion,
  CompanionMismatch,
  DuplicateBrand,
  IncompleteDisable,
  SplitCompanion,
  StructuralEquals,
  UnnamedOf,
  UnusedDisable,
  UnusedMember,
} from "../../src/lint/rules/index.ts";

/** One of the rules in the registry. */
type Registered = (typeof RULES)[number];

/**
 * A finding as a test names it: which rule reported it, where, and what it said.
 *
 * The rule is the object, not its kind. The location keeps the fixture-relative path so an
 * expectation still says which file it came from.
 */
export type Reported = { rule: Registered; at: string; message: string };

const reporting = (kind: string): Registered => {
  const rule = RULES.find((one) => one.kind === kind);
  if (!rule) throw new Error(`no rule reports ${kind}`);
  return rule;
};

/** The package root, which is where the command runs and where TypeScript is looked up. */
export const root = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The fixture tree beside one test file, addressed by the entry names under `fixtures/`.
 *
 * A fixture is one file, `dead-member`, or a directory of them, `plain`. Findings come back with
 * paths relative to `fixtures/`, so every expectation names the fixture it came from.
 *
 * In process, so a run costs no `node` start. The command itself is covered by {@link cli}: what
 * it adds over `lint` is argument parsing and the shape of a line.
 */
export function fixtures(url: string): {
  all: () => string[];
  files: (fixture: string) => string[];
  lint: (
    fixture: string,
    options?: {
      skip?: readonly Registered[];
      types?: Resolver | undefined;
      overlay?: Map<string, string>;
    },
  ) => Promise<Reported[]>;
} {
  const directory = fileURLToPath(new URL("fixtures/", url));
  const files = (fixture: string): string[] =>
    globSync([`${directory}${fixture}.ts`, `${directory}${fixture}/**/*.ts`]);

  return {
    all: () => globSync(`${directory}**/*.ts`),
    files,
    lint: async (fixture, { skip = [], types, overlay } = {}) => {
      const findings = await run(files(fixture), {
        ...(types ? { types } : {}),
        ...(overlay ? { overlay } : {}),
        skip: new Set(skip.map(({ kind }) => kind)),
      });
      return findings.map(({ file, line, column, kind, message }) => ({
        rule: reporting(kind),
        at: `${file.replace(directory, "")}:${line}:${column}`,
        message,
      }));
    },
  };
}

/** A resolver that answers nothing, and counts what it was asked. */
export function spy(): Resolver & { asked: () => number } {
  let asked = 0;
  return {
    resolveAll: (queries) => {
      asked += queries.length;
      return Promise.resolve(queries.map(() => []));
    },
    overlay: () => {},
    close: () => {},
    asked: () => asked,
  };
}

type Run = { status: number; stdout: string; stderr: string };

function spawn(node: string[], args: string[]): Run {
  const result = spawnSync(process.execPath, [...node, "src/lint/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr.trim() };
}

/** The command, for what only the command does. */
export const cli = (...args: string[]): Run => spawn([], args);

/** The same, with the parser out of reach, as it is before anyone installs it. */
export const cliWithoutParser = (...args: string[]): Run =>
  spawn(["--import", fileURLToPath(new URL("no-oxc-parser.ts", import.meta.url))], args);

/** The same, with no TypeScript in the project being linted. */
export const cliWithoutTypeScript = (...args: string[]): Run =>
  spawn(["--import", fileURLToPath(new URL("no-typescript.ts", import.meta.url))], args);
