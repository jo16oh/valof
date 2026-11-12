# 16. Who owns which budget, 2026-09-10

**Bundle and types are separate concerns.** The script was split in two.

|                      | Measures                                                   | Kind                                |
| -------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `vp run bundle-size` | gzip of `dist/index.mjs`, for `Val` alone and with `Trait` | **Ratchet**. The bytes a user ships |
| `vp run type-perf`   | instantiations and the byte count of `dist/index.d.mts`    | **Alarm**                           |

`types raw` used to be in `scripts/size.ts`, but it is not a bundle. Not one byte of it enters a
user's bundle. It costs download and parse time, and the type checker does the parsing, so it
belongs in type-perf.

**The budget goes from 32 to 64 kB.** At 32 kB it worked as a ratchet, the exact shape type-perf's
docstring forbids.

> **This is an alarm for a blow-up, not a ratchet for creep.** A budget tight enough to catch
> [creep] has to be re-baselined on every change, and stops meaning anything.

It had done real harm. In the two cases in §15.1, we cut JSDoc twice to save bytes. That traded
explanation for bytes, the wrong way round. And in §9, both `path` (§15.3) and the callback form of
`.impl` (§15.4) were on hold as "measure before writing it", citing this budget. **It was blocking
design, not catching bugs.**

At 64 kB, Enum and path together still stay under it. What we want to catch is a multiplying
accident, and §14 has an example. Deriving `Finding` from `RULES` pulled in the rules' whole type
graph, and `dist/lint/index.d.mts` grew to 14.9 kB. That kind of accident is shallow and wide, so it
barely shows in instantiations, and the byte count catches it better. That is why the byte budget
stays.

**Time is not a budget.** It varies with the environment, so runs cannot be compared. type-perf
budgets only deterministic numbers, and prints `check (s)` and `total (s)` without checking them.
Byte counts are deterministic too, so they can be treated the same way. That is also why `types raw`
could move to type-perf.

**The `Trait` budget is written as an increment.** It went from 1600 B to `1280 + 256`. 1600 was
only a second rounded number. The budget should state "what someone who imports `Trait` pays extra".
Written this way, the relation holds when the core budget moves. The measured increment is 95 B
(1,147 → 1,242 B), nearly 3x headroom.

**The code had `+ 128`.** Fixed to `+ 256` on 2026-09-15. The decision was 0.25 kB, and "nearly 3x
headroom" in the same section matches 256 too (128 would give only 1.35x). The JSDoc in
`bundle-size.ts` said "a quarter of a kB" from the start. Only the constant disagreed.

**2026-09-15, measured again after merging main.** Removing `update` (#33) and replacing custom
equality with `equals` (#36) shrank the core, so the absolute numbers above moved. The increment
barely changed.

|                       | Before merge | After merge |
| --------------------- | ------------ | ----------- |
| `Val` production gzip | 1,147 B      | 710 B       |
| `Val` + `Trait`       | 1,242 B      | 804 B       |
| Increment             | 95 B         | 94 B        |
| core instantiations   | 9,632        | 5,674       |
| trait instantiations  | 12,514       | 12,727      |
| `index.d.mts`         | 31.4 kB      | 30.4 kB     |

**The tightest budget now is `trait` instantiations:** 12,727 / 15,000, 15% left. When Enum and path
arrive, this is the number they hit, not the declaration byte count. It is more than twice core's
5,674, but the two fixtures have different histories, so they cannot be compared (§16).

`index.d.mts` is measured the same way after the entries were split. The entry file itself is two
re-export lines, only 323 B, and the contents live in a shared chunk, so type-perf follows the
imports and sums them.

## 16.1 Measure increments from the measured core, 2026-10-15

**Writing `1024 + 256` did not keep the relation when the measured core grew.** Each entry's
measurement was compared with "the core budget + the increment", so each entry passed by borrowing
the headroom left in the core budget.

|            | Measured | Budget     | Increment over core | Nominal increment |
| ---------- | -------- | ---------- | ------------------- | ----------------- |
| `Val`      | 896 B    | 1024       |                     |                   |
| + `equals` | 1,083 B  | 1024 + 128 | **+187**            | +128              |
| + `Trait`  | 978 B    | 1024 + 256 | +82                 | +256              |
| + `Enum`   | 1,370 B  | 1024 + 384 | **+474**            | +384              |
| Everything | 1,633 B  | 1024 + 640 | **+737**            | +640              |

`.implCreate.noseal` (#65) grew the core by 44 B, leaving 31 B of headroom for everything and 38 B
for `Enum`. Every byte the core grows takes a byte from the headroom for everything. That contradicts
§16's "the relation holds when the core budget moves".

- **Compare only the core with its measurement.** For the others, compare
  `entry measured - core measured` with the increment budget. Only the core budget stops core
  budget alone
- **The increments were set again:** `equals` +256, `Trait` +256 (unchanged), `Enum` +640, everything
  +1024. Each has at least 26% headroom
- **The budget table prints the increment:** `added by Enum  +474 B / +640 B`

**Rejected: keep the mechanism and only raise the numbers.** That meant `Enum` at +512 and
everything at +768. Each time the core grows, they get tight again.

**Rejected: set `Enum` to +512.** It is a round number, but it leaves 38 B (7%), no better than
before the fix. `match`'s `_` adds runtime code, so that PR would have to raise it again.

## 16.2 The production check compares sizes, 2026-10-15

**The old check searched for strings.** It checked that the production core kept none of three
development strings such as `snapshotSealInput`, and that a bundle without `equals` kept no
`Number.isNaN`. When a function name or message changed, the check silently stopped working, and it
ignored new development code until someone added it to the list.

**`Number.isNaN` was not a marker for `equals`.** With `development` fixed to `true`, the check
reported "equals is still there" for a core that does not import `equals`. The development code uses
`Number.isNaN` too.

Now both checks compare sizes, with no dependence on a specific name or string.

| Check              | Fails when                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DevCodeKeptError` | The bundled source reads `NODE_ENV`, yet the production and development builds have the same minified size     |
| `AddsNothingError` | A bundle stacked on the base has a library part as long as the base's. The added import is already in the base |

§16.4 made both problem lines of the size report, in place of these errors.

- **Measure the library part as "chunk length - the entry's `renderedLength`".** The entry passes the
  imported names to `console.log`, so the whole bundles always differ by those names. Each module's
  `renderedLength` is its length before tree-shaking, and was 13,923 with and without `equals`. It
  is unusable
- **Check whether the source reads `NODE_ENV` before `define` replaces it.** It does not survive in
  the built code

We broke things on purpose to confirm it.

| How it was broken                                                      | Result                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Reference `equals` at the top level of `src/val.ts`, leaking into core | `AddsNothingError`                                    |
| Disable `define`, so both modes produce the same code                  | `DevCodeKeptError`                                    |
| Fix `development` to `true`                                            | The check passes. The source does not read `NODE_ENV` |

**What it misses: part of a development branch left in production.** If one check is missing its
`development` guard, the other branches are still removed, so the sizes still differ. The budget
catches only a leak larger than the core's headroom. With `development` fixed to `true`, the core
grew from 896 B to 1.65 kB, 670 B over budget.

**Rejected: drop the checks and rely on the budget.** The budget catches a leak larger than the
core's 128 B of headroom. Measured, the development code is about +790 B and `equals` +187 B. But
`equals` is only 59 B over the headroom, so raising the core budget by 60 B with no core growth would
let it through. The size comparison does not depend on the headroom.

**Names match the check's scope, 2026-10-16.** `BranchIgnoredError` became `DevCodeKeptError`. The
old name did not say which branch was ignored, or by what.

- **Rejected: `TreeShakingError`.** Tree-shaking removes unused exports and modules. Removing an `if`
  branch is dead code elimination, a different stage
- **Rejected: `DeadCodeEliminationError`.** This check looks only at development branches, not at
  dead code in general. The name is broader than what the check guarantees

## 16.3 Trimming Enum's production gzip, 2026-10-26

**After #92, Enum's increment was +628 B, leaving 12 B of the +640 B budget.** The budget stayed, and
the runtime code was trimmed.

|            | Before | After  | Budget   |
| ---------- | ------ | ------ | -------- |
| `Val`      | 886 B  | 899 B  | 1.00 kB  |
| + `Trait`  | +105 B | +101 B | +256 B   |
| + `Enum`   | +628 B | +465 B | +640 B   |
| Everything | +902 B | +735 B | +1.00 kB |

- **Share the steps.** `steps` in `val.ts` builds everything from `implSeal` to `implTrait`, and
  three places use it: the Val builder, the enum steps and the variant steps. The Val builder's state
  is gathered into one `Registered`, which `attach` receives. Val +20 B, Enum's increment -109 B
- **The variant frame calls `attach` directly.** Before, `frame` called the `Val.companion` chain one
  step at a time. Enum's increment -52 B more
- **`assemble` calls `duals` once.** -3 B
- **Share `isObject`.** Five object checks in `val.ts`, `isObjectShaped`, and Trait's `dyn`. Val
  -3 B, Trait's increment -10 B
- **Attach members by assignment.** Val -4 B. A member named `["__proto__"]` is not protected (§15.2 "Remove the reserved names")

Val grew by 13 B. Users who use neither Enum nor Trait pay it, in exchange for the maintainability of
defining the steps in one place (the user's decision).

**Rejected options.** The numbers are production gzip, measured on prototypes made by editing the
bundle by hand.

- **Do not share the steps, and only have the frame call `attach` directly.** Val -3 B, Enum's
  increment -50 B. Val does not grow, but Enum is left with only 62 B (10%)
- **Spread inside `steps`.** Val 912 B, 6 B heavier than the adopted form
- **Share trait composition between `attach` and `assemble`.** +5 B
- **Merge the two member loops in `attach` into one.** Smaller after minify, but Val +4 B in gzip
- **Attach members with `Object.assign(target, duals({ ...traits, ...members }))`.** Val +10 B,
  everything -7 B. We took the assignment loop, which shrinks Val
- **Have Trait's `companion` `build` go through `impl`.** +3 B

**Rejected: lower Enum's budget to +512 B.** That leaves 51 B (10%), below §16.1's "each has at
least 26% headroom". The other reason §16.1 rejected +512 (`match`'s `_`) went away in #91, but the
headroom criterion remains.

## 16.4 One command checks `dist`, 2026-11-03

`vp run check-dist` replaces `bundle-size`, `replace-bundle-size-claims`, `type-perf` and
`ts-compatibility`. §16's split, by what is measured and by the kind of budget, stays. Each check has
its own module (`scripts/check-dist/checks/{size,types,compat}`) and its own budgets. Only the entry
point and the build are shared.

- **The entry point builds `dist` once.** Before, each of the three scripts ran `vp run build`, and
  the claims script ran bundle-size again in a child process. The claim update now uses the size
  check's measurements directly
- **Flags.** `--size`, `--types` and `--compat` select checks. With none, all three run.
  `--release` adds `README.md` and `package.json` to the files whose claims are checked, and
  requires the scripts' `#valof` pin to match (§19). `--write` rewrites the claims. `--write`
  without the size check fails, and so does an unknown flag (`parseArgs` with `strict`)
- **The declaration round-trip (#118) and the search for `/*elided*/` (#116) moved** from
  `scripts/ts-compatibility/` to `scripts/check-dist/checks/compat/`. The TypeScript lines still
  run in parallel
- **Every check runs even after one fails.** Then a summary prints pass or fail for each. With one
  CI step, the summary still shows which check failed
- **Each check returns a report, and `runChecks` prints it.** A `Report` renders what the check
  found, and `passed()` says whether the check passed. A report that did not pass ends with the
  problems: each budget a bundle is over, a production build that keeps development code, a bundle
  that adds nothing to the base, each stale claim, or the TypeScript lines that failed. The two size
  problems are §16.2's checks, which were the errors `DevCodeKeptError` and `AddsNothingError`
  before. So `runChecks` still prints the table of a bundle over budget. `Check.run` fails only
  where the check stops before it has a report: a build that fails, a types fixture that does not
  compile, a stale pin under `--release`, or a file that does not state the size exactly once. The
  cost is that compat's report prints only after every TypeScript line finishes
- **Rejected: a `verdict` that fails with an error.** `CheckError` then held both a problem the
  check found and an error that stopped the check, so the type did not say which one a failure was
- **Rejected: printing inside each check.** It printed compat's counts before the TypeScript lines
  ran. But no test could read the output, and each check had to order its `console.log` calls
  before returning a failure, by hand
- **CI tests whether a PR is a release in one place.** Before, two `if`s tested
  `startsWith(github.head_ref, 'chore/release-')`, one for the claim files and one for
  `--require-pin`. Now the `RELEASE` environment variable only turns on `--release`
- **The release workflow runs `--release` too,** so it now requires the pin to match. CI on the
  release PR requires the match, and the `main-ci` ruleset (strict required checks) blocks merging a
  PR that is behind main. A squash merge produces the tree CI checked, so the pin still matches after
  the merge (verified 2026-11-07)
- **Rejected: `--json`.** Its only reader was the claims script, and the claim update now calls the
  size check directly. `Bundle.key` was removed with it
- **The name.** All three check the built `dist` from a user's side
- **Rejected: `bundlecheck`.** It reads as size alone
- **Rejected: `budget` and `measure`.** They do not fit compat, which only passes or fails
- **Rejected: `dist:verify` and `dist:test`.** Only `docs:*` uses a colon in a script name, and
  `test` reads as `vp test`
