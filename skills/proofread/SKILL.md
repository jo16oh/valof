---
name: proofread
description:
  The repo's sentence-level writing rules, and the pass that enforces them. It flags phrasing that
  leaves the meaning to the reader, possessives that hide the actor, literary vocabulary, idiomatic
  phrasal verbs, sections and samples that carry one fact, and type claims written without a probe.
  Read it before writing any English the repo carries. Run the pass after editing any .md, before
  showing the file or proposing a commit.
---

# Proofread

One pass over prose, separate from writing it. Report findings; apply them only on a go-ahead.

This file is the record. A rewrite that taught something new goes in as a rule here, with the
example that raised it.

## The standard

Write direct. Conclusion first, declaratives, no hedges, no filler concessives, no passive where an
actor exists. Short sentences, and a concrete example before the general statement. Let a code block
do what a metaphor would.

No literary vocabulary, and no metaphor that is not already a technical term. Pick the word that has
one reading here: "a member references `User`" over "a member names `User`", which reads first as
giving it a name. Word length and frequency decide nothing.

Established technical metaphors stay: "escape hatch", "boilerplate", "pay" for cost. The test is
whether the word still carries its literal sense in this context, not whether it originated as a
metaphor.

Skip idiomatic phrasal verbs where a literal one carries the same meaning: "limit to one" over "hold
to one", "fails with" over "comes back as", "the limit lifts" over "the cap comes off". A non-native
reader has the vocabulary for the literal verb; the idiom, they guess at.

Avoid the em dash. Splitting the sentence in two is usually the fix, and commas, "such as" or
parentheses cover the rest. Keep a colon where the second half gives the reason or the detail for
the first.

Models: Kent Beck, t_wada, Dan Abramov, mizchi. Take their plainness.

## 1. Scope

The standard above covers every English the repo carries: source comments, commit messages and PR
bodies included. The pass below reads the Markdown, which is where the diff makes it cheap:

```sh
git diff --name-only HEAD -- '*.md'
```

Read every changed file whole. A sentence reads differently beside the paragraph above it.

## 2. The mechanical pass

These are lexical, so grep beats rereading:

```sh
git diff -U0 HEAD -- '*.md' | grep -nE 'is yours|are yours|yours to|hands? back|hands it|comes off|comes back|answers to|answer for|goes dead|opening with|keeps .* off|may not be called|the same rule as|on the way in|names the|name the'
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
| `a member names the companion` | `a member references the companion`      |

## 3. The judgment pass

- **A possessive that hides the actor.** `The branch by tag is the library's` →
  `The library branches on the tag`. Restore an elided noun too:
  `the enum's entry decides the variant's` → `decides each variant's entry point`.
- **A word with two readings here.** `a member names the companion` reads as "gives it a name"
  before it reads as "calls it by name". Pick the word with one reading, whether or not it is the
  shorter one: `references`, `calls`, `uses`. The literal sense is fine: a variant
  `may not be named then` is giving a name, which is what it says. The same trap sits in `takes`,
  `holds` and `declares`.
- **A literary word, or a metaphor that is not a technical term.** Name the operation instead. A
  metaphor stays only where the word still carries its literal sense here, as `escape hatch` and
  `boilerplate` do.
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
