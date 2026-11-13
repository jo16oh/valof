import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import * as ts from "typescript-5";
import { Val } from "#valof";

import { output, writeJson } from "../../../shared/repository.ts";
import type { Tsc } from "../../../shared/typescript-lines.ts";

/** A program comparing each export of some modules with the type their declarations give it. */
export type RoundTrip = Val<
  "RoundTrip",
  {
    project: string;
    /** Each export's name, such as `fixture-builders.ts: traitImpl`, keyed by the line that compares it. */
    exports: Record<string, string>;
  }
>;
export const RoundTrip = Val.companion<RoundTrip>()
  .implAssoc(({ seal }) => ({
    /**
     * Writes the program to `project`, for the declarations of `exports` emitted to `dts` at the
     * same paths as the modules. The program's `tsconfig.json` extends the one in their directory.
     *
     * `Equal` distinguishes `any` from every other type, so an export fails where TypeScript
     * truncated a type in its declaration to `/*elided*\/ any`, and where the declaration no longer
     * exports it. A type alias or an interface the module declares compares equal to the one its
     * declaration declares again. An enum, a `unique symbol`, or a class with a private member does
     * not.
     */
    write: async (exports: SourceExports, dts: string, project: string): Promise<RoundTrip> => {
      const imports: string[] = [];
      const comparisons: Comparison[] = [];

      for (const [index, { file, symbols }] of exports.modules.entries()) {
        const path = relative(exports.directory, file);
        const module = path.replace(/\.ts$/, ".js");
        imports.push(
          `import type * as S${index} from "${relative(project, join(exports.directory, module))}";`,
          `import type * as D${index} from "${relative(project, join(dts, module))}";`,
        );
        for (const { name, value, parameters } of symbols) {
          if (value) comparisons.push(Comparison.value(path, index, name));
          if (parameters !== undefined)
            comparisons.push(Comparison.type(path, index, name, parameters));
        }
      }

      const head = [
        "type Equal<X, Y> =",
        "  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;",
        "type Expect<T extends true> = T;",
        ...imports,
      ];
      const lines = comparisons.map(Comparison.line);

      await mkdir(project, { recursive: true });
      await writeFile(join(project, "index.ts"), `${[...head, ...lines].join("\n")}\n`);
      await writeJson(join(project, "tsconfig.json"), {
        extends: relative(project, join(exports.directory, "tsconfig.json")),
        files: ["index.ts"],
      });

      return seal({
        project,
        exports: Object.fromEntries(comparisons.map(({ name }, i) => [head.length + i + 1, name])),
      });
    },
  }))
  .impl(() => ({
    /**
     * The exports whose declaration changes their type. Throws on an error outside the
     * comparisons, such as a declaration that does not parse.
     */
    differs: async ({ project, exports }, tsc: Tsc): Promise<string[]> => {
      try {
        await tsc(["-p", project]);
        return [];
      } catch (error) {
        const lines = [...output(error).matchAll(/round-trip\/[^/]+\/index\.ts\((\d+),\d+\)/g)].map(
          ([, line]) => exports[line!],
        );
        if (lines.length === 0 || lines.includes(undefined)) throw error;
        return [...new Set(lines as string[])];
      }
    },
  }))
  .build();

/**
 * One export of module `S${index}`, compared with its declaration in `D${index}`, under `name`,
 * such as `fixture-builders.ts: traitImpl`.
 */
type Comparison = Val<"Comparison", { name: string; source: string; declaration: string }>;
const Comparison = Val.companion<Comparison>()
  .implAssoc(({ seal }) => ({
    /** The type of a value the module at `path` exports. */
    value: (path: string, index: number, name: string): Comparison =>
      seal({
        name: `${path}: ${name}`,
        source: `typeof S${index}.${name}`,
        declaration: `typeof D${index}.${name}`,
      }),
    /** A type the module at `path` exports, which takes `parameters` type parameters. */
    type: (path: string, index: number, name: string, parameters: number): Comparison => {
      // A generic type compares as a function of its parameters, which `Equal` relates for every
      // argument at once.
      const list = Array.from({ length: parameters }, (_, i) => `T${i}`).join(", ");
      const type = (module: string): string =>
        parameters === 0 ? `${module}.${name}` : `<${list}>() => ${module}.${name}<${list}>`;
      return seal({
        name: `${path}: type ${name}`,
        source: type(`S${index}`),
        declaration: type(`D${index}`),
      });
    },
  }))
  .impl(() => ({
    /** The program's line for the comparison at `index`, which fails where the two differ. */
    line: ({ source, declaration }, index: number): string =>
      `export type _${index} = Expect<Equal<${source}, ${declaration}>>;`,
  }))
  .build();

/** The exports of some modules under one directory. */
export type SourceExports = Val<"SourceExports", { directory: string; modules: ModuleExports[] }>;
export const SourceExports = Val.companion<SourceExports>()
  .implAssoc(({ seal }) => ({
    /**
     * Reads the exports of `files`, modules under `directory`. Every TypeScript line returns the
     * same exports, and the 5.x one has the compiler API.
     */
    read: (directory: string, files: readonly string[]): SourceExports => {
      const config = ts.getParsedCommandLineOfConfigFile(
        join(directory, "tsconfig.json"),
        undefined,
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
          },
        },
      )!;
      const program = ts.createProgram(files, config.options);
      const checker = program.getTypeChecker();

      return seal({
        directory,
        modules: files.map((file) => ModuleExports.read(program, checker, file)),
      });
    },
  }))
  .build();

type ModuleExports = Val<"ModuleExports", { file: string; symbols: Export[] }>;
const ModuleExports = Val.companion<ModuleExports>()
  .implAssoc(({ seal }) => ({
    // The checker resolves `export *` and `export { … }` too.
    read: (program: ts.Program, checker: ts.TypeChecker, file: string): ModuleExports => {
      const module = checker.getSymbolAtLocation(program.getSourceFile(file)!);
      const exported = module === undefined ? [] : checker.getExportsOfModule(module);
      return seal({ file, symbols: exported.map((symbol) => Export.read(checker, file, symbol)) });
    },
  }))
  .build();

type Export = Val<
  "Export",
  {
    name: string;
    value: boolean;
    /** How many type parameters it takes, where the name is a type too. */
    parameters?: number;
  }
>;
const Export = Val.companion<Export>()
  .implAssoc(({ seal }) => ({
    /** Throws on an export the round trip cannot compare. */
    read: (checker: ts.TypeChecker, file: string, exported: ts.Symbol): Export => {
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

      return seal({ name: exported.name, value, ...(type ? { parameters } : {}) });
    },
  }))
  .build();
