# 19. Pinning the valof the scripts use, 2026-10-25

**`#valof` resolves to a build of the commit that `valof-pinned-for-scripts-commit` in
`package.json` points at.** bundle-size and the other scripts are written with valof. Before, it
pointed at `valof-release` (0.9.1 on npm), and the scripts caught up only after a release.

```json
"imports": { "#valof": "valof-pinned-for-scripts" },
"devDependencies": {
  "valof-pinned-for-scripts": "link:node_modules/.valof-pinned-for-scripts"
},
"valof-pinned-for-scripts-commit": "<sha>"
```

- After `vp install`, `prepare` runs `scripts/pin-valof/index.ts`. It extracts the pinned commit with
  `git archive`, runs `tsc -p tsconfig.build.json`, and puts `dist` and `package.json` at the link
  target. It skips all this when the sha is unchanged. It runs `git fetch --depth=1` for a commit
  not present locally (the CI checkout has only one commit)
- **Only tsc builds the pin, 2026-11-11.** `prepare` ran `vp run build` before. The upgrade to
  vite-plus 1.5.1 broke CI. The working tree's `vp` read the pinned commit's `vite.config.ts`, which
  sets `dts.tsgo: true`, and 1.5.1 no longer parses that option. The scripts import only the root
  entry, which tsc emits. The `vp pack` step in `vp run build` packs only the linter, which the
  scripts never needed
- `vp run pin-valof <rev>` moves the pin. The lockfile records only the link path, so moving the pin
  leaves the lockfile unchanged
- The pin exists for local work in progress. Even with a half-written, broken `src`, the scripts run on
  the pinned valof

**A diff of the build inputs between the pin and the working tree decides whether they match.**

```sh
git diff --quiet "$pin" -- src tsconfig.json tsconfig.build.json
```

- Compare with the working tree, not HEAD. `dist` is built from the working tree. On CI the two are
  the same
- Include `tsconfig.json`. `tsconfig.build.json` extends it, and options such as `target` affect the
  output
- Leave out `package.json`. It holds the pin's hash, and changes with the version bump at release
  too. valof has no runtime dependencies, so leaving it out misses nothing
- Leave out `vite.config.ts` (since 2026-11-11). Its `pack` section configures only the linter's
  build, and the pin no longer builds the linter

**ts-compatibility reads the scripts as fixtures only when they match.** It runs the scripts that
import `#valof` through type checking and declaration output on each line. When they do not match, it
only logs that it skipped them, without failing. Only a release PR (`chore/release-*`) requires the
match, with `--require-pin`. That makes the scripts catch up before the release.

- Copy the scripts into a work directory, with a `package.json` of
  `{"imports": {"#valof": "valof"}}`. `#valof` resolves through `exports` to `node_modules/valof` in
  the work directory. The work directory is inside the repository, so devDependencies such as
  rolldown resolve by walking up the parents
- The tsconfig extends the scripts' one (`nodenext`). Together with `bundler` for the book's blocks,
  this covers two resolution modes
- `*.test.ts` is not copied. `vp test` would pick up the tests in the work directory too

**Lint is out of scope.** Lint is part of the valof package and imports `src` by relative path.
`vp check` type-checks it against the current `src`.

**The hash goes in a custom field of `package.json`.** pnpm's `optimisticRepeatInstall` skips
`prepare` when neither the lockfile nor `package.json` changed. With the hash in a file under
`scripts/`, a pull or a branch switch could change the hash while `vp install` judges everything up
to date, and `vp check` would run against the old pin. `optimisticRepeatInstall: false` would run it every
time, but install goes from 0.16 s to 1.1 s. The cost is that the hash ships in the npm tarball.

**The name includes `pinned` and `for-scripts`.** This pin is what every `#valof` resolves to, in
`vp check` and bundle-size as well as ts-compatibility. `pinned` says that the scripts run on a valof
other than the current `src`.

### Rejected options

- **A git dependency (`github:jo16oh/valof#<sha>`)**: `dist` is not committed, so every install
  needs a build. `prepare` runs only `vp config` and does not build. It would also need the full set
  of devDependencies, and permission in pnpm 11's `allowBuilds`
- **Publish each commit with pkg.pr.new**: CI does not need a build of the pin (when they match, it
  is the same as the current `dist`), so publishing has no point
- **Check that "the PR's last commit rewrites the pin to the previous hash"**: replaced by the
  `git diff` check. The `git diff` check passes even with docs-only or test-only commits stacked after the pin, and
  does not force a rewrite commit on a PR that does not affect the build
- **Do not pin, and always point `#valof` at the current build**: every PR that changes the API
  would have to update the scripts. When `src` is broken mid-work, the scripts would not run either
- **Require the match on every PR**: every PR that changes the API would have to update the scripts.
  Before a release is enough
- **ts-compatibility reads the scripts in place**: `#valof` goes through `imports` in the root
  `package.json` and resolves to the pin. Pointing it at the work directory's `dist` would need
  `paths` or a conditional `imports`. `paths` bypasses `exports`, and was hiding the problem in §18.4
- **Check out the pin with `git worktree`**: the worktree registration needs cleanup. Extracting into a
  temporary directory with `git archive` is enough

### API friction found while updating the scripts

`report.bundles.filter(BundleSize.over)` tripped oxlint's `no-unnecessary-condition`. Lint looks at
the return value of the member's data-last form (a function, so always truthy). TypeScript accepts
it, so users notice only once they add the linter. The scripts wrapped it as
`(size) => BundleSize.over(size)`. → On 2026-10-27, the data-last form was removed from members that
take only a value (§6.11). The scripts can drop the wrapper at the next `pin-valof`.
