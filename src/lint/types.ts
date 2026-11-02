import { createRequire } from "node:module";

import { MissingTypeScriptError } from "./errors.ts";

/**
 * How many parameters the declared type of a top-level const has, or of one of its properties:
 * `const toWire: ToWire = …`, read through the alias. `undefined` where it has no call signature.
 */
export type Arity = (file: string, offset: number, property?: string) => number | undefined;

/** The part of `typescript/sync` read here. */
type Sync = {
  API: new (options: { cwd: string }) => {
    createProgram: (
      files: readonly string[],
      options: Record<string, unknown>,
    ) => {
      getProject: () => { checker: Checker };
    };
    close: () => void;
  };
  SignatureKind: { Call: number };
  ModuleKind: { NodeNext: number };
  ModuleResolutionKind: { NodeNext: number };
};

type Type = object;
type Checker = {
  getTypeAtPosition: (file: string, offset: number) => Type | undefined;
  getPropertyOfType: (type: Type, name: string) => object | undefined;
  getTypeOfSymbol: (symbol: object) => Type;
  getSignaturesOfType: (type: Type, kind: number) => readonly { parameters: readonly unknown[] }[];
};

/**
 * Starts a TypeScript program over the files, and answers {@link Arity} from it.
 *
 * Loaded with `require` when a rule first asks, so a run that asks nothing needs no TypeScript.
 * TypeScript 7.0 has no `typescript/sync`, so it counts as missing.
 *
 * @throws {MissingTypeScriptError}
 */
export function arities(files: readonly string[]): { arity: Arity; close: () => void } {
  let sync: Sync;
  try {
    sync = createRequire(import.meta.url)("typescript/sync") as Sync;
  } catch (error) {
    const { code } = error as { code?: string };
    if (
      code === "MODULE_NOT_FOUND" ||
      code === "ERR_MODULE_NOT_FOUND" ||
      code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
    )
      throw new MissingTypeScriptError({ cause: error });
    throw error;
  }
  const api = new sync.API({ cwd: process.cwd() });
  const { checker } = api
    .createProgram(files, {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      module: sync.ModuleKind.NodeNext,
      moduleResolution: sync.ModuleResolutionKind.NodeNext,
    })
    .getProject();
  const arity: Arity = (file, offset, property) => {
    const declared = checker.getTypeAtPosition(file, offset);
    const symbol =
      declared && property !== undefined
        ? checker.getPropertyOfType(declared, property)
        : undefined;
    const type = property === undefined ? declared : symbol && checker.getTypeOfSymbol(symbol);
    if (!type) return undefined;
    const [signature] = checker.getSignaturesOfType(type, sync.SignatureKind.Call);
    return signature?.parameters.length;
  };
  return { arity, close: () => api.close() };
}
