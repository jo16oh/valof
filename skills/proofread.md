---
name: proofread
description:
  Proofread the Markdown this branch changed. Flags phrasing that leaves the meaning to the reader,
  possessives that hide the actor, idiomatic phrasal verbs, sections and samples that carry one
  fact, and type claims written without a probe. Run it after writing or editing any .md, before
  showing the file or proposing a commit.
---

# Proofread

One pass over prose, separate from writing it. Report findings; apply them only on a go-ahead.

`notes/prose.md` holds the worked examples and the reasoning behind each rule.

## 1. Scope

```sh
git diff --name-only HEAD -- '*.md'
```

Read every changed file whole. A sentence reads differently beside the paragraph above it.

## 2. The mechanical pass

These are lexical, so grep beats rereading:

```sh
git diff -U0 HEAD -- '*.md' | grep -nE 'is yours|are yours|yours to|hands? back|hands it|comes off|comes back|answers to|answer for|goes dead|opening with|keeps .* off|may not be called|the same rule as|on the way in'
```

| flagged                        | write instead                            |
| ------------------------------ | ---------------------------------------- |
| `is yours to choose`           | `is customizable`, or name who does what |
| `hands back` / `hands it`      | `returns` / `passes it`                  |
| `comes off the run`            | `is removed from the run`                |
| `answers to the rules`         | `follows the rules`                      |
| `goes dead`                    | `becomes unused`                         |
| `a path opening with !`        | `a path starting with !`                 |
| `keeps patch off those fields` | `excludes those fields from patch`       |
| `may not be called X`          | `may not be named X`                     |
| `on the way in`                | `at the boundary`                        |

## 3. The judgment pass

- **A possessive that hides the actor.** `The branch by tag is the library's` →
  `The library branches on the tag`. Restore an elided noun too:
  `the enum's entry decides the variant's` → `decides each variant's entry point`.
- **A noun whose referent the reader must guess.** `picks the kind` → name the alternatives. Watch
  for a word that also appears as an identifier in the sample below it.
- **An analogy written as a rule.** Two things that union different operands are not
  `the same rule`. Say what this one returns.
- **Internal vocabulary.** A word is the user's only if it reaches the export surface: an exported
  type or method, a type argument, a type error's text, a JSDoc they hover. Otherwise use the
  exported word for the same thing, or define the new one in a sentence at first use.
- **A section carrying one fact.** Try appending it to an existing sample with a comment before
  writing a heading for it.
- **A sample larger than the claim.** If the point is that a declaration typechecks, the `type`
  lines alone carry it.
- **A fact stated twice.** A rule that holds for every companion belongs in the JSDoc of the
  declaration that enforces it, where the hover arrives with the type error.

## 4. Let the sample carry the claim

A claim that fits a sample belongs in a fenced block, where `ne vp test docs/tools/twoslash` checks
it on every run. A negative claim fits too: declare the error code the reader would hit, as
`// @errors: 2339`. A code declared and never raised fails the test.

Use a throwaway probe only where the claim stays in prose, or is about something the book does not
show. Delete it afterwards.

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --allowImportingTsExtensions \
  --module esnext --moduleResolution bundler probe.ts
```

## 5. Report

One line per finding: `file:line`, the current text, the replacement. Group by file, worst first.
Say plainly where a sentence's intent is unclear rather than guessing at a rewrite.

Then run `vp fmt` on what changed, and the docs typecheck when a fenced sample moved:

```sh
ne vp fmt <files>
ne vp test docs/tools/twoslash
```
