# 14. valof-lint

Investigated 2026-09-03, implemented on the `feat/valof-lint` branch. As of 2026-09-07 it is not merged into `main`. The rules are in §14.4, §14.7, §14.12, §14.14 and §14.15, and §14.8 describes the layout.

A function inside `.impl({...})` is never reported as dead, and never dropped from the bundle. `attach` puts it on the companion with `Object.defineProperty` at run time, so static analysis sees only "an object literal passed to a function".

Measured, not guessed:

- **knip 6.34.0** reports a plain unused `export function`, but says nothing about an unused companion function next to it. Neither the `--exports` shortcut nor any other issue type detects it
- **vite/rolldown** drops an unused exported function from the bundle, and keeps the companion

## 14.1 Why a standalone script

- **A knip plugin cannot do it.** `IssueType = keyof Issues`, and `Issues` is a fixed record in core (files, dependencies, exports, types, enumMembers, namespaceMembers, cycles, ...). There is no category for "a member of an exported object", and a plugin cannot add one. A plugin's hooks (`resolveFromAST`, `registerVisitors`, ...) can return only `Input[]`. They can mark something as used, but cannot report something as unused
- **A lint rule cannot do it either.** ESLint and oxlint both work per file: a rule looks at one file's AST and attaches its reports to that file. A cross-file rule such as `import/no-unused-modules` walks the project on its own, outside the lint model. An ast-grep `sg scan` rule cannot do it either, for the same reason

**Correction, 2026-09-07.** The item above originally said "oxlint runs in parallel, so accumulated state cannot be trusted". The type definitions in `@oxlint/plugins` include `createOnce`, which creates a rule once and reuses it, so **a rule can accumulate state**.

```ts
interface CreateOnceRule {
  createOnce: (context: Context) => VisitorWithHooks; // + before / after
}
```

The conclusion stands, for a different reason: **a rule can accumulate state but cannot report it.** `before` / `after` are hooks around the traversal of one file, not a hook at the end of the whole run. There is nowhere to flush the state, and `context.report` attaches to the file currently being visited. By the time the rule learns about a child's `implEquals`, the parent's file may already have been traversed.

- **A JS plugin cannot use oxlint's type-aware linting either.** A JS plugin receives `ast` / `scopeManager` / `visitorKeys` / `lines` / `lineStartIndices`, and no types. `parserServices`, where typescript-eslint passes in the checker, is always empty, and the type definitions state "Oxlint does not offer any parser services". The types live in a Go binary in a separate process (`oxlint-tsgolint`), and the type-aware rules are built-in rules inside it. No API connects the two

A companion member is reached only as `Companion.member`. Collecting the top-level keys of each `.impl({...})` and counting `Name.key` across the project is enough.

## 14.2 Parser: `oxc-parser`, not `@ast-grep/napi`

We prototyped both, and they gave the same results. On a 400-file corpus, oxc installs at 3.2 MB and runs in 21 ms; ast-grep installs at 7.2 MB and runs in 76 ms. The oxc version is 33 lines longer, because a hand-written ESTree walk replaces ast-grep's pattern DSL (`const $N = $B.impl($OBJ)`). `oxc-parser` exports `visitorKeys`, so the generic descent takes 10 lines. It also shares a lineage with oxlint / oxfmt / Rolldown. The deciding factor is that the optional peer dependency is the only cost a user pays to run this. Halving that cost beats having the DSL.

The first prototype was text-based, and missed `User["greet"]`, renamed imports, destructuring and nested `.impl`. The current version still misses anything name resolution cannot follow: chains of `export { X as Y }`, `import * as ns`, computed keys, and spreads into `.impl({...base})`.

## 14.3 Ship it inside valof

Verified on 2026-09-04 by packing a test package and installing it. A `bin` entry, with `oxc-parser` as an _optional_ `peerDependencies` entry, costs nothing to a user who does not want it. Measured in the user's `node_modules`: valof alone is 36 KB (the parser is not pulled in, the install prints no warning, and the bin asks the user to install the parser and exits 2). Opting in makes it 7.3 MB. `dependencies` stays empty, so the claims of zero runtime dependencies and about 1 kB hold. `scripts/bundle-size.ts` bundles only `./dist/index.mjs`, and `dist/lint-cli.mjs` next to it is not reachable from there.

This beats the two alternatives. A README recipe has no tests and no version, and a separate package adds another package to release. A bin inside valof uses the existing release workflow and is tested here.

### Re-evaluated 2026-09-07: the reason changed

The decision to ship it inside valof stands. **But none of the three reasons above was decisive.**

The linter was 252 lines at the time of the decision. It is now 1465 lines, larger than the 809-line library itself. The linter is larger in the shipped files too.

```
source   library  809 lines / linter 1465 lines
shipped  library 27.0 kB / linter 36.6 kB   ← linter is 58%
tarball  32 KB
```

**The real reason is that the rules track the library's API vocabulary.** There is evidence. When we merged `main`, the linter followed the rename of `with` to `patch`.

```
BUILTIN = ["equals", "with", "update", "seal", "create"]
       →  ["equals", "patch", "update", "seal", "create"]
```

The linter followed the removal of `update` (§6.4) too. BUILTIN now has four entries, and `update` is once more a member a user can write.

So did `.unpatchable` → `.fixed`, and the new `.implEquals` step. The rule in §14.7 builds directly on how `EqSpec` is spelled (an array per element, a tuple per position, a companion passed as is). The chain's root (`Val.sealer` / `Val.companion`) and the five names `.impl` rejects are library decisions too.

**A separate package would always drift.** Every release would open a window where "valof 0.5.0 uses `patch`, while valof-lint 0.4.x still looks for `with`". Living in the same repository keeps the vocabularies in step implicitly.

### The cost

- **tarball 32 KB → 39 KB.** This is the growth from shipping `valof/lint`, almost all of it `dist/lint/index.d.mts` (14.9 kB). `Finding` is derived from `RULES`, so the declaration pulls in the rules' whole type graph
- **58% of the shipped files are the linter.** The README's "1 kB gzipped" is the **bundle size**, and `scripts/bundle-size.ts` measures only `dist/index.mjs`, so the claim holds. Download size is different. `npm i valof` puts the 36 kB linter into `node_modules`
- **Release granularity is coupled.** A linter-only fix bumps the library's version. This has not caused a problem yet, because both are still changing

### When to split

Decided in advance:

- When the library is stable and **linter-only releases keep coming**
- When a linter dependency threatens to leak into the runtime dependencies (it does not now, because `typescript` is spawned without being declared)
- When the linter's share of the shipped files grows further

A split means a monorepo. `pnpm-workspace.yaml` already exists, so the repo divides into `packages/valof` and `packages/valof-lint`, and the release workflow can be shared. Above, a separate package was rejected because it "adds another package to release", but in a workspace that cost is small. In exchange, `valof-lint` carries `peerDependencies: valof`, and **the vocabularies are kept in step by declaration rather than implicitly**.

## 14.4 Rules

Ten rules decide from syntax alone. The remaining one uses go-to-definition (§14.7).

- A companion member nobody reads
- A brand string claimed by more than one **top-level** type alias
- A brand string that does not end with the type name (§14.12)
- A type alias that is a second name for a Val (§14.25)
- A companion bound to a name different from the type's (§14.21)
- A companion of a type declared in another file (§14.22)
- `Val.of` on a type that has a companion (§14.23)
- `Val.of` without a type argument (§14.24)
- A disable comment that names no rule (§14.14)
- A disable comment that silences nothing (§14.15)

Limiting the brand rule to top-level aliases matters. Without the limit, this repository's own tests report 30 collisions from fixtures scoped inside `describe` and `test`.

**The brand rule counts an enum's name with the Vals' brands, 2026-11-12.** The two are stored in
separate phantom fields, so until this change the rule counted them apart, as it still counts a
Trait's brand. Before #204, the type check that rejects a field holding Vals of different types
compared an enum's name and a Val's brand as plain strings. A Val branded "Money" beside an enum
named "Money" therefore passed it, and the rule stayed silent on the pair. A Val and an enum of one
name also confuse a reader. A Trait's brand is still counted apart, since no value has a trait as
its type.

This repository's `src` uses no companions, so the dead-member rule never fires here. It targets valof's _users_.

## 14.5 Rejected: ts-morph, 2026-09-04

Rewriting both checks with ts-morph takes 50 lines excluding comments, against the current 252. `findReferencesAsNodes()` replaces the whole read-tracking pass, and `getType().getAliasSymbol()` identifies a companion as `Sealer` / `Sealed` / `CompanionBuilder` instead of the name-based root check. The cost: 15 MB installed against 3.2 MB, and 0.31 s against 0.06 s on two files.

**ts-morph does not use TypeScript 7.** `@ts-morph/common` does not depend on `typescript`; it bundles its own compiler (12 MB of the 15 MB). So waiting for the TS 7.1 API means waiting for ts-morph's port, not for a TypeScript release. `typescript@7.0.2` exports only four things: `default`, `module.exports`, `version` and `versionMajorMinor`.

To justify the cost, we prototyped two type-based rules and rejected both.

- **Narrowing the duplicate-brand check by payload assignability is wrong.** With structural subtyping, "different payloads" does not mean "kept apart". `Val<"Id", {a: string; b: number}>` is assignable to `Val<"Id", {a: string}>` (verified). A two-way `isAssignableTo` check works in exactly the direction that misses this leak. This library exists to enforce nominal types, so a brand collision is a defect whatever the payload
- **Detecting a parent that compares a child with a custom `equals` structurally is too strict to use.** It works (verified with local type aliases, arrays, and across two files, and it stays silent on a child with no override). But an override not propagating is the design itself (§5, §7.6), so the rule fires N×M times with nothing the user can do about it. If revisited, it should report once, at the override's definition, and list where it is nested. That points at the "build in canonical form" recipe

Detecting _who overrode_ `equals` is a syntax question under either approach, because `Companion<V, M>` types `equals` as `(a, b) => boolean` whether or not it is overridden.

### Re-evaluated 2026-09-07: wait for TS 7.1

The `implEquals` spec landed, and §5 assigned the detection of a forgotten entry to the linter. That made a rule needing types concrete for the first time (§14.7), so we re-measured the premises.

**2026-09-15: that rule was withdrawn (§14.7).** No rule needs types now, and valof-lint does not use TypeScript.

**The TS 7 API still has two keys.** The record above still holds.

```
$ node -e "const ts=require('typescript'); console.log(ts.version, Object.keys(ts))"
7.0.2 [ 'version', 'versionMajorMinor' ]
```

This repository itself is on `typescript@^7.0.2`, so adopting ts-morph means **analysing TS 7 users' code with a bundled TS 5-series checker**.

**What 7.1 stabilizes is the Language Service API.** The iteration plan (microsoft/TypeScript#63703, beta 2026-10-06, stable 2026-11-24) lists three items: Language Service / Emit / Content Mapper. **It does not mention the TypeChecker.**

That is enough, because the rule in §14.7 needs go-to-definition, not the checker.

1. "Is the `Money` in this property position a Val?" → follow the reference to its declaration, and read the declaration syntactically. The LS is enough
2. "Did that companion call `implEquals`?" → a syntax question, as above. Having the checker would not change it

`findReferencesAsNodes()` and `getDefinitionNodes()` are both **LS wrappers in ts-morph, not checker wrappers**. Once the LS is stable, plain `typescript` provides the same thing.

**Supporting TS 7 means re-architecting ts-morph.** `@ts-morph/common` is designed to bundle its own compiler instead of depending on `typescript`, so porting it to a Go compiler is not a version bump. ts-morph's API is fully synchronous, so if the 7.1 API is async, it cannot be ported and stay synchronous. We cannot assume it will be ready by 2026-11.

**ts-morph's only remaining advantage is sparing us the `LanguageServiceHost` boilerplate.** Implementing `getScriptFileNames` / `getScriptVersion` / `getScriptSnapshot` / `getCompilationSettings` / `getDefaultLibFileName` takes about 60 lines, written once. The manipulation API is not needed as long as the output is a text suggestion such as "add `total: Money` to the spec".

**The LS is offset-based, which favors oxc.** `findReferences(fileName, position)` returns `{ fileName, textSpan }`, not a node. An API that returns nodes helps when the analysis lives in ts-morph, but nodes are useless when the analysis lives on the oxc AST. The code already handles offsets with `lineIndex`.

**With plain `typescript`, the optional peer dependency is effectively free.** Every TS project already has it, so the 3.2 MB vs 15 MB argument above disappears altogether.

So **ts-morph is off the table.**

### 2026-09-07, continued: no need to wait

The section above concluded "wait for 7.1, then add plain `typescript`". **Withdrawn.** It works today, on 7.0.

**TS 7.0.2 has `tsc --lsp --stdio`.** Measured:

```
initialize                34 ms
didOpen x200               5 ms
serial 50 queries         76 ms   (1.52 ms/query)
pipelined 200 queries      5 ms   (0.03 ms/query)
non-empty results    200 / 200
```

Sending `textDocument/definition` at the position of `total: Money` returns the type alias declaration in `money.ts`. The capabilities are all there too (`definitionProvider` / `typeDefinitionProvider` / `referencesProvider` / `implementationProvider` / `hoverProvider`).

**There is one pitfall.** The server sends `client/registerCapability` **as a request**. Without a reply, it deadlocks.

**Speed is not an issue.** Warm queries take 0 ms and hit the checker's cache. LSP multiplexes by id, so requests can be pipelined, collapsing the wait into one round trip. The worry that "each query is a round trip, so we need a filtering pass first" is gone.

**5.x / 6.x have no LSP, but have an in-process API.** The two complement each other.

|               | in-process API                                  | LSP                                        |
| ------------- | ----------------------------------------------- | ------------------------------------------ |
| 5.9.3 / 6.0.3 | yes (2244 / 2248 keys, `createLanguageService`) | no (`--lsp` is an Unknown compiler option) |
| 7.0.2         | no (2 keys)                                     | yes                                        |

We measured `getDefinitionAtPosition` / `textDocument/definition` on both.

|       | path                    | cold   | per query                          | results |
| ----- | ----------------------- | ------ | ---------------------------------- | ------- |
| 5.9.3 | `createLanguageService` | 166 ms | 0.15 ms                            | 200/200 |
| 6.0.3 | same                    | 159 ms | 0.20 ms                            | 200/200 |
| 7.0.2 | `tsc --lsp --stdio`     | 34 ms  | 1.52 ms serial / 0.03 ms pipelined | 200/200 |

**The old path is faster per query**, because it has no IPC round trip. tsgo is faster cold. `LanguageServiceHost` took 13 lines; the original estimate of 60 was too high.

Both return `{ file, offset }`, so one function can wrap both.

```ts
type DefinitionAt = (file: string, offset: number) => { file: string; offset: number }[];
```

**As a result, the linter covers everything from the 5.9.3 floor to 7.x without a gap**, in about 100 lines in total. No user is left behind.

### Do not send `textDocument/didOpen`

Measured during the 2026-09-07 implementation. **Sending `didOpen` for every scanned file makes the first query 10 times slower.**

```
rootUri=repo, didOpen 65 files  init 24 ms | didOpen 2 ms | first query 436 ms
rootUri=repo, no didOpen        init 30 ms | didOpen 0 ms | first query  45 ms
```

The answers are the same. `didOpen` is for buffers an editor holds unsaved, and the linter reads files on disk. The server loads the project from `rootUri` and lazily opens the files a request names. Sending every file makes it build a document for each one, and the first query waits for all of them.

The whole CLI went from 580 ms to 213 ms on 65 files. **The gap widens as the file count grows**, so real projects gain more.

Files in `tsconfig.json`'s `exclude` resolved too (this repository's fixtures are exactly that case), because the server creates an inferred project.

What remains is 30 ms of init and 45 ms for the first query, once per run. **We do not keep the process alive to amortize it.** A lint run starts only one LS anyway, and carrying it across runs needs lifecycle and staleness management. A linter that runs once in CI should not pay that complexity for 75 ms.

### `typescript` is not a peer dependency

`oxc-parser` is an optional peer dependency because the linter **`import`s it into its own process**. Module resolution has to find the user's copy, and two copies mean two parsers.

`tsc` is different. On 7.x the linter spawns it as a subprocess, and on 5.x / 6.x it `require`s it, but **it never hands a TS object back to the user**, so there is no single instance to share. The binary it shells out to is an external tool, like `git`.

At run time the linter resolves the user's own `typescript` and branches on the major version in `typescript/package.json`. Without one, it skips this rule alone without failing, and says why.

Not declaring it has these benefits: zero install footprint, no peer warnings and no ERESOLVE, no version range to keep up with TS releases, and it works with whatever TS a monorepo pins.

We also measured declaring it as a peer dependency. No nested copy was created (as the definition of peer says), and pnpm v11 stopped at the warning `[WARN] Issues with peer dependencies found`. Nothing breaks the user's code. But `typescript@7` is a thin shim whose real content is a 26 MB platform-specific optional dependency, so a duplicate would cost real space. Since we do not declare it, the issue does not arise.

|              | dependency form                   | when missing                               |
| ------------ | --------------------------------- | ------------------------------------------ |
| `oxc-parser` | optional peer (imported)          | the whole CLI exits 2 and asks for install |
| `tsc`        | not declared (spawned / required) | only the equals rule is skipped            |

### The AST pass stays

The reason changed from speed to **correctness**. A negative control queried column 0 of `export type Gen0 = ...` and got back the definition of `Gen0` itself. **Pass an imprecise position, and the server resolves some other identifier nearby.** The oxc walk produces the exact offsets. The code that follows usages starting from imports of `valof` is not replaced. It stays **as a filter on query positions**.

## 14.6 Bundle size of the namespace itself

`Val` is itself a companion, so the blind spot of §14 reaches this library's own surface. A bundler cannot drop properties of `const Val = {...}`, so a module that calls only `Val.of` still keeps `sealer`, `companion`, `unwrap`, `attach` and `deepEquals` (the same limit `eqBy` hit in §5).

Splitting the namespace into named exports was considered and rejected on 2026-09-03. It does nothing for users' companions, it duplicates the API, and a library that only wants a brand can write one in a few lines.

### Measured the split, 2026-09-15

After `equals` became a free function (§5), we revisited whether `of` / `unwrap` / `sealer` / `companion` should follow. Production gzip bytes:

| usage                          | now | only `unwrap` free | all four free |
| ------------------------------ | --: | -----------------: | ------------: |
| `of` only                      | 659 |                650 |       **273** |
| `unwrap` only                  | 659 |                274 |           274 |
| `of` + `equals` (no companion) | 852 |                843 |       **479** |
| `of` + `unwrap` + `equals`     | 852 |                852 |           493 |
| `sealer` only                  | 659 |                650 |           630 |
| `sealer` + `companion`         | 659 |                650 |           636 |
| `sealer` + `equals`            | 852 |                843 |           825 |
| everything                     | 852 |                852 |           842 |

**The 2026-09-03 rejection was right by the numbers.** An app that uses companions goes from 852 to 842, 10 B. Calling `sealer` even once pulls in `build` / `attach` / `patched`, so moving `of` out drops nothing.

**Making only `unwrap` a free function saves 9 B**, less than the 44 B §4 estimated. `detach` is just a second form of `deepCopy`, and `own` always keeps `deepCopy`. This idea is withdrawn.

**Only an app that never defines a companion gains.** 852 → 479, 373 B, more than the 193 B gained by splitting out `equals`. So whether to split depends not on size but on **whether we support types + `of` + `equals` alone as an entry point**. As long as the README starts from `Val.sealer`, those 373 B reach nobody.

`Val.of` stays, for reasons other than size.

- `seal<User>(x)` has the same name as `User.seal(x)` (the custom seal, the only gate in §6.8), and skips it. The `bypassed-companion` rule exists because it can be skipped. `Val.of` looks like a different operation (§2.2)
- `unnamed-of` makes the type argument required, so even as free functions, `seal<User>(x)` alone would be called differently from `equals(a, b)` / `unwrap(v)`. Side by side, they would not line up
- `unnamed-of` relies on `Val.of<User>` being greppable. A free function can be renamed on import, so two rules would need the same import tracking as `aliased-val`
- It is the only place the package name appears in the API (§12)

### Measured a subpath too. Still no

The idea: ship free functions `of` / `unwrap` from `valof/experimental`, and only minimal users call them. Adding the entry and measuring shows it works. `of` from `experimental` + `equals` from `valof` comes to 476 B, 373 B less than `Val` + `equals` at 849 B. Importing both is 850 B, so there is no duplication penalty.

- rolldown hoists what the two entries share into `dist/val-*.mjs`, and each entry becomes two lines of re-exports. **This is a precondition.** If the shared part were duplicated instead of chunked, there would be two `owned` WeakSets, and `patch` would not see a value sealed through `experimental` as an owned node (breaking, path by path, the basis on which §6.2 separates replacement from merge). Check this every time an entry is added
- The dts is split too, and `dist/index.d.mts` shrinks from 14.84 kB to 321 B. The types budget in `scripts/size.ts` looks at this file's raw size, so adding an entry means switching it to the shared chunk, or to the total of every `.d.mts`

**Rejected, because "Parse, don't validate" is the core of this library.** Using it without defining a companion means using it without a seal. An official entry point for that would promote a path that skips parsing. The 373 B is the price of that principle. A user who wants speed over checks can write their own util. We came back to the same conclusion as on 2026-09-03 ("a few lines to write yourself"), now backed by measurement.

## 14.7 Rule: structural comparison of a child with a custom equals, 2026-09-07. Withdrawn 2026-09-15

**Withdrawn 2026-09-15 (#36).** `implEquals` was removed (§5), so the `structural-equals` rule was removed, along with the TypeScript resolver (`typecheck/`) that only it used. What follows is the record.

When §5 made every key in the spec optional, it assigned the detection of a forgotten entry here. This is the design of that rule. We implemented it the same day, and confirmed it gives identical reports on all three paths, TS 7.0.2 / 6.0.3 / 5.9.3 (§14.5). The rejection in §14.5 as "too strict to use" predates the `implEquals` spec. **Now the fix is one line in the parent, so it no longer applies.**

**Rule.** For each Val position in a parent's payload whose child transitively has a custom equals, the parent's spec must have **some** entry.

The point is that **any** entry is enough. `total: Money`, `updatedAt: () => true` (excluded from equality) and `span: [undefined, Money]` all show the author looked at that position. The syntactic position alone tells them apart.

| spec form                              | reading                         |
| -------------------------------------- | ------------------------------- |
| `Identifier`                           | delegate to the companion       |
| `ObjectExpression` / `ArrayExpression` | descend                         |
| function                               | author's call, stay silent      |
| `implEquals` given a bare function     | hand-written whole, stay silent |

**Syntax alone is enough.** Confirmed on the parser output:

- `typeArguments.params[0]` of `Val.sealer<Order>()` is a plain `TSTypeReference`, which connects the companion to the type alias
- The payload type can be descended in the same shape as the spec. `TSPropertySignature` / `TSArrayType` / `TSTupleType` / nested `TSTypeLiteral` map one to one onto `{k: spec}` / `[spec]` / positional / a plain object

The two sides are matched by **alias name**, not by the companion's variable name. This is simpler than the unused-member rule.

### Decisions

**Report on the parent**, at the `Val.sealer<Order>()` line. §14.5 proposed "report once at the override's definition and list where it is nested", but we do not adopt it. The fix goes in the parent, not in `Money`, so a report on `Money`'s line does not tell the user which file to open. It also matches the two existing rules.

**Prevent cascades with the transitive closure.** With `Order → OrderLine → Money` where only `Money` has a custom equals, a naive implementation fires only on `OrderLine`, and **fixing it makes the next run fire anew on `Order`**. "Fixing it made more" is the worst experience. Compute the transitive closure. A type needs dispatch if it or any descendant has a custom equals, so both are reported from the start.

**Name collisions are duplicate-brand's job.** If two files both have `type Money`, name resolution cannot tell them apart, and the rule would misfire. The alias → brand mapping already exists, so **report only when the name resolves to a single brand within the scan**. Another rule reports the collision itself, and fixing that is enough.

**The `PayloadOf` path is deliberately out of scope.** This is correct behavior, not a miss.

```ts
type OrderB = Val<"OrderB", { total: PayloadOf<Money> }>;
```

The other rule in §9 says "do not put `PayloadOf` in a field position, write `total: Money`". If the equals rule fired here, it would say "keep the payload and add `Money.equals` to the spec", and **two rules would give contradictory instructions on the same line**. It would also push the fix in the direction that hides the real defect. As §4.3 says, the brand is dropped here, and with it the child's seal and the tracked sharing, so restoring equals alone does not fix it. Changing to `total: Money` makes the rule fire, naturally and correctly. The rule stays silent on a top-level `PayloadOf<User> & { … }` too. A `SuperUser` contains no `User` value, it only reuses the field types, so there is nothing to dispatch to.

**Implementation pitfall.** A naive version stays silent on its own here, so nobody notices, but it breaks the moment `ReadonlyArray<Money>` is treated like `readonly Money[]`. The former requires descending into a `TSTypeReference`'s type arguments, and generalizing that also picks up the `Money` inside `PayloadOf<Money>`. Make the walk **a whitelist of "shapes a spec can map"**: `TSTypeLiteral` / `TSArrayType` / `TSTupleType` / `ReadonlyArray` / `Array`. Any other type reference is opaque, and the rule stays silent. `PayloadOf`, `SeedOf` and `Omit` are all excluded there.

### Out of reach

All of these are misses, not false positives.

- Generic, conditional and mapped payloads
- Companions outside the scan
- Positions where `typescript` is not found, or resolution fails

**Go-to-definition closes only the reference side.** During the 2026-09-07 implementation this memo once said "going through a helper is covered too". That was wrong. Corrected here.

What it covers is **the paths that reach the child**: renamed imports, re-exports, `interface`, one alias hop, intersections, `Money | null`. Each follows the reference to its declaration, so there is no need to trace it syntactically.

What it does not cover is **the side that recognizes an alias as a Val**. `type Money = Branded<"Money", X>` through `type Branded<K, T> = Val<K, T>` does not enter the candidate set, because collection checks by name that `Val<…>` is written directly. So it is not recognized as a child. **This is the same hole duplicate-brand has, and the whole linter rests on this assumption.** Closing it means identifying `Val` itself with go-to-definition too. It is a miss, not a false positive, so there is no hurry. 2026-11-05: a helper that takes the brand as a type parameter is now a type error, so this path no longer exists (§15.1 "Holes in trait declarations").

### Why N×M is nothing to fear

Under §5's "build in canonical form" principle, `implEquals` is a discouraged escape hatch. The rule fires only on types that have already taken that escape hatch, so N is small. And N×M firings correspond to N×M **necessary** fixes. They are real counts, not noise.
