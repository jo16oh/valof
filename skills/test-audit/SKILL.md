---
name: test-audit
description:
  Audit what each test guarantees. It reports tests to delete or merge, behaviour changed with no
  test covering it, and tests that cannot fail. Run it after writing or changing any test, before
  proposing a commit.
---

# Test audit

One pass over the tests, separate from writing them. Report findings; apply them only on a go-ahead.

The question every finding answers: **which realistic bug reaches a user if this test is gone?** A
test that answers nothing costs run time, flakiness and edits on every refactor, and buys nothing.
Test count and coverage percentage are not the goal.

## Scope

Staged changes by default:

```sh
git diff --cached --stat
git diff --cached
```

Nothing staged, read `git diff HEAD` instead. The user can name a file or `all` for the whole suite.

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

## Pass 1: cuts

Flag a test that is any of these, and say which bug its deletion lets through:

- **A copy of the implementation.** It restates the source instead of fixing a result.
- **A mock checked against itself.** The assertion reads the mock, not the code under test.
- **A guarantee TypeScript or a dependency already gives.** `expectTypeOf` on a type the test file
  annotated itself proves nothing.
- **A duplicate.** Another test already fails on the same bug. Say which one.
- **Coupled to internals.** It breaks on a refactor that keeps the behaviour.
- **One case of many.** Cases that fail together buy one guarantee. Keep the boundary and one
  representative, cut the rest, or merge them into a table.

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
ne vp test tests/val.test.ts
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
