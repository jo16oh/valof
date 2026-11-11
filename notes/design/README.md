# valof Design Memo

The design record of a value object library for TypeScript.

- **Package name**: `valof`
- **Main export**: `Val` (type + namespace)

```ts
import { Val } from "valof";
```

## Contents

Each file reads on its own. Open only the ones you need. A `§` number refers to a section. The list below links each section to its file.

An alternative never adopted is recorded under a heading, or in a bold lead-in, that starts with `Rejected` (after the section number, if it has one). A design adopted and later removed has a heading that ends with `Withdrawn <date>`. This command lists both:

```sh
grep -rnE '^#+ .*(Rejected|Withdrawn)|^ *(- )?\*\*(Rejected|Withdrawn)' notes/design
```

- **§1 Design philosophy** ([01-philosophy.md](01-philosophy.md)) "Values are plain data. Behavior lives outside them." The basis for every other decision. The per-call cost of making members dual
- **§2 Basic API** ([02-basic-api.md](02-basic-api.md)) `Val.companion` / `.seal` / `.impl`. 2.1 why the brand is a phantom string (the record of rejecting symbol and a function type that a boundary strips; the key went back to symbol on 2026-10-26), 2.2 `Val.of` is not an escape hatch
- **§3 Allowed types** ([03-allowed-types.md](03-allowed-types.md)) Primitive / Val / ReadonlyArray / Record only. Why a payload does not use `readonly`, 3.5 why `undefined` is forbidden as a value, and the EOPT wall, 3.6 why unions of objects are forbidden, 3.7 self-reference with `Rec`
- **§4 DeepReadonly** ([04-deep-readonly.md](04-deep-readonly.md))
  - **4.1** Why the constructor copies its argument by default, and the explicit `.nocopy`. Neither types nor lint can close the gap (no linear types), ownership tracking (WeakSet, registering every node), the rejected symbol-key mark, diamonds and GC, the friction of `unwrap`, the type-checking speed benchmark
  - **4.2** Keep tuples. Optional elements and `Required<T>`, the limit of rest elements
  - **4.3** Open `Rec`. Detection by key, `undefined` on optional keys, why array detection moved to `keyof`
- **§5 Equality** ([05-equality.md](05-equality.md)) A named `equals` that compares structure only. The principle of constructing in canonical form. The record of the withdrawn companion `equals`, `implEquals` and spec
- **§6 Smart constructors and updates**
  - **6.1–6.10** ([06-constructors-and-updates.md](06-constructors-and-updates.md))
    - **6.1** A constructor is determined by its origin / **6.2** `patch`, `undefined` in a patch, patch at any depth, merging only into nodes that already exist / **6.3** independent of Result / **6.4** remove `update`
    - **6.5** contextual typing that fixes `.impl`'s first parameter to the Val / **6.6** do not let `patch` be overridden
    - **6.7** separate seal (idempotent) from create (construction); seal returns synchronously / **6.8** make seal the only gate. Copies per path
    - **6.9** how the name became `seal` / **6.10** `fixed` (moved to the `Unpatchable` type argument on 2026-10-22, §6.12) and the excess property check
  - **6.11** ([06.11-dual-members.md](06.11-dual-members.md)) make members dual, data-first / data-last. Telling the forms apart by argument count, forbidding optional parameters, in development, reading the source for the defaults and rest parameters that type annotations hide (2026-10-28), the wrapper for rest versions, why `dyn` is not wrapped, why data-last loses type arguments, the rejected `annotate`, the rejected namespace and placeholder
  - **6.12** ([06.12-seal-entry-point.md](06.12-seal-entry-point.md)) unify the entry point on `.seal`. Dropping `sealer`, why no step hides seal, the type argument list (`PrivateSeal` and `Unpatchable`, a tuple rather than an intersection), the first and second halves of the chain, `impl` does not close the chain, `.build()` closes the chain (overturning §13.6), keeping the Proxy. The order of Enum steps is in §15.2
  - **6.13** ([06.13-impl-assoc.md](06.13-impl-assoc.md)) `implAssoc`: members that do not take the Val. Why it is a separate step, what it is given, making it dual (overturning §6.11), why checking the arguments needs a return type annotation, the check that reads the source of length-0 functions (moved into §6.11's check on 2026-10-28), Trait associated functions kept out of `[Shared]`, adding `& A` to `build` breaks declaration emit, the remaining hole (write the check in `from*`), rejected ideas
- **§7 Deferred** ([07-deferred.md](07-deferred.md)) freeze (adopted in dev only), Map/Set, Date/Temporal, TaggedEnum, Result, dispatching equals, putting the wiring target on `.impl`, bigint (removed on 2026-10-28, the rejected "keep it" option, the JSON round-trip hole that is not guaranteed)
- **§8 Idioms** ([08-idioms.md](08-idioms.md)) Set/Map via Record, dates, using a schema library alongside, fields excluded from the update path, framework state containers (§8.5, not reproduced in dev), integers above 2^53 (§8.6, decimal integer strings)
- **§9 Open / to verify** ([09-open-questions.md](09-open-questions.md)) The next work is here
- **§10 v1 scope** ([10-v1-scope.md](10-v1-scope.md)) 10.1 supported TypeScript (the last release of each line onward, checking `dist` installed the way npm installs it, through `exports`, declaration round-trips)
- **§11 Where to surface type errors** ([11-type-error-placement.md](11-type-error-placement.md)) The parameter position (A) and the verdict position (B, `Verdict`). A check that reads only type arguments goes in B; a check that reads the call site's state goes in A. Three bugs that placed the check in neither
- **§12 Naming** ([12-naming.md](12-naming.md)) The package name `valof`, the type name `Val`, the trademark search
- **§13 Deciding the API shape** ([13-api-shape.md](13-api-shape.md)) Six rejected designs before two-step currying (the builder in §13.6 was adopted on 2026-10-23)
- **§14 valof-lint** Companion members are invisible to static analysis. Syntactic tracking of Trait declarations, implementations and `dyn` is in §15.1
  - **14.1–14.7** ([14-lint.md](14-lint.md)) Choosing the parser, the decision to bundle it, the rejected ts-morph (§14.5), the rule for children with a custom equals (§14.7, withdrawn)
  - **14.8** ([14.8-rule-representation.md](14.8-rule-representation.md)) how rules are expressed and organized
  - **14.9** ([14.9-editor-integration.md](14.9-editor-integration.md)) editor integration, implemented up to the overlay
  - **14.10–14.11** ([14.10-tests.md](14.10-tests.md)) the holes in the tests (§14.10), where the tests live (§14.11)
  - **14.12–14.18, 14.21–14.27** ([14.12-rules.md](14.12-rules.md)) a brand that does not match the type name (§14.12), the spelling of `Val` (§14.13), missing disable comments (§14.14), ineffective disable comments (§14.15), file-wide disable (§14.16), rules that do not accept `--no-` (§14.17), how rules about directives are presented (§14.18), a companion that does not match the type name (§14.21), a companion in a different file from its type (§14.22), `Val.of` on a type with a companion (§14.23), `Val.of` without a type argument (§14.24), a second name for a Val / Trait (§14.25), the rejected rule for a `Rec` that is not self-referencing (§14.26), `unused-member` and the names the types reject (§14.27, lint names tied to the types, the withdrawn `impl` prefix match)
  - **14.19–14.20** ([14.19-oxlint.md](14.19-oxlint.md)) the oxlint version and the canonical config, the `no-unsafe-*` rules not added (§14.19), host integration tests over LSP (§14.20, withdrawn)
- **§15 v2 candidates**
  - **15.1 `Trait`** ([15.1-trait.md](15.1-trait.md)) The `Final<F>` marker and a one-step `impl`, intersecting trait brands and a `|` removed by type arguments alone (the rejected tuple), the `Self` marker and the ban on returning it, `Self` only as the first parameter (2026-11-03, the dropped "report `Payload` in a member's parameters through the trait"), `Impl` (2026-11-04, separating the declaration's type from the value's type, the rejected marker interface), `dyn` (the equivalent of `Box<dyn Trait>`), the rejected WeakMap dispatch, demand and the rejected shape that lets `dyn` be dropped, the experimental subpath (the rejected per-feature subpath, removed on 2026-10-27), the callback form of `impl` (its argument is only the implemented finals, the rejected implementer-side companion), removing the form that passes a Trait as a type argument, Vals bring a shape too (the conflict check, stripping `readonly`, the declaration bundler and backticks)
  - **15.2 `Enum`** ([15.2-enum.md](15.2-enum.md)) Revisiting §7.4. Declaring Variants in a record and deriving the union, deriving the brand, a custom tag name and `tag-mismatch`, `match` on the companion, the line between `match` and ts-pattern, the record of verifying the types (common fields, `match`'s type arguments, how `VariantOf` displays, the rejected return type argument, free-function `match` and record of Vals, implementing Traits, passing the tag name as `Tag<…>`, a top-level conditional type breaks declaration emit), what the implementation taught (where Fault lives, forbidding a single Variant, removing `then` in three places, CI for declaration emit, variance measurement and type cost), the per-Variant seal and the union's `seal` (splitting into two entry points (merged into one on 2026-10-21, §6.12), passing the builder as a callback, closing the chain with `impl`, the rejected value shape), making `seal`'s arguments exclusive, `[Tag].match` and `[Tag].key`, which branch on the tag alone (why the key is a string (a symbol since 2026-10-26, §2.1), rejected names), making `implVariant` a per-Variant chain, making Variant steps a frame, rejecting four ways to change how the tag name is passed, the form that does not pass the companion (sharing val.ts's gate, distributing `PayloadKeys`, tests for both entry points), `.impl` cannot take a Trait member's name (the rejected per-Variant override), `_` in `match` (a conditional type rather than a union, the rejected key name `default`, third argument and overloads), building with a single chain (2026-10-24, removing `implVariant` and the seal layer, the enum's `implSeal` and `implCreate` as entry points to `Shape.seal`, why the enum's steps come last, why the tag is not checked at runtime, per-variant traits, the `VariantOptions` type argument, the `.tag` step, reserved names, writing a variant's steps together (2026-11-11)), dropping reserved names (2026-10-26, callable slots, `Otherwise`, revisiting where `match` lives, not guarding `__proto__` either)
  - **15.3 `path`** ([15.3-path.md](15.3-path.md)) Composing patches across seals. The decision to put `abort` on the composing side, why the handler is the last step (HKT), `glue`'s `open` / `close`, `each` / `where`, the rejected `deepPatch`
  - **15.4 Callback form of `.impl`** ([15.4-impl-callback.md](15.4-impl-callback.md)) Referencing its own companion breaks inference (TS7022). Measuring that contextual typing works through a callback, `implTrait` takes a callback too, budgets, the rejected currying of members and the idea of blocking downstream `.impl` with types. **The chain closed on 2026-09-18** (`impl` stopped closing it on 2026-10-21, §6.12) (only once, siblings called through annotations, naming the receiver of a Trait implementation `Tr`, the rejected type-level guidance and lint rule). **On 2026-10-26, every step argument became a function** (the annotation tax does not change)
- **§16 Budget responsibilities** ([16-budgets.md](16-budgets.md)) Splitting bundle and type budgets into separate scripts. Moving declaration bytes to type-perf, why the budget went up to 64 kB, 16.1 measuring the bundle increment from the measured core, 16.2 the production check compares sizes, 16.3 trimming Enum's production gzip (shared steps, the rejected +512 B budget)
- **§17 Effect v4 investigation** ([17-effect-v4.md](17-effect-v4.md)) The typeclass and HKT layers Effect dropped (the basis for §15.3), placing equality inside the value, the hole that structural comparison of classes opens, what Effect has and valof does not
- **§18 Distribution shape** ([18-package-shape.md](18-package-shape.md)) Making `Val` / `Enum` / `Trait` namespaces so tree shaking drops unused members. Exporting under the same name as the type, why tsc emits the runtime entry file by file (Rolldown's `__exportAll` and type names in `.d.ts`), the bundle-size base, raising the declaration budget to 96 kB. The rejected `.ts` distribution and `.d.ts` minification. 18.4 the `internal/*` that consumers' declaration emit references (the rejected export from the entry, `PrivateSeal` / `PrivateCreate` made into classes), 18.5 keeping declaration emit from cutting types to `any` (builders printed by name, the decision to keep TypeScript 7.1 out of the ts-compatibility lines)
- **§19 Pinning the valof the scripts use** ([19-pinning-valof.md](19-pinning-valof.md)) Pointing `#valof` at a commit's build. How a match is detected, requiring a match only on the release PR, ts-compatibility copying the scripts and reading them, why the hash goes in `package.json` (`optimisticRepeatInstall`), the rejected git dependency, pkg.pr.new and reading in place. The dual members and lint issues found while updating the scripts

## Code to memo

Before changing the code on the left, read the sections on the right. A path matches every row it starts with.

| Code                                                              | Sections                   |
| ----------------------------------------------------------------- | -------------------------- |
| `src/val.ts`, `src/ns/val.ts`                                     | §2–6, §11                  |
| `src/keys.ts`                                                     | §2.1, §11                  |
| `src/env.ts`                                                      | §6.11, §7.1                |
| `src/dual/`                                                       | §6.11, §6.13               |
| `src/trait.ts`, `src/ns/trait.ts`                                 | §15.1, §15.4               |
| `src/enum.ts`, `src/ns/enum.ts`                                   | §15.2                      |
| `src/index.ts`                                                    | §18                        |
| `src/lint/`                                                       | §14.1–14.7                 |
| `src/lint/rules/`, `src/lint/scan/`                               | §14.8, §14.12–14.27, §15.1 |
| `src/lint/eslint-plugin/`                                         | §14.9, §14.19–14.20        |
| `tests/lint/`                                                     | §14.10–14.11               |
| `scripts/bundle-size/`, `scripts/type-perf/`                      | §16, §18                   |
| `scripts/ts-compatibility/`, `scripts/shared/typescript-lines.ts` | §10.1, §18.5               |
| `scripts/pin-valof/`                                              | §19                        |

A lint rule still being planned is in §9.
