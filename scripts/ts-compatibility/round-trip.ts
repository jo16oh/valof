import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import * as ts from "typescript-5";

/** A program comparing each export of some modules with the type their declarations give it. */
export interface RoundTrip {
  readonly project: string;
  /** Each export's name, such as `fixture-builders.ts: traitImpl`, keyed by the line that compares it. */
  readonly exports: ReadonlyMap<number, string>;
}

/**
 * Writes the program to `round-trip/` under `directory`, whose `tsconfig.json` it extends. `files`
 * are the modules, and `dts` the directory their declarations were emitted to, at the same paths.
 *
 * `Equal` distinguishes `any` from every other type, so an export fails where TypeScript truncated a
 * type in its declaration to `/*elided*\/ any`, and where the declaration no longer exports it. A
 * type alias or an interface the module declares compares equal to the one its declaration
 * declares again. An enum, a `unique symbol`, or a class with a private member does not.
 */
export async function roundTrip(
  directory: string,
  files: readonly string[],
  dts: string,
): Promise<RoundTrip> {
  const imports: string[] = [];
  const comparisons: { name: string; source: string; declaration: string }[] = [];

  for (const [index, { file, symbols }] of exportsOf(directory, files).entries()) {
    const path = relative(directory, file);
    const module = path.replace(/\.ts$/, ".js");
    imports.push(
      `import type * as S${index} from "../${module}";`,
      `import type * as D${index} from "../${relative(directory, join(dts, module))}";`,
    );
    for (const { name, value, parameters } of symbols) {
      if (value) {
        comparisons.push({
          name: `${path}: ${name}`,
          source: `typeof S${index}.${name}`,
          declaration: `typeof D${index}.${name}`,
        });
      }
      if (parameters === undefined) continue;
      // A generic type compares as a function of its parameters, which `Equal` relates for every
      // argument at once.
      const list = Array.from({ length: parameters }, (_, i) => `T${i}`).join(", ");
      const type = (module: string): string =>
        parameters === 0 ? `${module}.${name}` : `<${list}>() => ${module}.${name}<${list}>`;
      comparisons.push({
        name: `${path}: type ${name}`,
        source: type(`S${index}`),
        declaration: type(`D${index}`),
      });
    }
  }

  const head = [
    "type Equal<X, Y> =",
    "  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;",
    "type Expect<T extends true> = T;",
    ...imports,
  ];
  const lines = comparisons.map(
    ({ source, declaration }, i) => `export type _${i} = Expect<Equal<${source}, ${declaration}>>;`,
  );

  const project = join(directory, "round-trip");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "index.ts"), `${[...head, ...lines].join("\n")}\n`);
  await writeFile(
    join(project, "tsconfig.json"),
    `${JSON.stringify(
      {
        extends: "../tsconfig.json",
        files: ["index.ts"],
      },
      undefined,
      2,
    )}\n`,
  );
  return {
    project,
    exports: new Map(comparisons.map(({ name }, i) => [head.length + i + 1, name])),
  };
}

interface Export {
  readonly name: string;
  readonly value: boolean;
  /** How many type parameters it takes, where the name is a type too. */
  readonly parameters: number | undefined;
}

// The checker reads the exports, and resolves `export *` and `export { … }` too. Every TypeScript
// line returns the same exports, and the 5.x one has the compiler API.
function exportsOf(
  directory: string,
  files: readonly string[],
): { file: string; symbols: Export[] }[] {
  const config = ts.getParsedCommandLineOfConfigFile(join(directory, "tsconfig.json"), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  })!;
  const program = ts.createProgram(files, config.options);
  const checker = program.getTypeChecker();

  return files.map((file) => {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!);
    const symbols = (module === undefined ? [] : checker.getExportsOfModule(module)).map(
      (exported): Export => {
        const symbol =
          exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const value = (symbol.flags & ts.SymbolFlags.Value) !== 0;
        const type = (symbol.flags & ts.SymbolFlags.Type) !== 0;
        if (!value && !type) throw new Error(`${file}: cannot compare ${exported.name}`);
        // Each declaration of a merged type lists the parameters again.
        const declared = (symbol.declarations ?? [])
          .filter(
            (declaration) =>
              ts.isTypeAliasDeclaration(declaration) ||
              ts.isInterfaceDeclaration(declaration) ||
              ts.isClassDeclaration(declaration),
          )
          .map((declaration) => declaration.typeParameters ?? []);
        // The `<T0>() => …` comparison declares the parameters without constraints, which a
        // constrained parameter rejects.
        if (declared.flat().some((parameter) => parameter.constraint !== undefined)) {
          throw new Error(
            `${file}: cannot compare ${exported.name}, whose type parameters have constraints`,
          );
        }
        const parameters = Math.max(0, ...declared.map((list) => list.length));
        return { name: exported.name, value, parameters: type ? parameters : undefined };
      },
    );
    return { file, symbols };
  });
}
