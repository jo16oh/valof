# valof

## Design Memo

`notes/design.md` holds every design decision and the alternatives rejected along the way. Its index
is at the top. Read the sections it points you to before proposing anything about equality, copying,
wrapper types, the linter, or new API. §9 lists the open questions. New deliberation goes there.

## Bundle Size

Run `vp run size` after changing `src/`. It measures the bundle and the declarations against their
budgets and exits non-zero over either. Neither `vp check` nor `vp test` covers this.

## Committing and Pushing

Commit or amend only on an explicit go-ahead. Draft the message, show it, and wait.

Never push, and never open a PR. I do both myself, opening the PR from the web UI. Hand me the PR
title and body as a draft and stop there.

## Writing Style

Remember how limited humans are, especially me, since English isn't my first language. We don't have
a large context window like you do, and we can't read as fast as you can. Reducing redundant
expressions really matters, and it helps you save context too. Keep only the essential parts. Keep
it brief.

The repo is English: README, source comments, commit messages, PRs.

Write direct. Conclusion first, declaratives, no hedges, no filler concessives, no passive where an
actor exists. Short sentences, and a concrete example before the general statement. Prefer the
common word to the rarer, more precise-sounding one, and let a code block do what a metaphor would.

Skip idiomatic phrasal verbs where a literal one carries the same meaning: "limit to one" over "hold
to one", "fails with" over "comes back as", "the limit lifts" over "the cap comes off". A non-native
reader has the vocabulary for the literal verb; the idiom, they guess at.

Avoid the em dash. Splitting the sentence in two is usually the fix, and commas, "such as" or
parentheses cover the rest. Keep a colon where the second half gives the reason or the detail for
the first.

Models: Kent Beck, t_wada, Dan Abramov, mizchi. Take their plainness.

### Code and Comments

Self-documenting code first: a comment earns its place only where the declaration cannot carry the
fact. Keep the finding that shaped the code, drop the reasoning that reached it. State a fact once,
at the canonical site, and `{@link}` it from elsewhere.

`/**` on an exported symbol is the reader's hover, so type-level mechanics belong in a `//` comment.
Do not convert a non-exported symbol's JSDoc to `//`: `{@link}` resolves only inside JSDoc, and
maintainers hover internals too. Phrase what stays in the user's terms: "a payload taken from an
existing value fits", not "would not type-check".

Prefer a test to a comment, but check that the test can fail: mutate the source and see whether
anything goes red. When nothing can, the comment is the only record.

Verify a type-system claim with a throwaway probe before writing it, and before defending one
already in the file: `node_modules/.bin/tsc --ignoreConfig --noEmit --strict probe.ts`. To read a
resolved type, assign it to an impossible target (`const x: 0 = value`) and read it out of TS2322.

### Docs

Keep only what changes the reader's behaviour. That cuts machinery they never touch, the reasoning
behind a choice defended against an alternative nobody proposed, and prose restating the example
above it. `notes/` is the exception: a rejected alternative stays there, since that record is what
stops the idea coming back.

The README carries what a reader needs before writing code. What they need only once they get it
wrong goes in the JSDoc of the thing it describes, where the hover arrives together with the type
error that raised the question.

### Commit Messages

Conventional Commits, lowercase subject. Stay imperative in the body and the PR too. The subject
alone is the default. Write a body only where the diff cannot carry the intent, the same test a
comment has to pass. Bullets, as brief as they go, fragments rather than full sentences.

Local commits are working history. Squash merge takes the PR title as the subject and the PR body as
the body, so what lands on `main` is the PR, not these messages.

Do not add a `Co-Authored-By: Claude ...` trailer. The `main` ruleset requires an extra approval for
unattributed changes, and an `noreply@anthropic.com` co-author trips that rule, blocking merges.

### Pull Requests

Bullets, one line each, saying what changed. Lead with the problem where the change does not explain
itself, and show it in a code block rather than a paragraph.

Use `## Why` and `## What changed` once the body is long enough to need navigation. A short one
reads better without them.

Leave `notes/*.md` out of the body. It is the working record, not something the reviewer acts on.
Where a memo correction drove the code change, say what the code does now.

No `Generated with Claude Code` footer, for the same reason as the commit trailer.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown,
Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend
tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through
`vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for
information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a
`vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do
different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the
project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+ release. Add a tool name
to select part of the graph. For example, run `vp toolchain vite`. Use `--global` to ignore the
local `vite-plus` package. Use `vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation,
      run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include
      its output when asking for help.

<!--VITE PLUS END-->
