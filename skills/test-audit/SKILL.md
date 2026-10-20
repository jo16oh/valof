---
name: test-audit
description:
  Audit what each test guarantees. It reports tests to delete or merge, behaviour changed with no
  test covering it, and tests that cannot fail. Run it every time a test is written or changed.
---

# Test audit

One pass over the tests, separate from writing them. Report findings; apply them only on a go-ahead.

The question every finding answers: **which realistic bug reaches a user if this test is gone?** A
test that answers nothing costs run time, flakiness and edits on every refactor, and buys nothing.
Test count and coverage percentage are not the goal.

## Scope

The working tree by default, untracked files included. The user can name a file or `all` for the
whole suite.

## Run it in a separate agent

The agent that wrote the tests is the worst judge of them, so another agent runs the audit. It runs
on the same model as the session that launches it: every finding is a judgment call, so pass no
model override and never a cheaper model.

Give it the three passes below, the scope, and the diff. It reads the tests and the source they
cover, runs the mutation checks, and returns the report. The test bodies stay out of the launching
session that way.

For `all`, launch one agent per directory (`tests/`, `tests/lint/`, `docs/tools/`) so no agent reads
the whole suite.

In Claude Code that is the `general-purpose` agent, which inherits the parent model on its own.
Other harnesses name their own agents, so check that the one you pick runs on the parent's model.

## Audit only the change since the last audit

Each audit of the default scope leaves a record per branch in the git directory:

```sh
dir="$(git rev-parse --git-common-dir)/test-audit/$(git branch --show-current)"
```

`$dir/tree` holds the hash of the working tree the audit read, and `$dir/report.md` its report. On a
detached HEAD, skip the record.

`state.sh` next to this file computes the hashes. In Claude Code, a Stop hook runs `state.sh check`,
and blocks the end of a turn while a test has changed since the last audit.

1. Before launching the agent, take the hash of the working tree.

   ```sh
   skills/test-audit/state.sh tree
   ```

2. The scope is the change since the base: the recorded tree, or `HEAD` with no record or with a
   tree that `git gc` removed.

   ```sh
   git diff "$(skills/test-audit/state.sh base)" <hash from step 1>
   ```

   With a record, pass the agent `$dir/report.md` too. It checks whether each earlier finding was
   applied or is still open, lists the open ones in its report, then runs the three passes over the
   new diff. Pass 1 still searches the whole suite for duplicates.

3. After the agent reports, write the hash from step 1 to `$dir/tree` and the report to
   `$dir/report.md`.

## Pass 1: cuts

Flag a test that is any of these, and say which bug its deletion lets through:

- **A copy of the implementation.** It restates the source instead of fixing a result.
- **A mock checked against itself.** The assertion reads the mock, not the code under test.
- **A guarantee TypeScript or a dependency already gives.** `expectTypeOf` on a type the test file
  annotated itself proves nothing.
- **A duplicate.** Another test already fails on the same bug. Say which one.
- **Coupled to internals.** It breaks on a refactor that keeps the behaviour.
- **One case of many.** Cases that fail together buy one guarantee. Keep the boundary and one
  representative, cut the rest, or merge them into a table. Even when cases fail together, do not
  merge concerns that are distinct to the user into one test. `n?`, `n = 0` and a trailing
  `n: T | void` are one optional parameter to the checker, and three different forms in user code.

Propose a merge where two tests share setup and check related behaviour.

"Just in case" is not a reason to keep a test. Neither is a name that sounds important.

## Pass 2: gaps

For every behaviour the diff changes, say which test fails when the change is reverted. No such test
is a gap. Report it with the input and the expected result, not with a test name to add.

Check the error paths too: the throw, the `Err` branch, the lint diagnostic. They go untested more
often than the success path.

## Pass 3: liars

A test that passes whatever the source does. Break the source it covers, run it, and confirm it goes
red:

```sh
vp test tests/val.test.ts
```

What to look for first:

- An assertion on a value the call under test produced, compared against itself.
- `toBeDefined`, `toBeTruthy`, or `toThrow()` with no matcher: any throw passes, including the wrong
  one.
- A promise not awaited, so the assertion runs after the test ends.
- `try`/`catch` that swallows the failure.
- `.skip`, `.only` or `.todo` still in the file.
- A snapshot committed without reading it.

## Report

One line per finding: `file:line`, what it is, and what deleting it would let through. Group by
pass, and cuts before gaps. End with the totals: tests read, cuts proposed, gaps, liars.
