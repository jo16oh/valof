import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { lint as run, type Kind, type Resolver } from "../../src/lint/index.ts";

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
    options?: { skip?: Kind[]; types?: Resolver | undefined },
  ) => Promise<string[]>;
} {
  const directory = fileURLToPath(new URL("fixtures/", url));
  const files = (fixture: string): string[] =>
    globSync([`${directory}${fixture}.ts`, `${directory}${fixture}/**/*.ts`]);

  return {
    all: () => globSync(`${directory}**/*.ts`),
    files,
    lint: async (fixture, { skip = [], types } = {}) => {
      const findings = await run(files(fixture), {
        ...(types ? { types } : {}),
        skip: new Set(skip),
      });
      return findings.map(
        ({ file, line, column, kind, message }) =>
          `${file.replace(directory, "")}:${line}:${column}  ${kind}  ${message}`,
      );
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
