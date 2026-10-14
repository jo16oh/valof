---
name: proofread
description:
  The repo's sentence-level writing rules, and the pass that enforces them. It flags phrasing that
  leaves the meaning to the reader, possessives that hide the actor, literary vocabulary, idiomatic
  phrasal verbs, sentences with no claim, sections and samples that carry one fact, and type claims
  written without a probe. Every fix keeps the sentence's claim, weight, certainty and function.
  Read it before writing any English the repo carries. Run the pass after editing any .md, before
  showing the file or proposing a commit.
---

# Proofread

One pass over prose, separate from writing it. Report findings; apply them only after approval.

This file is the record. A rewrite that taught something new goes in as a rule here, with the
example that raised it.

## The standard

Write direct. Conclusion first, declaratives, no filler hedges, no filler concessives, no passive
where an actor exists. Short sentences, and a concrete example before the general statement. Let a
code block do what a metaphor would.

A hedge is filler only where the writer is sure. Where it records what the writer does not know, it
is part of the claim. "A careful admin may notice the URL" claims less than "a careful admin notices
the URL". Keep that hedge.

No literary vocabulary, and no metaphor that is not already a technical term. Pick the word that has
one reading here: "a member references `User`" over "a member names `User`", which reads first as
giving it a name. Word length and frequency decide nothing.

Established technical metaphors stay: "escape hatch", "boilerplate", "pay" for cost. The test is
whether the word still carries its literal sense in this context, not whether it originated as a
metaphor.

Skip idiomatic phrasal verbs where a literal one carries the same meaning: "limit to one" over "hold
to one", "fails with" over "comes back as", "the limit lifts" over "the cap comes off". A non-native
reader has the vocabulary for the literal verb; the idiom, they guess at.

Avoid the em dash. Splitting the sentence in two is the fix, and commas, "such as" or parentheses
cover the rest.

A colon is right where a noun phrase follows it and names what came before: a list, an example, a
definition. Where a full clause follows, write two sentences instead, or "because" where the second
half is the reason for the first.

Models: Kent Beck, t_wada, Dan Abramov, mizchi. Take their plainness.

## What a rewrite keeps

This section overrides every rule above. A rewrite changes how a sentence says something, never what
it says. Before rewriting, note four things about the sentence, and check them again after
rewriting:

- **The claim.** What it asserts, and how its parts relate. Don't swap the topic for a nearby one,
  as "the point of X" for "the goal of X".
- **The weight.** What it puts first and what it dismisses. "Not A but B" becomes neither "A and B"
  nor "B over A".
- **The certainty.** "Is" stays "is", and "may" stays "may". The only exception is a filler hedge.
- **The function.** An evaluation stays an evaluation, and a description stays a description. "X
  matters here" does not become "we aim for X".

Keep the connotation along with the denotation. Where a word carries the writer's attitude, as
"finally" carries that someone waited and "accidentally" that someone made a mistake, a plainer word
must carry it too. Where the word is a metaphor, replace it with a literal word that keeps what it
implied.

Add nothing the source does not say: no actor, cause, condition, number or example that the text and
its context do not state, and no narrowing of a vague word to one specific fact. Where the rewrite
needs one of these, report it as a question instead.

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
  `may not be named then` is giving a name, which is what it says. `takes`, `holds` and `declares`
  have the same problem.
- **A literary word, or a metaphor that is not a technical term.** Name the operation instead. A
  metaphor stays only where the word still carries its literal sense here, as `escape hatch` and
  `boilerplate` do.
- **A noun whose referent the reader must guess.** `picks the kind` → name the alternatives. Watch
  for a word that also appears as an identifier in the sample below it. Restore a referent only
  where the context determines it. Otherwise report it as unclear.
- **An opening phrase that carries the evaluation.** `What matters is the order` →
  `The order matters`. Move the judgment into the predicate. Delete the phrase only where the
  sentence claims the same without it.
- **A negation that corrects.** `This is not a cache but a log` answers a reader who expects a
  cache. Keep the negation and change only the wording. Rewrite it as an affirmative sentence only
  where no reader would expect a cache.
- **A colon with a clause after it.** `The Val's own fields are not: p.id is a type error` →
  `The Val's own fields are not. p.id is a type error`. Where the second half is the reason, write
  it: `is refused: a duplicate brand needs the other alias to be seen` →
  `is refused, because a duplicate brand needs the other alias to be seen`. A noun phrase after the
  colon stays, whatever its length:
  `errors where a Val is broken: two types the checker stops distinguishing` names what `broken`
  covers.
- **An analogy written as a rule.** Two things that union different operands are not
  `the same rule`. Say what this one returns.
- **Internal vocabulary.** A word is the user's only if it reaches the export surface: an exported
  type or method, a type argument, a type error's text, a JSDoc they hover. Otherwise use the
  exported word for the same thing, or define the new one in a sentence at first use.
- **A sentence with no claim.** `This keeps your types honest` says nothing the reader can check or
  act on. Delete it if the paragraph says the same without it. If it seems to replace a claim the
  writer meant to make, report it and ask which one. Don't add the claim yourself.
- **A section carrying one fact.** Try appending it to an existing sample with a comment before
  writing a heading for it.
- **A sample larger than the claim.** If the point is that a declaration typechecks, the `type`
  lines alone carry it.
- **The deliberation behind an instruction.** An instruction says what to do. Why it is better than
  what came before, and why its steps go in this order, belong in the commit and PR:
  `Without a record, a re-audit reads every staged change again. Instead, each audit leaves a record`
  → `Each audit leaves a record`.
- **Which constraints to state in prose.** Prose states a constraint where the reader needs it
  before writing the code, as one that shapes how they design their types. One that the type error
  and the declaration's JSDoc explain well enough can be left out of the prose.

## 4. Let the sample carry the claim

A claim that fits a sample belongs in a fenced block, where `vp test docs/tools/twoslash` checks it
on every run. A negative claim fits too: declare the error code the reader would hit, as
`// @errors: 2339`. A code declared and never raised fails the test.

Use a throwaway probe only where the claim stays in prose, or is about something the book does not
show. Delete it afterwards.

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --allowImportingTsExtensions \
  --module esnext --moduleResolution bundler probe.ts
```

## 5. Report

One line per finding: `file:line`, the current text, the replacement. Group by file, worst first.
Say plainly where a sentence's intent is unclear rather than guessing at a rewrite. Ask the writer
about the facts a rewrite needed but the source did not give, at most two.

Then run `vp fmt` on what changed, and the docs typecheck when a fenced sample moved:

```sh
vp fmt <files>
vp test docs/tools/twoslash
```
