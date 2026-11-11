---
name: proofread
description:
  The repo's sentence-level writing rules, and the pass that enforces them. It flags phrasing that
  leaves the meaning to the reader, possessives that hide the actor, literary vocabulary, idiomatic
  phrasal verbs, sentences with no claim, facts the reader does not need, sections and samples that
  carry one fact, and type claims written without a probe. Every fix keeps the sentence's claim,
  weight, certainty and function. Read it before writing any English the repo carries. Run the pass
  after editing any .md, before showing the file or proposing a commit.
---

# Proofread

One pass over prose, separate from writing it. Report findings. The writer applies the clear ones
and asks the user about the rest.

This file is the record. A rewrite that taught something new goes in as a rule here, with the
example that raised it.

## The standard

Write direct. Conclusion first, declaratives, no filler hedges, no filler concessives, no passive
where an actor exists. Short sentences. Let a code block do what a metaphor would.

Where the example goes depends on its form. A code block goes before the prose about it, because the
reader reads the code first. An inline example goes after the rule it illustrates, because a
fragment means nothing until the reader knows what it shows:
`cannot be an Impl itself, as in Val<"Card", Impl<Greetable>>`.

The reader as the actor is the exception to the passive rule. "An enum value can be built from three
kinds of input" needs no "you".

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
reader has the vocabulary for the literal verb; the idiom, they guess at. Two kinds stay: a
technical term that has a noun form, as "fall back" (fallback), and a particle in its literal sense,
as "leave out". An idiom with one reading stays too, as "put … into practice".

Avoid the em dash. Splitting the sentence in two is the fix, and commas, "such as" or parentheses
cover the rest.

A colon is right where a noun phrase follows it and names what came before: a list, an example, a
definition. Where a full clause follows, write two sentences instead, or "because" where the second
half is the reason for the first.

Headings are sentence case. Chapter titles (the entries in `SUMMARY.md` and each page's `#`) and the
headings of `api.md` are Title Case, because they name something: `## Val Companion Builder`.

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

Read the rewrite against the rest of the page. It keeps the terms the page uses elsewhere. `Final`
stays distinct from a default. It keeps the connectives to the sentence before, as "still" and
"anyway".

Leave a sentence the context makes clear, even where another rule matches it.
`` `.implCreate.noseal` takes no arguments `` covers both the function and the `create` it
registers, because the function becomes the `create`.

## 1. Scope

The standard above covers every English the repo carries: source comments, commit messages and PR
bodies included. The pass reads the Markdown that changed, as the diff lists it, rather than every
file:

```sh
git diff --name-only HEAD -- '*.md'
```

Read every changed file whole. A sentence reads differently beside the paragraph above it. When
another agent runs the pass, give it the files and no sections to focus on. A pass narrowed to
sections rewrote sentences that then disagreed with the rest of the page.

## 2. The mechanical pass

These are lexical, so grep works better than rereading:

```sh
git diff -U0 HEAD -- '*.md' | grep '^+' | grep -nE 'is yours|are yours|yours to|hands? back|hands it|comes off|comes back|answers to|answer for|goes dead|opening with|keeps .* off|may not be called|the same rule as|on the way in|names the|name the|is gone|(^\+ *|\. )Of the| is one\b|is `?never`?'
```

| flagged                         | write instead                            |
| ------------------------------- | ---------------------------------------- |
| `is yours to choose`            | `is customizable`, or name who does what |
| `hands back` / `hands it`       | `returns` / `passes it`                  |
| `comes off the run`             | `is removed from the run`                |
| `answers to the rules`          | `follows the rules`                      |
| `goes dead`                     | `becomes unused`                         |
| `a path opening with !`         | `a path starting with !`                 |
| `keeps patch off those fields`  | `excludes those fields from patch`       |
| `may not be called X`           | `may not be named X`                     |
| `on the way in`                 | `at the boundary`                        |
| `a member names the companion`  | `a member references the companion`      |
| `the object form is gone`       | `the object form is no longer available` |
| `Of the X, only the Y ones…`    | a sentence that starts with its subject  |
| `only a Val declaring T is one` | `only a Val declaring T is assignable`   |
| `the type is never`             | `the type resolves to never`             |

## 3. The judgment pass

- **A possessive that hides the actor.** `The branch by tag is the library's` →
  `The library branches on the tag`. Restore an elided noun too:
  `the enum's entry decides the variant's` → `decides each variant's entry point`.
- **A subject the reader does not write.** Make the sentence's subject the thing the reader calls or
  configures, by the name they type. Not a type argument:
  `The list O after the enum in Enum.companion<E, O>() accepts` → `Enum.companion accepts`. Not
  TypeScript: `TypeScript requires .tag to be first` → `.tag must be the first step`. Where only the
  default does something, say so: `The default create writes the tag`. A reference page describes,
  so it does not switch to the imperative mid-paragraph: `Return through the default seal` →
  `The custom seal brands the payload through the default seal`.
- **An option no sentence on the page has as its subject.**
  `VariantOptions<Unpatchable<"shippedAt">>` appears in a sample, and no sentence says what
  `VariantOptions` does. Write one with it as the subject. A sentence about the sample does not
  replace it.
- **One sentence carrying two facts, or an elided relative pronoun that reads as a new clause.**
  `adds a seal E.seal runs before the tag selects a variant` →
  `adds a seal. E.seal runs it before the tag selects a variant`. Where the reader acts on two facts
  separately, split them, as a member the trait does not implement and a default the Val replaces.
  Keep together facts the reader reads together. A run of one-fact sentences reads as choppy to a
  native reader.
- **A sentence whose scope reads two ways.** `implements a trait it declares in one implTrait` reads
  as one call for every trait → `with one implTrait per trait`. Read it after the sentence before:
  following `create passes the payload to the seal`, `Both deep-copy the payload` reads as two
  copies.
- **A claim the next sentence contradicts.**
  `Each variant's steps come first. Only .tag comes before them` →
  `.tag comes first if the enum has a custom tag key. Then each variant's steps follow`. Check the
  claim holds in every case too. Adding a variant does not always take `one line`.
- **A word with two readings here.** `a member names the companion` reads as "gives it a name"
  before it reads as "calls it by name". Pick the word with one reading, whether or not it is the
  shorter one: `references`, `calls`, `uses`. The literal sense is fine: a variant
  `may not be named then` is giving a name, which is what it says. `takes`, `holds` and `declares`
  have the same problem only where the context gives them a second reading. `takes two arguments`
  stays.
- **A verb that names no operation.** `the rules hold`, `steps go in`, `no variant's seal sees it`.
  Name what happens, where the context names it: `the seal checks every Val`, `steps follow`,
  `no variant's seal receives it`. "Be" for a change of state names none either: `the Val is never`
  → `the Val resolves to never`.
- **A word near a Valof term.** Use the term Valof uses for the thing. A near synonym reads as
  another thing: `a method's parameters` → `what a member takes`, because a companion's functions
  are members, not methods. `Refine the payload` → `Seal the payload`. A heading
  `Protect generated fields` does not lead the reader to `seal` and `create`.
- **A literary word, or a metaphor that is not a technical term.** Name the operation instead. A
  metaphor stays only where the word still carries its literal sense here, as `escape hatch` and
  `boilerplate` do.
- **A noun whose referent the reader must guess.** `picks the kind` → name the alternatives.
  `a Val's order` reads as one Val's → `Val.companion`'s order. `after the enum` →
  `in its second type argument`. `receives what the one passed to .impl receives` →
  `receives the same seal, create and patch`. Watch for a word that also appears as an identifier in
  the sample below it. Restore a referent only where the context determines it. Otherwise report it
  as unclear.
- **A pointer the reader must resolve.** `instead`, `the same` and `as it does` point at something
  outside the sentence. Name it: `The same type argument` → `The third type argument`, with a link.
  Naming it keeps the connection between the sentences. Drop it only where the paragraph reads as
  well without it. Check the comparison holds: `replaces create, as it does in Val.companion` is
  wrong where `Val.companion` has no default `create`.
- **An opening that does not say what the thing is.** Open a page with what the thing is, in terms
  the reader already has:
  `An enum is a discriminated union declared in one place. Each variant is a Val`. Open a footnote
  with the claim it supports, not with an API the page never introduced.
- **A placeholder.** A name the reader chooses goes in brackets after the dot:
  `E.[VariantName].seal(payload)`, `User.[member](user, ...args)`. Say once, above the table, what
  each placeholder stands for.
- **A notation different from the one beside it.** Write a list the way the table around it does, as
  `string / number / boolean / null (below the top level)`, not a semicolon list. A sentence about a
  table row uses the row's wording.
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
- **The state before the change, in the past tense.** `An async seal type-checked` does not say
  when. A PR body describes the behaviour before the merge in the present, with "Currently":
  `Currently, an async seal is accepted`. Avoid "type-check" as an intransitive verb too, as in
  `no longer type-checks`. It also reads as the subject doing the checking. Write `is rejected`.
- **A colloquial phrase in a PR body or a commit.** `The object form is gone` →
  `The object form is no longer available`. `(if it's impl'ed)` →
  `(where implCreate registered one)`.

## 4. What to leave out

The reader loses nothing without each of these.

- **A sentence with no claim.** `This keeps your types honest` says nothing the reader can check or
  act on. Delete it if the paragraph says the same without it. If it seems to replace a claim the
  writer meant to make, report it and ask which one. Don't add the claim yourself.
- **A clause the sentence stands without.** Read the sentence without it.
  `adds functions under the User namespace, where they are the companion's members` →
  `adds member functions to the companion`. Name a setting rather than describe it:
  `For a consumer's emitted declarations, which reference types the entries leave out` →
  ``For a consumer with `declaration: true` ``. Cut a `such as` list after a claim that is clear
  without it too.
- **An implementation detail.** What the library does inside, or why the type system forces a
  restriction. `What returns a Self is a constructor, and a trait has no brand to seal with` → leave
  `Self may appear only as a member's first parameter`. Cut
  `A production build copies the own enumerable keys` too. A code comment keeps only what the
  declaration needs. A marker type does not need a note about `keyof`. A PR body gives the one
  reason the reviewer needs: `so __valError does not become a reserved name`.
- **Which constraints to state in prose.** Prose states a constraint where the reader needs it
  before writing the code, as one that shapes how they design their types. One that the type error
  and the declaration's JSDoc explain well enough can be left out of the prose. A JSDoc can leave it
  out too where the type error alone tells the reader: `this is undefined inside a method`.
- **A condition the context already states.** A table cell or a one-line summary describes the
  common case. Leave out a restriction that a nearby row, the type error or the JSDoc already
  conveys: `adds one variant's members, and its seal on a companion` →
  `adds one variant's members, and its seal`. In a short phrase, the condition reads as part of the
  noun, as a seal located on a companion.
- **What a statement above already implies.** Once the page says each variant is a Val, it does not
  repeat for variants how `patch`, `equals` and copying work on a Val. A behaviour that follows the
  principle the page states needs no sentence of its own.
- **A fact about JavaScript, TypeScript or another library.** That a companion with a `then` member
  is a thenable, that type arguments do not exist at run time, which TypeScript version is required
  while no bug has depended on one, that `ts-pattern` matches on fields. Name a rarely used API only
  where readers use it. Cut `Reflect.set`.
- **Advice beyond what Valof guarantees.** The types do not promise an unforgeable id, so the docs
  do not tell the reader how to make one. Do not forbid a use Valof does not break, as an alias of
  `VariantOf<Shape, "Circle">`.
- **What changed, on a page for the current version.** A reader starting now does not need
  `bigint is not allowed`. The release notes carry what changed. A path the docs do not mention is
  not public, so cut `Do not import from valof/internal` too.
- **A section carrying one fact.** Try appending it to an existing sample with a comment before
  writing a heading for it.
- **Detail the reader needs only in some cases.** A footnote that explains two APIs becomes links to
  their sections: `Two paths skip a companion's seal: Val.of and .implCreate.noseal`.
- **The deliberation behind an instruction.** An instruction says what to do. Why it is better than
  what came before, and why the steps are ordered this way, belong in the commit and PR:
  `Without a record, a re-audit reads every staged change again. Instead, each audit leaves a record`
  → `Each audit leaves a record`. `notes/` is the exception, since it records the alternatives
  rejected.

## 5. Let the sample carry the claim

A claim about types that fits a sample belongs in a fenced block, where
`vp test docs/tools/twoslash` checks it on every run. A negative claim fits too: declare the error
code the reader would hit, as `// @errors: 2339`. A code declared and never raised fails the test.

- **A sample larger than the claim.** If the point is that a declaration typechecks, the `type`
  lines alone carry it. A claim the prose states completely needs no sample. The enum page does not
  repeat a Val's `.implAssoc` sample.
- **A sample smaller than the prose.** Where the prose names two steps, the sample shows both. One
  sample that shows `parse`, `create`, `patch` and the seal's check is better than a sample per
  step.
- **A sample whose purpose the reader cannot see.** Pick a domain where the API's job is visible.
  `Yen.parse("¥120")` returning a `Result` shows why `.implAssoc` exists. A `fromRow` over a
  database row does not.
- **A comment that does not say what the reader sees.** Write the result, not its type: `// Ok(…)`,
  `// Err("expected ¥ followed by digits")`, not `// Result<Interval>`. An `@ts-expect-error`
  comment gives the cause: `a plain string has no TaskId brand`, not `not a TaskId`.

Use a throwaway probe only where the claim stays in prose, or is about something the book does not
show. Delete it afterwards.

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --allowImportingTsExtensions \
  --module esnext --moduleResolution bundler probe.ts
```

## 6. Report

One line per finding: `file:line`, the current text, the replacement. Group by file, worst first.
Say plainly where a sentence's intent is unclear rather than guessing at a rewrite. Ask the writer
about the facts a rewrite needed but the source did not give, at most two.

Then run `vp fmt` on what changed, and the docs typecheck when a fenced sample moved:

```sh
vp fmt <files>
vp test docs/tools/twoslash
```
