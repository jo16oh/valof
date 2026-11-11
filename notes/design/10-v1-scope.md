# 10. Scope of v1

**In:**

- Branded types + `Val.sealer` / `Val.companion` + `.impl()`
- Restricted allowed types (Primitive / Val / ReadonlyArray / Record)
- No `undefined` as a value (optional keys are allowed)
- DeepReadonly
- The default `equals` and overriding it
- Origin decides whether a constructor exists (through the sealer or not)
- The constructor deep-copies its argument, with an explicit `.nocopy` (§4.1)
- Constructor registration splits into two (`implSeal` = the only gate that seals / `implCreate` = generates a payload and feeds it to the seal, §6.7 / §6.8)
- A `.impl` method's first parameter is fixed to the Val and needs no annotation (§6.5)
- `patch` (independent of Result, goes through the seal, cannot be overridden, §6.6)
- `Unpatchable<K>` and `PrivateSeal` (companion type arguments that exclude keys from `patch` / hide `seal`, §6.12)
- `Val.of` (calls the default seal with the type name, §2.2)
- `Val.unwrap` (the exit that takes out a mutable copy, §4)

**Out:**

TaggedEnum, Map/Set wrappers, Result, run-time freeze (except in dev), Date/Temporal, equals dispatch from a parent, the free-function versions `Val.equals` / `Val.with` / `deepEquals`, gating the constructor, `implSeal` / `implCreate` on the sealer

## 10.1 Supported TypeScript

**valof supports the last release of each major line and later.** The current minimum is 5.9.3, and the README says `TypeScript 5.9 or later`.

The minimum is not "the oldest version that works". Measured, **the 4.x line and 5.0.4 both pass**. valof still raises the minimum because nobody would need support for the edge cases a version in the middle of a line brings (half-landed flags, deprecations not yet in effect). A line's last release is where that line's semantics settle. With TS 7 as the latest line, the last release of the line two back is 5.9.3.

CI runs each line with `vp run ts-compatibility` (`scripts/ts-compatibility/`), **against the declarations in the published `dist`**.

It reads the scripts as fixtures too, but only when the pinned commit builds the same `dist` as now (§19).

### Why the declaration files and not src

A `.d.ts` is a generated artifact, and another compiler produces it (`dts: { tsgo: true }` in `vp pack`). Type-checking src proves only that this syntax passes this compiler. It proves nothing about the result after emit.

Removing `protected readonly __valof_internal_phantom_types` from `Phantom` gives these measured results:

|                                             |                 |
| ------------------------------------------- | --------------- |
| `vp check` (tsgo, src)                      | pass            |
| `vp test` (285 tests)                       | pass            |
| doc blocks against `dist` (5.9 / 6.0 / 7.0) | fail in 9 files |

Declaration emit **erases the types** of private fields. In src, `private __brand: K` carries `K`, so `PayloadOf` works. After emit, only the `protected` line keeps the type argument. Removing it makes `patch` disappear and `PayloadOf` become `never` for users, yet checking src with any version stays green. **As long as checks look at src, the emit path goes unchecked**. That one fact is why this command exists.

### The fixtures are the book's code blocks

`public-api.ts` (61 handwritten lines) was removed. It was a second copy of the API surface, and someone had to update it by hand on every API change.

Instead, the ```ts blocks in `docs/src` are written out to `docs/.generated/ts-compatibility/` and run. **The docs are maintained for their own reasons**, so the copying work disappears. The surface it runs also grew from 1 file to 29 blocks. In the measurement above, 9 files failed. That breadth is what makes it catch the change.

The 8 blocks with `// @errors` are excluded. Which error appears with which code shifts from one TypeScript line to another, and bare `tsc` has no place to put an expectation. `vp test` (twoslash, 5.9, against src) covers them. The split is as follows.

|                                               |                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| the doc check in `vp test`                    | Does the prose match the current `src`? Expected errors are checked here too |
| `vp run ts-compatibility`                     | Can users on each line use the published `.d.ts`?                            |
| `tests/val.test.ts` (73 `expectTypeOf` calls) | Type details, in depth, against `src`                                        |

Explicit annotations of the "types you do not write" (`Sealer` / `Sealed` / `CompanionBuilder` / `Companion`) were dropped, and nothing replaces them. `api.md` says there is no reason to import these types yourself, so an example in the book would contradict that chapter, and a test would protect code nobody writes. The doc blocks generate all four implicitly through dist, so if the internals break, those blocks fail.

### Lines are pinned with aliases, not the registry

`typescript-5` / `typescript-6` / `typescript` sit in devDependencies, and the versions are read from `node_modules`. No npm install, no registry query.

**It used to read from the registry** (fetching the latest of each major above the minimum). The reason was that a written-down list goes stale the moment it is written, and a new major does not enter CI until someone notices. This was reversed. In practice, it cost a network dependency on every PR, and CI turned red without any change on our side. A new major comes in when someone adds one alias.

The 7.x line runs too. It is the same line as tsgo in `vp check`, but that checks src, and this checks dist. Users go through a different path. It is a Go implementation, so the extra cost is close to nothing.

When this rule went in, only 6.0.3 failed. The cause was not the library. TS 6 had removed the fixture's `baseUrl`. **Only running each line catches this kind of thing**.

### Resolving through `exports`, 2026-10-25

**It used to point `paths` straight at `dist/*.d.ts`.** That bypassed `exports`, so declarations could reference any file in `dist`. The problem of users' declaration output failing (§18.4) stayed invisible. Before the fix, CI was green while 13 of the book's code blocks failed.

Now `dist` and `package.json` are copied into `node_modules/valof` in the working directory. This is the same layout npm installs, and `exports` decides what declarations can reference. `paths` was removed.

- **The working directory gets its own `package.json`.** Without it, `valof` resolves to this repository by self-reference and skips the copy
- **Forms the book does not have go in `scripts/ts-compatibility/fixtures/*.ts`.** They run together with the book's code blocks. There are three now: exporting a builder before build (which references `CallBuildFirst`), and companions given `PrivateSeal` and `PrivateCreate`
- **The fixtures are excluded from oxlint's type checking.** CI runs `vp check` before the build, and the fixtures' `valof` looks for `dist` by self-reference, so it fails with no `dist`

The changes the check catches were measured. With `paths` restored, removing `./internal/*` stays green.

| change                                        | what fails                                                      |
| --------------------------------------------- | --------------------------------------------------------------- |
| remove `./internal/*`                         | 9 book blocks and the fixture's builder                         |
| turn `PrivateSeal` back into an alias         | the fixture's `PrivateSeal` (TS4094)                            |
| turn `PrivateCreate` back into an alias       | the fixture's `PrivateCreate` (TS4094)                          |
| remove the working directory's `package.json` | 5.9 only (TS2209, the root is ambiguous through self-reference) |

### Declaration round trip, 2026-11-03

**For every export of the book's blocks and the fixtures, the types check that the type from source and the type read from the emitted `.d.ts` are identical.**
Declaration output can lose types without an error. Up to 7.0, it truncates deep types to `/*elided*/ any` (§18.5).

```ts
import type * as S0 from "../fixture-builders.js";
import type * as D0 from "../dts/fixture-builders.js";
export type _0 = Expect<Equal<typeof S0.traitImpl, typeof D0.traitImpl>>;
```

- `Equal` is `(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2`. It tells `any` apart from other types.
  It treats a `type Greetable = Trait<…>` declared separately in the source and in the `.d.ts` as identical (probed on 5.9 / 6.0 / 7.0)
- Values are compared through `typeof`, types as they are. A generic type is wrapped as `<T0>() => S.Result<T0>`. A type argument with a constraint cannot be wrapped,
  so the enumeration throws when one appears (none does now)
- The exports are enumerated with the `typescript-5` checker (`getExportsOfModule`). It follows `export *` too
- With the `dist` from before the fix (`3bf3e34`), `greetableBuilder`, which contains `/*elided*/`, failed on all 3 lines.
  `/*elided*/ any` changes an export's type, so the round trip replaced the string search

**It compares by identity, so two types that mean the same but print differently fail.** When it was added, `byTag`, `circle` and `variantDone` failed.
The `.d.ts` expands and prints unexported aliases (`ByTag`, `Frame`, `VariantSupplied`). Expanding them resolves
`keyof VariantsOf<Shape>` to `"Circle" | "Rect"` and drops the `& {}` from `{…} & {}`. The three are now exported, so they
print by name (`valof/internal/enum`, §18.4). The fixtures' declarations went from 36.8 kB to 33.8 kB, and `index.d.ts`
grew by 0.02 kB.

**Rejected: an exclusion list for exports that do not round-trip.** It would hide an export whose type collapses to `any`. For valof's types,
exporting them so they print by name fixes it.

**The scripts do not round-trip. They search for `/*elided*/` as a string.** Classes that extend `ErrorFactory(…)`, and types that reference them, fail
(20 of 34). The base type is a conditional type alias (`ErrorInstance<…>`), and the `.d.ts` prints it resolved. An alias from another
package cannot be made to print by name.

**What does not round-trip.** An enum, a `unique symbol` and a class with private members are not identical once the `.d.ts` redeclares them
(probed on 5.9 / 7.0). The current book and fixtures have none. When one appears, add a way to compare it.

**Cost.** ts-compatibility went from 4.4 s to 9.1 s (locally). The round-trip tsc takes 2.4 s per line on 5.9, and
1.1 s on 7.0. Most of it is comparing the enum builder. `variantStart` alone takes 620,000 instantiations.

**The lines run in parallel.** Each line writes to `dts/<alias>` and `round-trip/<alias>`, and the report comes out in the order of `aliases`. 9.1 s
became 5.2 s. Nothing checks that each line reads its own output. Every known way to break it fails all 3 lines at once, so
reading another line's `.d.ts` would still pass.
