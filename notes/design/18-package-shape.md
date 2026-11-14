# 18. The shape of the package, 2026-10-19

**`Val` / `Enum` / `Trait` became namespaces,** the same shape as byethrow's `Result`. While they were objects, a
user's bundler cannot drop unused members. As a namespace, `Val.sealer` becomes a direct reference,
and unread members are removed.

To share the name with the type, import the namespace and export it together with a local type of
the same module.

```ts
// src/val.ts
import * as Val from "./namespace/val.ts"; // export { companion, of, sealer, unwrap } from "../val.ts"
type Val<K extends string, T, Tr extends AnyTrait = never> = /* … */;
export { Val };
```

- **`export * as Val` and `export type { Val }` cannot coexist.** TS2300
- **`export type Val` and `import * as Val` do not merge either.** TS2395. Make it a local
  declaration and export it with `export { Val }`
- **`val.ts` and `namespace/val.ts` import each other circularly.** Namespace members are read only at call
  time, so evaluation order causes no problem

## 18.1 tsc emits the runtime entries file by file

**Bundling with Rolldown makes it bigger.** The library build turns the namespace into an object with
getters (`__exportAll({...})`), and the user's bundler cannot drop its members. Measured, the base went
from 925 to 997 B (+72 B). `unbundle: true` still goes through `__exportAll`.

**Bundling the `.d.ts` changes type names.** The merged type and namespace become `val_d_exports`,
which shows up in users' type errors.

```
Type 'val_d_exports<"X", { a: number; }>' is not assignable to type '0'.
```

`index` and `experimental` are emitted by `tsc -p tsconfig.build.json`. The lint side stays on
`vp pack`. `customExports` adds the two to the `exports` that `vp pack` writes. In tsc's output,
`import * as Val` stays as written, and type errors still say `Val<…>` (5.9 / 7.0). Instantiations
do not change (core 5,814 → 5,810).

| Production gzip        | Before  | After   | Diff |
| ---------------------- | ------- | ------- | ---- |
| `sealer` + `companion` | 925 B   | 884 B   | -41  |
| + `Val.of`             | 939 B   | 906 B   | -33  |
| + the two `Enum` ones  | 1,418 B | 1,377 B | -41  |
| + `Trait.companion`    | 1,016 B | 973 B   | -43  |

The `Enum` and `Trait` increments barely change (-2 B or less), because every member only calls the
same internal function. We aligned them anyway. There is one shape, and members added later cost
only those who use them.

- **Rejected: `export const Val = ns`.** The namespace materializes as an object, growing to 979 B
- **Rejected: keep Rolldown, with a plugin that makes `src/namespace/*.ts` separate entries and treats them
  as external.** The type and namespace merge would move to a type alias in `index.ts`, duplicating
  the JSDoc
- **Rejected: ship `.ts` instead of emitting `.d.ts`.** `skipLibCheck` does not apply to `.ts`, so
  the library's source would be checked under the user's settings. valof's types assume
  `exactOptionalPropertyTypes` (§3.5). Node's type stripping refuses `.ts` in `node_modules`

## 18.2 The bundle-size base is `Val.companion`

`Val.of` is an escape hatch, so it stays out of the base. `Val.of` and `Val.unwrap` were added to
every bundle. On 2026-10-21 `Val.sealer` was removed (§6.12), and the base became `Val.companion`
alone.

An entry reads a member, as in `Val.companion`. `console.log(Val)` keeps the whole namespace and
pulls in Rolldown's runtime too, measuring a shape that differs from users' code.

## 18.3 The declaration budget goes to 96 kB

tsc indents with four spaces, and tsdown used tabs. The same types went from 64.1 to 64.7 kB, 686 B
over 64 kB. Following §16's "what we want to catch is a multiplying accident", we raise it. Enum and
path (§15.3) would force a raise anyway.

- **Rejected: post-process leading spaces into tabs.** At 64,972 B it fits in 64 kB, but it saves
  only about 1.1 kB, and that affects only download and parse time
- **Rejected: minify the `.d.ts`.** Removing JSDoc brings it to 26.7 kB, but the hover explanations
  disappear. Squeezing only whitespace makes the declarations unreadable when go-to-definition opens
  them

## 18.4 The `internal/*` that users' declaration output references, 2026-10-25

**With `declaration: true`, exporting a companion was enough to make a user's declaration output
fail.** It happened with `moduleResolution` set to `bundler` and to `nodenext` alike. The inferred
type references types that no entry exports.

- Companions and builders of Enum, Trait and `implTrait` failed with TS2742 / TS2883, on
  `Unbound`, `Unsealed`, `CallBuildFirst` and others
- A companion given `PrivateSeal` failed with TS4094

**`exports` gained `"./internal/*": "./dist/*.js"`.** A user's declaration output then reads:

```ts
readonly dyn: import("valof/internal/val").CallBuildFirst;
```

The build regenerates `exports` in `package.json`, so the entry goes in `customExports` in
`vite.config.ts`. This subpath is outside semver, and users are not meant to import from it.

**It stays out of the user docs.** Its absence from the docs itself shows that it is not public API.
We first wrote "outside semver" in `api.md`, then removed it because it does not concern users.

**Rejected: export the referenced types from an entry.** Internal paths are easier to see as one line
in `package.json`'s `exports`. An entry's exports stay the list of public names. This was not decided
after a deep comparison.

**`PrivateSeal` and `PrivateCreate` became the classes themselves.** They used to be type aliases of
an unexported class (`PrivateSealPhantom`). Declaration output expands an alias without type
arguments into the class, and a user's `.d.ts` cannot name an unexported class, so it becomes an
anonymous class with a private member and fails with TS4094. `Unpatchable<K>` has a type argument and
is emitted as an alias (`[Unpatchable<"id">]`, confirmed on 7.0). `PrivateCreate` came in with the
same shape in #87, so it got the same fix.

The check changed too (§10.1).

## 18.5 Keep users' declaration output from cutting types to `any`, 2026-11-03

**On TypeScript 7.1, exporting `Trait.companion<…>().impl(…)` failed with TS7056.** When a printed
type nests deeper than 10 levels, 7.1 now reports an error where it used to silently write
`/*elided*/ any` (microsoft/TypeScript#64461, an intended change). In users' `.d.ts` on 5.9 / 6.0 /
7.0, that spot had become `any`.

**It happens only when a builder without `.build()` is exported with its inferred type.** A companion
after `.build()` was emitted by name even before the fix. Holding the builder under another name
triggers `companion-mismatch`, so in code that passes lint, the only case left is an export with the type's
name that forgot `.build()`. Code that uses it gets a type error with the `CallBuildFirst` guidance, but
in a file that only exports, TS7056 appeared on the definition line before the guidance.

- **Trait**: `TraitBuilder` was `{…} & (Open extends true ? { impl } : unknown)`. After `impl`, the
  intersection collapsed to one member and lost its alias name, so it was printed structurally.
  `implAssoc` returns itself, so each step nested one level deeper
- **Enum**: the variant steps (`Shape.Circle`, after `.Circle.implSeal(…)` and so on) had failed with
  TS7056 since 5.9. Each step's return was wrapped in an unexported alias `After`. A user's `.d.ts`
  cannot name `After`, so it expanded and nested. The fixture exported variant steps only in the
  shape closed by an enum step, so the failure was hidden

**The fix: make them print by name.**

- `TraitBuilder` became a conditional type that picks between two interfaces by `Open`:
  `TraitSteps` (the steps every state has) and `TraitImplStep`, which extends it and adds `impl`. A
  user's declaration shows `import("valof/internal/trait").TraitSteps<…>` (§18.4)
- `After` was removed, and steps return `EnumBuilder<…>` directly. `VariantSteps` is now exported
  (`valof/internal/enum`)
- Type cost did not change (trait +5, enum -12 instantiations, `index.d.ts` +0.19 kB). The
  declaration emitted for ts-compatibility's `declarations.ts` went from 16.9 kB to 8.2 kB

**Rejected: an `extends` in which `TraitImplStep` overrides `implAssoc` as well.** Redeclaring a
generic `implAssoc` that differs only in its return type in the derived interface fails with TS2430.
Instead, the base takes `Open`, and `implAssoc` returns `TraitBuilder<Tr, G, Open, …>`.

**What we lost.** Before `impl`, hovers and errors show the builder as `TraitImplStep<…>`, not
`TraitBuilder<…>`. The error for writing `impl` twice shows only the name `TraitSteps<…>`, not a
structure listing the remaining steps. We considered renaming it `TraitBuilderBeforeImpl`, but
showing the name `TraitImplStep` as it is reads more clearly (the user's decision).

**Rejected: stop exporting the builders in the fixture.** The TS7056 for a forgotten `.build()` would
remain, and we could no longer have a check that watches for depth truncation.

**Rejected: put `impl?: never` on the closed state so the intersection does not collapse.** `impl`
would show up in completion, and the error for calling it would no longer say it does not exist.

**Remaining expansion.** Once every variant step is closed (after `.impl` and so on), the `VariantSteps` intersection in `Shape.Circle`
has its `VariantSteps` intersection collapse to one member, so it is printed structurally. The steps
inside print by name as `EnumBuilder<…>`, so it does not nest, and it passes.

**The check.** ts-compatibility's fixture `builders.ts` exports every state of every builder with its
inferred type. If declaration output changes an export's type, the check fails that TypeScript line even with no compile error
(§10.1 "Declaration round trip"). At first the check searched the `.d.ts` for the string
`/*elided*/`.

**7.1 stays out of the ts-compatibility lines.** It is in beta. Once a stable release ships, the
`typescript` devDependency moves to it as the current line (§10.1). The spots that 7.1 turns into
TS7056 appear as `/*elided*/` on the earlier lines, so the check above catches them.

## 18.6 `AnyVal`, `AnyEnum` and `AnyTrait` are no longer exported from the entry, 2026-11-12

**No user code needs to know that a value is a Val without knowing which one.** A store or a
serializer that does not care which Val it holds takes the payload `Val.unwrap(v)` returns, which
fits a JSON type the user writes. The Val itself does not fit `{ readonly [k: string]: Json }`,
because the classes it carries (`Phantom` and `Verdict`) have no implicit index signature. A
primitive Val fits `Json`, and any Val fits `object`. Code that cares which Val it holds references
the Val's type, or calls its companion.

No user code needs an enum or a trait without knowing which one either. Code that uses a trait
references it, as in `Impl<Greetable>` or `Dyn<Greetable>`.

**What we lost: a generic over every Val, enum or trait.** `<V extends AnyVal>(v: V) => Val.unwrap(v)`
can no longer be written against the entry. `equals` and `Val.unwrap` still take any Val.

**A user's declaration output is unaffected.** Exporting `equals` or `Val.unwrap` under a name of
the user's own emits `import("valof/internal/val").AnyVal` (§18.4). ts-compatibility checks that
output for `equals` on every TypeScript line.

We found no other inferred type in a user's exports that references one of the three. Exporting
`Enum.companion` itself does, but it already fails with TS4023 on `EnumKey`.
