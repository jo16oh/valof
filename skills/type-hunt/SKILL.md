---
name: type-hunt
description:
  Hunt for holes in the public types. It probes each type a diff adds or changes with the inputs
  that broke valof's types before, and reports what the type accepts but should reject, what it
  rejects but should accept, and where the error lands away from the declaration. Run it after
  adding or changing a type a user writes against.
---

# Type hunt

One pass over the public types, separate from writing them. Report findings; fix them only on a
go-ahead.

The question every finding answers: **which declaration or call reaches a user with the wrong
verdict?** A finding is a probe that `tsc` accepts and should reject, rejects and should accept, or
reports on a line away from the declaration.

## Scope

The types the diff adds or changes that a user writes against: a type argument of `Val`, `Trait`,
`Enum` or `Tag`, a companion's type arguments and options, the arguments of a companion's members
(the payload of `seal` and `create`, the patch of `patch`, the handlers of `match`, the companion
and value of `dyn`), and an exported type such as `Patch` or `Impl`. The user can name a type
instead.

## Run it in a separate agent

Another agent runs the hunt, on the same model as the session that launches it.
`skills/test-audit/SKILL.md` describes how.

Give it the sections below, the scope and the diff. It writes the probes, runs them, and returns the
report.

## Probe

Write each case as one line. Put `// @ts-expect-error` above a line that should be rejected, and
nothing above one that should pass. Run:

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --declaration --strict --exactOptionalPropertyTypes \
  --allowImportingTsExtensions --module esnext --moduleResolution bundler probe.ts
```

Read which line reports an error, not only whether one does. Pattern 4 checks which line it is.

Probe against `main` too, checked out in another worktree. A hole that `main` already has is still a
finding, but say so.

## Principles

These are by design. Do not report them as holes:

- A Val is a plain object too. Where the type expects a plain object, as the argument of `seal` or a
  field of a patch, a Val with every key of that object fits, extra keys included. A value that
  replaces the whole field must have every key of the field. To drop the extra keys, as a JSON round
  trip needs, write a custom seal.

## Patterns

Try every pattern on every type in scope.

### 1. A union or a wide type where one is expected

A name, a key or a type argument meant to be one thing: a union (`"A" | "B"`), `string`, a template
(`` `X${string}` ``), an intersection of literals (`"A" & "B"`). The same for a structure: a union
of member records, of shared fields, of option lists, of a companion's type arguments.

**What breaks.** `Pick` keeps the common keys of a union, and a mapped type distributes over it, so
the type weakens with no error.

**Fix.** Require one literal (`IsOneLiteral`) or no union (`IsUnion`).

### 2. An intersection that no value fits

A field typed `U & W` for two Vals, `{ a: string } & { a: number }`, a shared field and a variant
field of the same name, two traits with a member of the same name.

**What breaks.** The field becomes `never`, the declaration passes, and the error waits until a
value is built.

**Fix.** Reject the declaration.

### 3. `any` and `never`

Each of them in every position pattern 1 tries.

**What breaks.** Both satisfy every constraint, so a constraint alone cannot reject them.

**Fix.** Check them in the type itself, in the private field that every use reads.

### 4. An error away from the declaration

Each broken declaration from patterns 1 to 3, with no companion and no use. Then with them.

**What breaks.** The declaration passes, and the error appears only where the type is used, or
nowhere when nothing uses it.

**Fix.** Move the check into the type argument's constraint, so the error lands on the declaration.
A constraint that passes its own parameter to a conditional type is circular (TS2313). Read it
through `[T] extends [infer X]` instead.

Some checks cannot reach the declaration. Report them only when the use site reports nothing too:

- `any` and `never`, from pattern 3. When a later type argument's constraint reads the earlier one,
  `tsc` still reports on the declaration, as at `M` in `Trait<"T", any, M>`. With no later argument,
  as in `Val<"V", any>`, only the use site reports.
- What depends on the implementation, such as a trait member left unimplemented, or an `impl` member
  with the name of a trait member. The declaration does not see the companion.
- A check that a self-referencing declaration makes circular (pattern 10).

A type argument that contains a type parameter is rejected on the declaration, since the constraint
cannot be decided there. This is intended. Share a shape with `Payload`, not with a generic alias.

### 5. Gaps in TypeScript's structural checks

- An argument passed through a variable, not a literal. It skips the excess property check, so a key
  the parameter excludes passes. **Fix.** Exclude the key with `?: never`.
- The same variable sharing no key with the parameter. The weak type check still rejects it, except
  on an intersection where one side is a mapped type with no keys, such as
  `T & Record<never, never>`. **Fix.** Write the parameter as one mapped type.
- A class instance where the type is `{}` or `object`. **Fix.** An index signature, which a class
  instance does not have.
- A Val passed for a plain-object field of a patch, which replaces the field rather than merging
  into it. A Val missing a key of the field should be rejected, and one holding every key, extra
  keys included, accepted. **Fix.** Add `T & AnyVal` to the union, beside the `Patch` that excludes
  the brand key.

### 6. Silently dropped

Something the user wrote that the type ignores: a trait intersected into a payload rather than
declared, a numeric key that `Extract<keyof T, string>` drops. Check that each part of the input
changes the result.

### 7. Rejected but valid

Every check added risks this. Try the valid forms next to the check:

- an explicit index signature (`keyof` is `string | number`)
- a nullable array, tuple or recursive field (`Rec<Node> | null`)
- a name that is a key of `Object.prototype`, such as `"toString"`
- the declaration combined with the other features: traits, a tag, shared fields

### 8. Broken only in the `.d.ts`

Export each declaration and what the user builds from it: a companion, a value, a function returning
one. Without `--declaration`, `tsc` does not report TS4094 or TS4023. Try the smallest form of each
declaration, such as an enum with one variant. A mapped type indexed by its only key resolves to
that property's type, which has no alias, so the `.d.ts` writes the type out in full, private
members included.

To check against the installed package, copy the probe into `scripts/ts-compatibility/fixtures/` and
run `vp run ts-compatibility`.

### 9. Another check's message

Each input from patterns 1 and 3, `unknown`, an object with methods such as a `Date`, and a type of
the wrong kind: a Val where a trait is expected, a trait or an enum where a Val is. Read the message
`tsc` reports, not only that it reports one.

**What breaks.** A check written for something else rejects the input. A conditional type over `any`
takes both branches, a check earlier in the chain fails first, or no message states the fault, and
`tsc` prints only the expanded constraint.

**Fix.** Run a check only on the input it is written for, as the tag-clash check only on a literal
tag. Check `any` and `never` before the other checks. Require a key whose name states the fault.

Test the message only for these inputs, where another check could reject them too. For an input that
only one check can reject, a test that it is rejected is enough.

### 10. A declaration that references itself

Each check, on a `Payload` that references itself through `Rec`, and on an enum whose variant has a
field of the enum type.

**What breaks.** The check reads the type it is part of, and `tsc` reports it as circular (TS2456,
TS2313). A comparison too deep for `tsc` (TS2321) appears only when the emitted `.d.ts` is compiled
again, with `vp run ts-compatibility` from pattern 8.

**Fix.** Read the argument through `infer`, as in pattern 4. Where that is still circular, the check
cannot reach the declaration. Move it to the private field that every use reads.

### 11. The user's compiler options

Run the probes again without `--exactOptionalPropertyTypes`.

**What breaks.** Without `exactOptionalPropertyTypes`, an optional key accepts `undefined`. A key
excluded with `?: never` then accepts it too, so `U.patch(u, { id: undefined })` passes, and `patch`
deletes a required key passed as `undefined`. A user may leave the option off, though the docs
recommend it. Report what changes without it, and mark what the docs already describe.

### 12. The cost of the fix

Measure each proposed fix with `vp run type-perf`.

**What breaks.** A check adds instantiations to each declaration it runs on, and bytes to the
`.d.ts` that every user loads. A fix over budget fails `vp run type-perf`.

## Report

One line per finding: the probe, what `tsc` does, what it should do, the pattern, and its fix. Mark
the ones `main` already has, and give each fix's instantiation and `.d.ts` size change from
`vp run type-perf`. End with the totals: probes run, findings per pattern.
