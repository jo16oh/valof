# 9. Open questions / to confirm

- [x] ~~**The hole in a patch passed as a variable (investigated in #125).**~~ Closed, 2026-11-05. Items 1-3 of `hunt-findings.md`. A non-literal
      argument gets no excess property check, and the patch type was an intersection (`{…} & {…}`), so it got no weak type check either
  - **Make `Patch` one mapped type.** The weak type check then rejects a variable that shares no key (`{ foo: 1 }`).
    An intersection gets the weak type check too, but loses it when one side has no keys. A payload with no optional keys
    (`{ id; owner; note }` in the `Unpatchable` example) was such a case
  - **Write the rejected keys as `?: never`.** This is the `X` in `Patch<T, X>`
    - The `Unpatchable` keys. `const both = { id: "forged", name: "y" }; U.patch(u, both)` was accepted
    - For a variant's patch, the tag and the other variants' fields. `S.C.patch(c, q)` (q a value of `Q`) was accepted, and `match` took the
      `Q` branch
    - For the patch of a nested plain object, `typeof PhantomBrand`. A Val holds this key as private, so it is not assignable to the public
      `?: never`. `U.patch(u, { meta: someOtherVal })` was accepted, and since the Val is owned, it replaced the field instead of merging
  - **Breaking change.** Code that passes `Patch<SeedOf<V>>` to a companion with `Unpatchable` breaks (the type-perf core fixture
    did). Change it to `Patch<Omit<SeedOf<V>, "id">>`. The error for a patch literal containing an `Unpatchable` key
    changes from TS2353 to TS2322
  - **Cost.** The fixture changed, so core is not comparable (8,504 → 8,217). trait 23,756 → 23,576, enum 39,853 → 40,057,
    declarations 96.66 → 96.79 kB

- [x] ~~**Unions in a Val's declaration and in companions (investigated in #125).**~~ Closed, 2026-11-05. Items 1, 3 and 6 of `and-or-holes.md`
  - **A brand is one string literal.** A value of `Val<"A" | "B", P>` is not assignable to `Val<"A", P>`. The verdict of `UncheckedVal`
    becomes "a Val's brand must be one string literal". `string` is rejected too, as in Enum (user, 2026-11-05).
    The check runs for every Val declaration, and core grew by about 130
  - **`Val.companion` and `Val.of` take exactly one Val.** `Val.of<U | W>({})` and `Val.companion<U | W>().build().seal({})`
    were accepted, and the seed collapsed to `EmptySeed`. Whether the type is a union is read from the brand. A Val with a boolean payload is a
    union of values with one brand, so a check that reads the values would reject it too. The constraint `OneVal` is a mapped type whose key is the message ("a companion builds one Val",
    "\`Val.of\` builds one Val")
    - Reading it with `BrandOf<V & AnyVal>` took core from 8,318 to 12,960. Read it directly with `V extends Phantom<infer B, unknown>`
  - **The option list cannot be a union.** `Val.companion<U, [PrivateSeal] | [Unpatchable<"id">]>()` was accepted, and `seal`
    disappeared. `Enum.companion` had the same hole. The constraint is `const O extends readonly …[] & OneList<O>`, where `OneList` is a conditional type that is `Invalid`
    only for a union
    - Rejected: a mapped type whose key is the message. `const` inference walked the intersection's mapped type, and core grew by 1,050
  - **Cost.** core 8,318 → 8,504, trait 23,635 → 23,756, enum 39,786 → 39,853, declarations 96.09 → 96.66 kB

- [x] ~~**Holes in an Enum's declaration (investigated in #125).**~~ Closed, 2026-11-05. Item 9 of `hunt-findings.md`, items 2-5 of `and-or-holes.md`.
      Each check went into `Fault` (which reads only the type arguments)
  - **A variant's name is a string.** In `{ A; B; 404 }`, `VariantKeys` (`Extract<keyof D, string>`) silently dropped `404`,
    and `match` counted as exhaustive without `404`. If every name was a number, the enum became `never`, and the companion was still accepted.
    `VariantKeys` now includes `number`, and `Fault` rejects it with "a variant's name must be a string"
  - **The name, the tag name and the shared fields cannot be unions.** A value of `Enum<"E" | "F", …>` is not assignable to `Val<"E.A", …>`.
    `Tag<"k" | "t">` was accepted with `.tag("k")` (`Tag<"k"> & Tag<"t">` was already rejected). For shared fields of
    `{ id } | { key }`, the `Pick` in `SharedIn` kept only the common keys, and `create({ n: 1 })` was accepted with neither `id` nor `key`.
    The shared-field check reads the third argument (`X`) before `SharedIn` collapses it
  - **`Enum.companion` takes exactly one enum.** `Enum.companion<F | G>()` was accepted, and no variants appeared. An enum is
    a union of variants, so whether it is a union of enums is read from the name. The constraint `OneEnum<E>` is a mapped type whose key is the message (the same form as `Single`)
  - **The name and the tag name are one string literal each.** The check is `IsOneLiteral`, as for a trait's name, and it also rejects `string`, template literal types, `any` and `never`.
    Hunt item 4 had marked a `string` brand as "won't fix", but Val, Enum and Trait now handle it the same way (user,
    2026-11-05). `Tag<string>` was accepted, and only made `.tag` require `key: string`
    - Rejected: allowing only names that start with an uppercase letter (or `…/` followed by an uppercase letter). The types can express it, but such a check accepts `` `X${string}` ``, unions,
      `any` and `never`, so the literal check would still be needed. Consistent naming belongs to the linter (agreed with the user, 2026-11-05)
  - **A declaration's checks report on the declaration's line** (user, 2026-11-05). The name uses the `OneLiteral` constraint, and the tag name the constraint on `Tag`. `Fault` is
    split into `SharedFault` (what the third argument alone decides) and `VariantFault` (each variant checked against the third argument), which become the constraints on
    `X` and `D` respectively. The brand's `Named` stays, for `any` and `never`
    - An `Enum<"E", {}>` with no variants is now rejected on the declaration's line too. Before, the indexed access just became `never`,
      with no error. The message is "an enum needs a variant" (see the one-variant item below). `Tag<never>` is rejected by the constraint on `X` too
    - The payload rules now apply to variant payloads and shared fields (`Checked<Written<…>>`). `Written` holds the fields the declaration wrote, excluding
      the fields a trait adds. The constraint on `D` also reports a field with no possible value in the intersection of a variant's fields and the shared fields (`Unfit`), and
      a disagreement with a trait (`Fits`, as for Val). Until then, only `Enum.companion` reported these.
      This also makes an alias whose variants contain a type parameter impossible to write (as intended). enum 41,290 → 44,111
  - **Cost.** enum 39,583 → 39,786, `index.d.ts` 95.55 → 96.09 kB. Most of the increase is messages. #127 raised the declaration budget

- [x] ~~**Rejecting an enum with one variant.**~~ Allowed, 2026-11-06 (user). An enum can shrink to one variant during modelling
  - It was rejected for the sake of users' `.d.ts`. With one variant, the indexed access returned the member's type with no alias, which
    expanded the private phantom into the `.d.ts` and raised TS4094 / TS4023. The message said "one is a Val"
  - `EnumPhantom` moved out of the indexed access: `{…}[VariantKeys<D>] & EnumPhantom<…>`. The intersection becomes the alias's
    own type, and the `.d.ts` keeps the names `Lonely` and `VariantOf<Lonely, "Only">`. With two or more variants it is the same type as
    `(A & P) | (B & P)`. A ts-compatibility fixture (`Lonely`) verifies it on TS 5.9 / 6.0 / 7.0
  - An enum with no variants is still rejected ("an enum needs a variant"). Its type would be `never`. Used as a field's type, it would raise
    "no value fits" on a distant line, and it is silently assignable to any type. A test cannot read the message (`never` has no brand)
  - **Cost.** enum 45,236 → 45,146, `index.d.ts` 100.60 → 99.92 kB

- [x] ~~**Messages that missed the point.**~~ Fixed, 2026-11-06. Passing `any`, `never`, `unknown` or the wrong kind of type raised another check's message.
      Each time, either a conditional type took both branches on `any`, or another check failed first
  - `Enum<…, Tag<any>>`: "the tag cannot take the name of a field the payload holds" → the tag-name message. The check for a clash with the tag
    runs only when `IsOneLiteral<Tg>` holds. The error now lands on the third argument
  - `Enum<"E", any>` and `Enum<"E", never>`: "a Val's brand must be one string literal" → "an enum's variants cannot be
    `any` or `never`". Building the variants substitutes a placeholder variant (`Built`), and a variant's brand goes through `Literal`,
    which becomes `"?"` for a non-literal. Where an `Enum<any, …>` is used, the Val brand message no longer appears either
  - `Trait<"T", any | never, M>`: "a trait member cannot take a field's name" on `M` → the shape message
  - An `unknown` payload, field, trait shape or shared field: the message of the null or undefined rule → "`unknown` is not
    a plain value; write the type"
  - A `Date` or `Map` field: "keys must be strings", because of its symbol keys → "not a plain value". An object with methods
    gets this message before the key rule
  - A Val in `Impl`, `Dyn` or `Trait.companion`: "a trait is only a declaration" → "not a trait". A union of traits in `Dyn` or
    `Trait.companion`: the hint about `Impl<A> | Impl<B>` → a message asking for one trait. A Val in `Enum.companion`:
    "a Val is built by `Val.companion`"
  - Tests read the messages that the types expose (the verdict, `NameOf`). Where only an `@ts-expect-error` comment marks the error, the message
    cannot be checked
  - **Cost.** trait 24,331 → 24,460, enum 45,146 → 45,511, `index.d.ts` 99.92 → 101.67 kB

- [x] ~~**Declarations that should not be accepted.**~~ Rejected, 2026-11-06. Found by auditing all of valof's types
  - A Val as a variant's payload (`{ X: Val<"Q", …> }`): the enum broke silently. "a variant's payload cannot be
    a Val; write its fields"
  - Variants written as an index signature (`Record<string, …>`, template literal keys): accepted silently since #133 gave the brand a placeholder
    name. "a variant's name must be one string literal"
  - `any`, `never` or `Tag<"k"> & Tag<"j">` (which becomes `never`) as an Enum's third argument: one message. The variants are built
    from an empty object in `SharedArg`, and the variant checks pass
  - A trait's member set that is `any` / `never`, or a member that is `any` (`Final<any>` too): `any` also satisfies the member constraint, so
    the verdict checks it (`AnyMembers`)
  - A trait shape field of `string & number`: `DeclarableShape` checks `Unfit` (objects only). Before, the implementing
    Val reported it
  - A record payload, and a trait whose shape is a primitive: `Agrees` only looked at field disagreements
  - A tuple element of `never`: mapping the element to anything satisfies the constraint, so the whole tuple gets "no value fits a tuple element"
  - **Not handled.** Passing a Val to a plain object field through `seal`. A Val is also a plain object, so this is fine
    semantically (user, 2026-11-06). `any` in a field, `Impl<any>` and `any` in a companion's options stay unhandled, per the 2026-11-04 policy
  - The type budgets (975 B left for `index.d.ts`, 332 left for trait) stay for now, and go up the next time one is exceeded (user,
    2026-11-06)

- [x] ~~**`patch` cannot pass a Val to a plain object field.**~~ Accepted when the Val has every key of the field, 2026-11-06
  - #130 made `PhantomBrand` `?: never` and rejected every Val. The reason was that the type of a field in `patch` is
    partial, but at run time an `owned` node (a Val, an existing value) replaces the field whole instead of merging. Accepting a Val with missing keys
    would leave the field without those keys while the type still claims them
  - A Val is also a plain object (user). If the replacing value must have the full shape, replacing and merging give the same
    result, and losing the `owned` record through `structuredClone` breaks nothing. `PatchValue<T>` became
    `Patch<T, typeof PhantomBrand> | (T & AnyVal)`. The second member matches only a value with a brand, so the handling of a plain object passed
    as a variable (weak type check, `?: never` keys) does not change. Variants are accepted by the same rule
  - **A Val is also a plain object, and may have extra keys** (user, 2026-11-06). Where a plain object is
    declared (a `seal` argument, a patch field), a Val with all its keys fits, and a Val with extra keys is accepted too.
    Dropping the extra keys for the JSON round trip is the custom seal's job (as in `custom-constructors.md`:
    "an undeclared key survives unless the seal removes it")
  - **Cost.** core 8,865 → 8,893, `index.d.ts` 103.05 → 103.16 kB
  - **Cost.** core 8,845 → 8,865, trait 24,460 → 24,668, enum 45,511 → 45,759, `index.d.ts` 101.67 →
    103.05 kB (975 B left of the 104 kB budget, 332 left for trait)

- [x] ~~**Holes in the payload rules (investigated in #125).**~~ Closed, 2026-11-05. Items 6, 11, A and B of `__memo__/hunt-findings.md` and
      item 7 of `and-or-holes.md`
  - **A field can hold `null` or a primitive alongside one other kind.** `string[] | null`, `Rec<Node> | null` (a linked list),
    `User | null`, `Impl<A> | null`, `string | string[]`. Until now these failed with "not a plain value" (`string[] | number[]`
    passed through the array branch). The last branch of `Validate` (neither an object nor an array) splits off the primitives and passes the rest to
    `Validate`. A union of objects is still rejected. The root is not split (that would give a Val of `string | {…}` a `patch`)
    - **`patch` replaces such a field whole.** `PatchValue` is `T` unless `[T] extends [object]`. Merging `{ x: 1 }` into a field of
      `{ x; y } | null` produced a value with no `y` when the field was `null`. The same reason makes an optional key take the whole value
    - **`DeepReadonly` and `Opened` split too.** Without the split, `Rec` did not open, and arrays did not become readonly. `string | string[]`
      has number keys, so it also enters the array branch. `DeepReadonly` processes the rest once, without splitting it (`Mixed`). Splitting
      it again made recursion through a comparison across a type parameter never end (TS2321. `vp check` passed, but the ts-compatibility round trip of the declarations raised it)
  - **Accept an explicit string index signature.** The `keyof` of `{ [k: string]: number }` is `string | number`, so it
    failed with "keys must be strings". The `keyof` of `Record<string, number>` is just `string`
  - **Reject a field that no value fits.** A required key of type `never` (`{ a: string } & { a: number }`, an intersection of two Vals
    `{ a: U & W }`, a clash between an Enum's shared fields and a variant). "no value fits \`a\`". An optional `never` and
    `Record<string, never>` are accepted (always absent, always empty)
    - **`ValidateFields` cannot express it.** Mapping a `never` field to anything satisfies the constraint. `Unfit` checks at the level of the object
    - **At the root, only `Allowed` (on the type definition's line) and the variant verdict check it.** Checking at the root of `Validate` made a
      `Payload` that references itself through `Rec` raise TS2456, because `Payload` resolves to `Validate`. An Enum's `Fault` also sits where only the type arguments are read, and
      a recursive Enum became circular there. A variant passes it into the verdict through `Fit`, the fourth argument of `UncheckedVal`
    - `never` in a trait's shape is not rejected. `Disagreement` already rejects a clash between shapes
  - **Reject on the Val's declaration when two traits declare a member of the same name.** "two traits declare a member named \`x\`".
    Until now the second `implTrait` rejected it with "another member already answers", and the declaration was accepted. One Val can register a name
    only once (`TraitHost`), so neither trait's type can be implemented
  - **An empty object field rejects class instances.** In the seed `{ meta: {}; any: object }`, an empty object below the root becomes
    `{ readonly [key: string]: never }`. A class instance has no implicit index signature, so even a class with no fields
    fails. Production stored whatever it was given. `DeepReadonly`'s `Arg` gains `"field"`
    - **The root becomes an index signature too** (2026-11-06). At first the root stayed `EmptySeed`, because an index
      signature at the root rejected existing values and tagged payloads (the 2026-10-19 item below). With the root as `EmptyField | AnyVal`,
      existing values pass. A tagged payload is not an empty object, because `Tagged` adds the tag before building the seed type.
      `EmptySeed` was removed. enum 40,190 → 40,781
  - **Cost (TypeScript 5.9.3).** core 7,713 → 8,318, trait 21,101 → 23,635, enum 35,874 → 39,583, `index.d.ts`
    92.69 → 95.55 kB. The trait budget went from 22,000 to 25,000. The biggest parts are the split in `DeepReadonly` (trait about +1,400) and
    `Unfit` (about +350)
    - The declaration budget went from 96 to 104 kB too. The review of #126 added messages and name checks, and this PR reached 96.45 kB
      (2026-11-05, caught by CI. #128 raised it first). Moving a declaration's checks onto its line took the top branch to
      99.95 kB, and the budget went from 100 kB to 104 kB. The whole stack added 7.9 kB: 4.2 kB of type code, 2.0 kB of JSDoc and 1.7 kB of
      messages. Sharing the messages through literal aliases would save about 0.4 kB, but the alias names add as much to read, so it was deferred
      (user, 2026-11-05)
    - Rejected: writing the rest of the split as dedicated leaves (`Rec` / Val / `Impl` / array / object). trait 23,766 and declarations +0.3 kB, too heavy
  - **Report the trait checks on the declaration's line too** (user, 2026-11-05). The constraint on a Val's third argument becomes
    `AnyTrait & DeclarableTraits<Tr, T>`, which surfaces `Fits` (a union of traits, members of the same name, a disagreement between payload and shape) in the
    type argument. It reads the payload, yet a payload that references itself through `Rec` did not become circular. The verdict keeps `Fits`
  - **Reject `any` and `never` as a payload.** The type of `Val<"V", any>` was `any` throughout, and `Val<"V", never>` was `never`, and both
    passed every gate. `Grounded` turns `any` and `never` into an empty object so the type does not collapse, and the verdict rejects them with "a payload cannot be
    `any` or `never`". Both satisfy the constraint, so the error does not appear on the declaration's line
    - Cost: core 8,348 → 8,707, trait 23,998 → 24,284, `index.d.ts` 97.14 → 97.66 kB. On the top branch the declarations reached
      99.95 kB, leaving 51 B of the budget

- [x] ~~**Primitives and arrays pass an empty payload.**~~ Closed, 2026-10-19. The argument type was `{}`, so
      everything except `null` and `undefined` was assignable. `E("text")` for `Val<"E", {}>` was accepted, and the Variant
      `E.A("text")` built `{ 0: "t", …, _tag: "A" }`
  - **Types.** `SeedOf` and `SeedFor` replace an object type with no keys with `object & { length?: never; then?: never }`.
    They replace it at every depth (`X({ meta: "text" })` for `Val<"X", { meta: {} }>` fails too).
    This rejects primitives, arrays, functions and promises, and accepts existing values and tagged payloads
  - **`DeepReadonly`'s type argument `Arg` makes the replacement only in argument positions.** `SeedOf` and `SeedFor` pass `true`.
    The seed type and the value type no longer share a cache, so instantiations went up (core 5,881 → 6,329, enum
    34,399 → 35,559)
  - **Rejected: an index signature (`{ [key: string]: never }`).** It rejects existing values too. A type that contains a class's `Phantom`
    has no implicit index signature. A tagged payload fails too, since `_tag` does not fit `never`
  - **The value type stays `{}`.** A Trait's shape also goes through `DeepReadonly` without `Arg`. Narrowing it there would stop a
    Val with a string payload from implementing a Trait with an empty shape (`tests/trait.test.ts` fails)
  - **The seal argument check (`CheckedSeal`) now applies to an empty payload too.** Before, it was excluded because a string is assignable to `{}`.
    A seal that takes `unknown` fails with "a seal takes the payload, not a wire
    format"
  - **Run time: check a Variant's payload before the spread that adds the tag.** The copy runs after the spread, so
    even development checked nothing. A string became an object keyed by its indices, and a class
    instance silently lost its prototype. A non-object throws in production too
    (as in `patch`). The prototype check is development only
  - **A Val's constructor does not check at run time.** The library does not know the payload's shape at run time.
    Some payloads are primitives, so it cannot require an object
  - **Place the check after the declaration of `development`.** Placed before it, the minifier could not fold `development`,
    and every development branch stayed in production (the Enum increase went from +474 to +633 B). Moving it brought it to +487 B

- [x] ~~**A `create` that skips the seal.**~~ Added as `.implCreate.noseal`, 2026-10-14. A `create` that always generates a payload
      the seal accepts still returned the seal's return type as is. The step that defines `create` removes the seal from it

  ```ts
  const SectionId = Val.companion<SectionId>()
    .implCreate(() => randomBytes(4).toString("hex"))
    .implSeal((text, seal): SectionId | undefined =>
      /^[0-9a-f]{8}$/.test(text) ? seal(text) : undefined,
    );

  const id = SectionId.create(); // SectionId | undefined. undefined is never reached
  if (id === undefined || used.has(id)) return mintIds(used, count); // folded into the collision retry
  ```

  - **It is a pattern.** An ID type whose seal checks the format always ends up in this shape when it generates its own IDs (uuid,
    nanoid). When the unreachable branch is folded into the retry, a broken generator raises no error, and the recursion never ends
  - **The form.** `.implCreate.noseal(fn)`. The public `create` and `create.nocopy` return `V`. `patch` and
    `seal` do not change. Writing a plain `implCreate` afterwards brings back the form that goes through the seal
  - **Going through the seal stays the default.** A forgotten `noseal` shows up as `| undefined` in the return type, so the caller
    notices at compile time. With the opposite default, a forgotten seal would pass the types and create unchecked values in production.
    This is the same criterion that made `.nocopy` opt-in (§4.1)
  - **A `noseal` generator cannot take arguments.** Whether the generator receives unvalidated input decides it,
    and forbidding arguments closes that path in the types. With no input space, a single run of the development check is nearly exhaustive.
    A constraint of `() => SeedOf<V>` alone still accepts optional and rest parameters, so a separate
    `Parameters<G> extends []` check fails them with `Invalid<…>`. Allowing arguments would be a backward-compatible addition, so it waits
    until a real case appears
  - **A wrong payload type raises the error at the return value.** The constraint on `G` covers only the argument shape, and
    when the return type does not match, the argument's type becomes `() => SeedOf<V>`. With `G & (() => SeedOf<V>)`, when the return type
    matches, TypeScript cancels it against one side of the intersection and does not infer `G` (confirmed on 5.9 / 6.0 / 7.0)
  - **Write a generator that takes arguments and always succeeds with `implAssoc` (§6.13) and `Val.of`.** A function that takes only
    validated Vals (`Session.create(user)`) is such a case. This path gets no development check.
    `bypassed-companion` (§14.23) stays as it is and warns on this `Val.of` too. The form can be written but is not recommended, so a
    disable comment is appropriate
    - The `seal` passed to `implAssoc` is the custom seal, so `implAssoc` cannot solve the type problem of a seal that may fail.
      `noseal` keeps its role. The ban on arguments exists so that input checks cannot be skipped, and it does not conflict with the
      `create*` naming convention
    - A `create*` that takes arguments can call `create()` and then `patch`
      (`createLabeled: (label: string) => Doc.patch(create(), { label })`). Its return type goes back to the seal's return type.
      `label` is input, so going through refinement is correct
  - **The types do not close input through a closure.** A Val defined inside a function is already a visible sign. A check would be the
    lint rule "forbid defining a Val anywhere but a file's top level". A generator that reads mutable module-level state
    survives even that rule. Restricting that goes beyond TypeScript's semantics, so valof does not
  - **Production goes through the default seal only.** It does not call the custom seal
  - **Development actually runs the custom seal.** It calls `custom(payload, terminal)`. If the terminal is
    not called, it rejects. If the candidate passed to the terminal does not equal the payload, it judges that the seal normalized and throws. It returns the terminal's
    result and ignores the seal's return value, so it does not break §6.3. This is the same mechanism as `changedDuringSeal`
  - **The contract is that `create`'s output is a fixed point of the seal.** Passing the checks is not enough. Skipping a seal that also normalizes
    (`Math.round`) produces values not in canonical form, which breaks `equals` and the identity of a `patch` that changes nothing
    (`keep` goes through the seal)
  - **The linter reads `.implCreate.noseal(f)` as the `implCreate` step.** See `stepOf` (`scan/chains.ts`).
    The receiver is no longer a call, so without this the chain would break there, `bypassed-companion` would lose the companion,
    and `unimplemented-trait` would miss a later `implTrait`
  - **Cost.** Production gzip +44 B (852 → 896 B), `index.d.mts` +1.2 kB. The development
    check folds away in the production build. The increase is wiring (the `noseal` on `implCreate`,
    the flag, the branch that decides whether to go through the seal). The instantiation count barely changes
  - **Rejected: `create.noseal()` at the call site.** The `.nocopy` form does not fit. Ownership is a fact about each call, but
    "the output always passes the seal" is a property of the generator's implementation, so saying it once at the definition is enough. At the call site,
    every user could switch off "the seal is the only gate" (§6.8) on any companion with `create`. The motive also
    differs. Skipping the seal still leaves the final copy, so what it buys is the return type, not speed
  - **Rejected: unwrapping once in a bare exported function.** With `Result` it is one line, but a seal that returns `V | undefined`
    has no unwrap. `!` checks nothing at run time, so the throw has to be written by hand
  - **Rejected: skipping the seal when the generator returns `V`.** The brand is a phantom, so run time cannot tell them apart
  - **Rejected: using `Val.of<V>(…)` outside the generator.** `bypassed-companion` (§14.23) warns, and the development
    check does not apply
  - **The step is added even though `implAssoc` and `Val.of` exist.** They can express the same thing, but the step keeps the development check and the
    `create` name. Both are worth the small bundle increase
  - **An async seal was already forbidden** (§6.7, "A seal returns synchronously"). The development check can assume synchronous code

- [x] ~~**Should companion members be data-first / data-last duals?**~~ Yes, 2026-10-20.
      This lets users write `pipe(u, User.rename("x"))`. The member tells the two apart by argument count, and the types forbid optional parameters. The data-last form of a generic
      member loses its type arguments, so call it data-first inside an arrow function. Scope and rejected alternatives in §6.11

- [x] ~~**valof-lint rule: optional parameters that a type annotation hides.**~~ Added `hidden-optional`, 2026-11-03.
      TypeScript 7.1's `typescript/sync` counts the annotation's parameters (through aliases and imports). A run with
      no candidate does not load TypeScript. It catches an annotated top-level const (a function, or an object holding
      functions) used as a value of the object a step's function returns, or as the name that function returns. It
      reports at the default or the rest parameter. → Overturned on 2026-11-11 (below). The record from that time follows
  - **Without TypeScript, 2026-11-11.** The rule reports every default and rest parameter under an annotation, as the
    development check in `build` does. Counting the annotation's parameters exempted one shape, a type that lists only the
    parameters before the default, and the development check throws on that shape anyway. TypeScript cost an optional
    peer dependency on 7.1, a `MissingTypeScriptError` where 7.0 is installed, and a program started from inside the
    ESLint or oxlint process. The rule does not reuse `hidesParameter`, because the scan reads the parameters from the
    AST, which is more exact than reading tokens
    - The optional peer dependency on `typescript` stayed in `package.json` after that change, and was removed later
      the same day. Nothing in the package loads TypeScript now, so `typescript` is again not a peer dependency, as §14 recorded before
      `hidden-optional`
- When a type annotation hides an implementation's default
  parameters or rest parameters, the types cannot reject them and the data-last call breaks (§6.11, "Remaining hole"). The linter reads the syntax, so it
  sees the implementation under the annotation
  - **Since 2026-10-28, development throws in `build`** (§6.11, "Run time: throw on hidden defaults and rest parameters in development"). The lint rule still adds value by showing the problem
    where it was written, before anything runs. oxlint's `typescript/no-useless-default-assignment` catches the case where the annotated type
    does not include nullish
  - **Match the run-time check.** `=` and `...` at the top level of the parameter list. Inside destructuring is accepted. The linter can also read the annotation's parameter count,
    so it does not report a type that lists only the parameters before the default (§6.11, "Remaining false positive"). → Overturned on 2026-11-11 (above)
  - **Forms it catches.** `.impl(fns)` with an annotated const object, and
    `.impl({ toWire })` with an annotated function variable. The same for the second argument of `implTrait(Tr, …)`. `unused-member`
    already follows const objects and spreads. For function variables, add tracking to their declaration in the same file
  - **Forms it does not catch.** Members written directly in `.impl({ … })`. The type inferred from the implementation shows the default or the rest, so the types
    reject it. A lint report would duplicate the type error
  - **Forms across files.** A function imported from another file. Reading its declaration through the import needs cross-file
    tracking. Check whether `unused-member`'s name resolution (imports, renames, namespaces) can be reused
  - `implTrait<Tr>({ … })` was removed on 2026-10-20 (§15.1). That form was the main way into this hole

- [x] ~~**Seals the noseal development check misses.**~~ Added `unreturned-seal`, 2026-11-03, as proposed below. It
      reports every call of the second argument outside the argument of a `return`. The record from that time follows
  - **Dropped, 2026-11-11.** It reported a seal kept in a variable and returned later, as in
    `const sealed = seal(x); return sealed;`, since following the value needs data-flow analysis. The hole it
    guarded needs `.implCreate.noseal` and a seal that calls the default seal and then returns a failure, which is
    too narrow for those false positives (user)
- A seal that calls the default seal,
  then discards the result and returns a failure, passes the check, since "the seal was called and the value is equal". Production
  skips the seal, so a value that should be rejected gets created. The same applies to a seal that returns `undefined`, not only to `Result`

  ```ts
  .implCreate.noseal(() => randomId())
  .implSeal((text, seal) => {
    const id = seal(text);
    return isReserved(id) ? undefined : id; // the development check does not see this rejection
  })
  ```

  - **The return value is not inspected.** Searching it in development for the default seal's result would prevent this. It would not ship in the production
    bundle, but it would go against §6.3. The deciding case is a primitive payload. It cannot be found by identity, and an `Err`
    message containing the same string would be mistaken for it. String IDs are the main use of this step, so this matters
  - **Make it a lint rule.** On a chain with `.implCreate.noseal`, read the inline function passed to `implSeal`. Warn if no call of the second
    argument appears inside the expression that is `return`ed (for an arrow function, the body expression)
  - **Limit it to noseal chains.** Sealing, discarding and returning a failure is legitimate in an ordinary seal
  - **Warn whenever the result is stored in a variable.** Tracing whether the value flows to `return` needs data flow.
    `const v = seal(x); return ok(v)` is warned too, but it can be rewritten as `return ok(seal(x))`
  - **Forms it cannot see.** A function defined elsewhere, as in `.implSeal(hex)`, is not followed, and the rule says nothing
  - The linter currently does not read the body of the `implSeal` function (`CompanionSite.seals` is only a boolean). It comes in a separate PR

- [ ] **A `nocopy` that does not record ownership? On hold, 2026-11-11.** Production `nocopy` spends most of its time adding the payload to `adopted` (§4.1, "What production `nocopy` costs"). An option to skip that, used only with `nocopy` and not tied to hiding `patch`, would halve the time valof-lint takes to convert the AST of `src/val.ts` (4.5 ms → 2–2.5 ms). On an oxlint run over `src` + `scripts` (0.60 s), that saves an estimated 0.03–0.04 s.
  - **An unrecorded value is never shared by a copy.** A default seal or create given a payload that holds it copies it whole, and `patch` copies even the parts the patch leaves alone. The copy has a new identity
  - **Copying a graph with shared nodes takes exponential time.** Removing `adopted.add` from production `adopt` took the lint of `src/lint/shared/files.ts` from 15 ms to over 30 s. valof-lint's AST is a DAG. Each child is reachable from a field and from `children`. `Step` in `src/lint/scan/chains.ts` holds nodes and is built with the default seal. Without `adopted.add`, that seal copied the DAG as a tree. One copying seal anywhere above an unrecorded graph makes the run hang rather than fail
  - **A type argument cannot carry it.** The option changes what runs, so it has to be a step or a call-site form (`create.nocopy.untracked`). The Val budget has 66 B left (958 B of 1.00 kB, 2026-11-11)
  - Reconsider when a user builds large graphs with `nocopy` and measures what adding them to `adopted` costs
  - **2026-11-11: the mark is a private field now (§4.1).** Marking costs 5.9 ns instead of 89.5 ns, and the AST of `src/val.ts` converts in 2.2–2.6 ms. Skipping the record would now save little of what it promised

- [ ] **Partial freeze when a development `.nocopy` fails.** If traversing the graph fails on a later node's accessor or on a cycle, only the children checked before that point stay registered as owned and frozen. To undo the side effects on failure, switch to two phases: register and freeze only after checking the whole graph
- [x] ~~Allow `null` as a top-level payload?~~ No. `null & { __brand: K }` is
      `never`, so a value that stays `null` cannot be told apart by brand. Putting the brand on a union lets a bare `null`
      in, and a wrapper loses plain data and falsiness. `null` inside objects and arrays is still allowed
- [ ] Whether TS 7.1 (beta 2026-10-06, stable 2026-11-24) ships an in-process LS API (§14.5). If it does, the 7.x LSP client can move to it and fold into the same path as 5.x / 6.x. **No hurry.** `tsc --lsp` works from 7.0, so this is a chance to simplify, not a prerequisite
  - 2026-11-11: 7.1.0-dev.20261110.1 exports `typescript/sync` and `typescript/async`. Its `Checker` has
    `getSymbolAtPosition` and `getTypeOfSymbol`. Whether it runs in-process is unconfirmed
- [ ] Editor integration (§14.9). The implementation is in (`Options.overlay`, `valof/eslint-plugin`; `valof/lint` was removed 2026-11-14, §14.9). What remains is the README recipe and checking it in real editors
- [x] ~~**Editors do not show a member's JSDoc. Go to definition on a custom `seal` / `create` jumps into valof.**~~
      Members are fixed in TS 7.1. `seal` / `create` are given up (2026-11-11)
  - **A member's JSDoc is a TS 7.0.2 bug.** Passing through a bare mapped type such as `{ [K in keyof T]: T[K] }` is
    enough to lose it. 5.9.3, 6.0.3, 7.1.0-beta and 7.1.0-dev.20261110.1 show it. Go to definition reaches the
    user's code in every version
  - **`seal` / `create` jump into valof in every version.** `SealMethod` / `CreateMethod` declare the properties, and
    the function passed to `.implSeal` is only a type argument. Hover also shows valof's JSDoc, not the JSDoc written
    on the callback (7.1 nightly)
  - **Why give up.** The convention fixes their role, and valof's JSDoc explains it. Hover shows the parameter and
    return types as the user defined them. Returning `Result<User>` says it can fail. A rule the types do not show is
    a few lines below the companion, reached by jumping from the `User` in `User.seal` (same name, top level, §14.21)
  - **Rejected: TS 7.1's `registerLspMiddleware`.** It can rewrite the response to jump to `.implSeal(`. But it works
    only inside VS Code's `TypeScriptTeam.native-preview` extension, and the PR calls it an unstable API
    (microsoft/TypeScript#64583). 7.x does not read `compilerOptions.plugins`, so no hook works in every editor (on
    7.1 nightly, a plugin that writes a marker file when loaded did not run)
  - **Rejected: an LSP proxy wrapping `tsc --lsp`.** It works in every editor, but asks the user to configure the
    editor
  - **Rejected: having the user write `.implSeal({ seal: … })`.** As with members, the declaration site should become
    the user's code, but this is unverified. The API becomes awkward
  - **Rejected: a build-time transform.** The editor reads the source, so the transform's output never reaches it
- [x] ~~valof-lint: report a local alias (`type Local = ImportedUser`)~~ Implemented, as the separate rule `unnecessary-alias` (§14.25)
      rather than in brand-mismatch. It also closed the only hole in `split-companion`
- [x] ~~valof-lint rule: warn when `PayloadOf<X>` appears **at a property position** in a Val's payload.~~ Added
      `payload-of-property`, 2026-11-03. The top of a Val's payload and of each variant's payload (an intersection's
      members included) passes, and anything below it is reported. A local `type M = Payload<PayloadOf<X>>` is followed
      one level. It errors by default. The syntactic position distinguishes it from the legitimate use (the base of a
      top-level intersection)
  - **Dropped, 2026-11-11.** It catches one mistake, and what led readers to it is gone: the README's
    `Reusing a Val` composed `PayloadOf<User> & { … }` at the top level, and neither the README nor the book composes
    `PayloadOf` any more. The rule cost a scan pass of its own and its tests. The hole stays, recorded in §4.1. The
    types cannot close it, since `PayloadOf<Money>` is a plain object type
- [x] ~~valof-lint rule `foreign-rec`: report a `Rec` that is not self-referential~~ Not added (§14.26).
      `Rec<Other>` opens to `Other`, so the type is the same. It causes no harm, and nobody has a reason to write it
- [x] ~~**Implement `Enum` (a sum type).**~~ Implemented, in `src/enum.ts`, exported from `valof/experimental` next to
      Trait. At run time it is one proxy plus a frame per Variant (borrowing `Val.sealer`). Bundle size for
      `Val` + `Enum` is 1.10 kB gzip, against a budget of `Val`'s 1.25 kB + 384 B. What the implementation taught is in §15.2,
      "Lessons from the implementation"
- [x] ~~**`Enum` has no custom seal.**~~ Added. The entry point splits in two, `Enum.sealer` / `Enum.companion`,
      and `implVariant` passes the Variant's builder through a callback. The Enum's seal and the Variant's seal
      are chained into one, and `impl` closes the chain. The tag moved to the third type argument. Form and rejected alternatives in §15.2, "Per-variant seals and the union's `seal`"
- [x] ~~**valof-lint does not know `Enum`.**~~ Extended. `brand-mismatch`, `duplicate-brand`,
      `companion-mismatch`, `split-companion`, `unnecessary-alias`, `unimplemented-trait` and
      `bypassed-companion` read the Enum syntax. `unused-member` is unchanged. It registers `implVariant`'s members
      under the key `` `${enum}.${variant}` ``, and counts both `Shape.Circle.diameter` and a destructured
      `Circle.diameter` under that key. `scan` collects `sites` from three starting points into one list, and
      `Bindings.builders` became one Map too. **Three rules were decided against**
  - **A rule for fewer than 2 Variants.** The types reject it. `Fault` in `src/enum.ts` raises
    `"an enum needs at least two variants; one is a Val"` (from 2026-11-06, one is allowed, and only zero raises
    `"an enum needs a variant"`), and `E extends AnyEnum` rejects it at
    `Enum.sealer` / `Enum.companion` / `match` / `VariantOf` alike. The only silent case is a declaration with neither a companion nor
    any use, and that does no harm. The same judgment as dropping `tag-mismatch`
  - **A rule against giving a Variant its own companion.** The types reject it. The type argument of `Val.sealer` / `Val.companion` is
    `V extends AnyVal & NotEnum<V>`, so a Variant or a union raises TS2344 on the declaration's line. Where the types reject something, no rule is needed. On the `scan` side,
    a site whose type argument itself takes type arguments is not read as a companion site
    (this stops `companion-mismatch` from reporting `VariantOf` as a type name)
    - A self-referential constraint can be written on a function's type argument. "A self-referential constraint cannot be written" in §3 is about type aliases
    - **`val.ts` imports `enum.ts` for types only.** Moving `EnumPhantom` to `val.ts` and introducing a minimal
      marker were both rejected. One line in which the stable entry point's declarations reference `experimental` costs less than another
      phantom on Variant
    - The cost is that TypeScript expands the constraint into the message. The key of `Invalid` (`__valError`) appears on the second line as missing,
      so one internal name is visible
  - **2026-11-03: rebinding under the same name warns too (`unqualified-variant`, warn).** Destructuring and
    `const Circle = Shape.Circle` both hide the enum from the reader (§15.2, "Keep the prefix"). A rename stays with
    `companion-mismatch`. The record from that time follows
  - **Renamed `detached-variant`, 2026-11-11.** "Unqualified" is a technical word that does not say what the
    code does (user). The rule reports a variant taken off its enum into a local name, by either form.
    Rejected: `destructured-variant`. It is the most direct for `const { Circle } = Shape`, but not for
    `const Circle = Shape.Circle`
  - **A rule against rebinding a Variant.** `const { Circle } = Shape` and `const Circle = Shape.Circle` are
    legal. The only thing to check is that the names match, which an extension of `companion-mismatch` covers
- [x] ~~**The callback form of §15.4 is not in val.ts yet.**~~ Added, then removed on 2026-09-18. `.impl` closes
      in one call, and its only argument is the members object. A member that needs the companion references the outer name and annotates its return
      value. A probe showed that the annotation path covered everything `self` could reach. Val / Trait / Enum all
      match. The history is in §15.4, "Closing the chain"
- [x] ~~**Add `detached-impl` to valof-lint.**~~ Added. For `impl` / `implSeal` / `implVariant` /
      `implTrait` / `implCreate` / `fixed` whose chain reaches neither a starting point nor a local builder binding,
      `scan` records a candidate, and the rule reports it only when the base resolves to a companion site being scanned
      (including a dotted base such as `Shape.Circle.implSeal`, as an enum companion). An unrelated
      `.impl` resolves to nothing and stays silent. This turns "a companion lives in one place" from an assumption into an invariant, and
      `unused-member` and `companion-mismatch` keep counting correctly as they do now (§15.4)
  - 2026-10-23: removed. A companion closed with `.build()` has no steps, so the types do not let you write one (§6.12)
- [ ] `Unpatchable` can exclude only top-level keys (§6.10). Deep patch is in, so wait and see whether anyone wants to exclude deeper keys. It would take a path as a type argument, and whether that works with `Patch`'s recursion is unverified
- [x] ~~Document in the README how a payload behaves once it loses its `owned` record (§6.2)?~~ No. That a value becomes a different object after `structuredClone` is obvious to anyone writing JS, and the derived copying and merging follow from it. The record stays in §6.2
- [x] ~~Type-check the README's code samples?~~ No. twoslash is the counterpart of Rust's doctest, but the `// ---cut---` that hides the preamble works only in twoslash's renderer, and **GitHub and npm, where people read the README, show the preamble as is**. Hiding it needs a dedicated docs site, which is heavy for a project this size. A home-made scheme that gives each fence an id and keeps the preamble in another file could be written, but it adds one more thing to maintain
  - 2026-09-16: reversed (#39). `docs/tools/twoslash` type-checks each ts block in the README. The README does not use cut, and writes the preamble as part of the visible block. `paths` points imports from external packages to declarations in `docs/tools/twoslash/stubs/` (currently `remeda`)
- [ ] `Temporal` support in each runtime (low priority since valof leaves it out, but worth confirming if the README mentions it)
- [ ] The current state of the Records & Tuples proposal. The champions withdrew it in spring 2025 and were exploring Composites, as far as I recall, but this needs confirming. **valof does not adopt a strategy of waiting for the language to solve this**
- [x] ~~Close the gaps in valof-lint's tests (§14.10).~~ Closed in the third round, 2026-11-03. Mutations already
      failed on the chaining of `declaredName` and on `joins`. `widen` is covered by a fixture with two directives on
      one block (the union, and every kind winning in either order)
- [x] ~~**Type-check the fixtures? (§14.10) Reopened, 2026-10-14.**~~ Type-checked, 2026-11-03.
      `tests/lint/fixtures.test.ts` runs `tsc` with `tests/lint/tsconfig.fixtures.json` (0.1 s)
  - **The declarations went at the end of each file.** Type aliases are hoisted, so the positions the tests expect do
    not move. Only the leading `import` and the `@ts-expect-error` lines moved, and the expectations were rewritten
    from the line mapping
  - **The tsconfig loosens two options.** `noUnusedLocals` (a companion nobody reads is what a rule examines) and
    `declaration` (the declaration output of exported variables is not under test)
  - **Fixtures where two files share a brand got a namespace** (`billing/User`). Adding the declarations raised
    `duplicate-brand`
  - The record from that time follows.
    The fixtures are not type-checked, so renaming an API in the core leaves the lint tests green (§14.27)
  - Counted with a temporary tsconfig: 122 of 186 files, 329 errors. Most are omissions, not intended invalid code.
    `Val` not imported (162 as TS2304 / TS2552), parameters without types (TS7006, 77), types not
    declared (TS2749, 41)
  - Fixing them shifts lines, which means rewriting the positions the tests expect (`dead-member.ts:3:3`). A separate PR
  - Intended invalid code passes with `@ts-expect-error`. valof-lint reads only syntax, so its results do not change.
    **Put an invalid property on its own line.** The directive hides every error on its line, so
    writing `.impl({ patch: … })` on one line would miss a rename of `impl`
- [x] ~~With TypeScript 7.1 beta, a user's declaration output fails with TS7056.~~ The builder is now printed by name,
      2026-11-03 (§18.5). Found while adding valof-lint rules. Only the lint tests map the `typescript-7.1` alias to
      `typescript/sync` with a resolve hook
- [ ] **What remains of lint (from the 2026-11-03 additions).**
  - `block-step` (now `hidden-state-in-impl`, below), `split-variant-steps` (removed for the Enum builder's type, §15.2) and `unqualified-variant` are added (the three in `__memo__/tasks-to-design.md`)
  - **`block-step` stays (2026-11-11).** State goes outside the Val. A Val is immutable data, and state in a step's
    block is invisible to anyone reading the members. The report says only "move what it declares out of the
    companion", without saying where. A constant goes to module level, and state to a closure over the scope that uses
    it (valof-lint's plugin: inside `valof()`, §14.8)
    - **Rejected: dropping it.** It was almost dropped once, since moving state to module level still leaves state.
      The rule asks to move state out of the Val, not to remove it
    - **Rejected: recommending a class as the destination.** A closure with a narrow scope fits more cases (user).
      The plugin itself later moved its state into classes (§14.8, "State lives in classes")
  - **`block-step` became `hidden-state-in-impl`, and narrowed (2026-11-11).** `block` gave no picture of what the
    rule reports (user). The name says what goes wrong and where, and `impl` stands for every `impl*` step. It
    reports only a body whose own statements declare a variable, a function or a class. A body that only returns
    holds no state. A member's own locals, inside its function, are created per call and are not read
    - **Rejected: `step-block-body`.** It describes the form, and `block` was the word that gave no picture
    - **Rejected: `hidden-state-in-impl-block`.** Only a block body can declare anything, so `block` adds nothing
    - **Then `hidden-shared-state-in-impl`, the same day.** The state is both hidden from a reader of a member and
      shared by every member, and both are the harm (user)
  - `model-only-in-valof` is added (`__memo__/lint-model-only-in-valof.md`). Its options go to `Options.enable`, and
    the runner builds the boxes to run together with the default rules (css-var-kit's `compile`). No separate rule
    for "built-in types Valof does not allow as values"
  - **`model-only-in-valof` became `data-type-outside-valof` (2026-11-11).** The old name stated a policy, while
    every other rule is named after what it reports (user). The CLI flag, the plugin's setting and the key in
    `Options.enable` follow, and `ModelSettings` became `DataTypeSettings`. Rejected: `type-outside-valof`. The
    rule leaves out function types and `Payload<…>` aliases, so "type" claims more than it reports
- [ ] **The book's Map / Set gets membership wrong for inherited keys.** Found while turning valof-lint's Scan into
      Records, 2026-11-07. `docs/src/patterns.md` says "`if (tags[key])` is the membership test", but
      `tags["constructor"]` and `tags["toString"]` are truthy too (probed). The book lacks §8.1's note to check with
      `Object.hasOwn`. `__proto__` stays an own key through `Object.fromEntries` and `seal`. Not fixed
- [x] ~~**A mistake in `<W extends Rule>` gives no pointer to `Impl`.**~~ Not fixed, 2026-11-07. The release notes
      are enough. A check that gives the pointer adds type cost (user). `Rule` became a trait declaration (#125), so
      `Rule.dyn<W>` prints `TraitDeclaration<…>` in full with TS2344, and all it says is "Property 'kind' is missing"
- [x] ~~A Trait member returning a `Promise` breaks the declaration with TS2615.~~ The depth of `HasSelf`'s search is
      capped, 2026-11-03 (§15.1, "Capping the search depth"). Found while rewriting valof-lint
- [x] ~~A second type argument for `Dyn` that keeps the concrete Val (`Dyn<Tr, W extends Tr = Tr>`).~~ Not added,
      2026-11-04. `Dyn` is a box that forgets the concrete Val, so the shape's type widening to the trait's
      declaration is natural. valof-lint dropped the union of rule names (§14.8)
  - **Rejected: taking the original value out of the box (downcast).** Not now. If added, it goes on the trait's
    companion rather than on the box, and returns the original value (`Rule.downcast(box, DuplicateBrand)`, Rust's
    `downcast_ref`). The box is a Proxy where every key reaches the value, so a method would collide with the
    payload's fields and the trait's members. Branching on which Val it is means a closed set, which is a job for an
    Enum and `match`
- [x] ~~A Trait member overwrites a name the library puts on the companion.~~ Rejected by the types, 2026-10-14.
      Until then it passed the types, and only the run time replaced the name with the member
  - **An Enum's Variant names and `match`.** `Shape.Square({ side: 1 })` returned the Trait member's return value, and
    `Coin.match(h, handlers)` called the Trait member. The declaration's `Fault` rejects these. It reads only the type arguments,
    so it sits at the verdict position (§11). Member names are collected per Trait, distributing over them. Taking `keyof` of a union of member
    records keeps only the keys common to every Trait
  - **A Val's `nocopy`.** The type of `Id.nocopy` was `Nocopy<Id> & ((i: Id) => string)`, and at run time only the member
    remained. It is now in `Rejected`, so both `.impl` and the Trait's `Declarable` reject it. It is also in the linter's `RESERVED`
    (§14.27)
  - **The run time is unchanged.** The Enum's Proxy still reads `members` first. Only a cast or plain JS reaches it
  - Production gzip stays at 852 B. enum instantiations 32,437 → 32,653, `index.d.mts` +0.6 kB
- [x] ~~The Variant-name check (`Fault` in `src/enum.ts`) uses a different set from `Reserved`.~~ Intended. Unlike a Val's
      companion, an Enum's companion has neither `patch` nor `create`, so a Variant can take those names
- [x] ~~**Give the Enum companion a `create`?**~~ Done, 2026-10-24, only when the enum's `implCreate` is written. The output goes through `Shape.seal` (§15.2, "Build with one chain"). `patch` is not needed. `create` is worth considering. If it is added,
      add `create` to the Variant-name check
  - 2026-10-21: the direction is to give a Variant `create` only when `implCreate` is written (the Enum API item below)
- [x] ~~**Rework the Enum API. Undecided, 2026-10-21.**~~ Made it one chain, 2026-10-24 (§15.2, "Build with one chain").
      None of the three ideas was adopted: dropping `implVariant` and per-Variant members, passing Variant constructors through a callback,
      and the ways to write `implSeal`. What follows is the record from then. It followed §6.12, which aligned the entry points on `.seal`
  - The direction was to abolish `implVariant` and per-Variant `impl`. Neither Rust nor Scala's `enum` has per-Variant
    members. Union members and `switch` can express them
  - Keep the per-Variant `implSeal`. The return type differs per Variant (`Square` never fails)
  - No per-Variant parser is needed. The union's `implAssoc` can call a Variant's constructor, which also narrows the return type.
    Pass the Variant constructors to a callback (rather than going through the companion's name)
  - A seal does not take the part that is fixed by which seal was called. `User.seal` takes the whole payload,
    `Shape.Circle.seal` everything but the tag, and `Shape.seal` the tagged payload. A Variant's `implSeal`
    takes its argument without the tag too
  - Give a Variant `create` only when `implCreate` is written. The Variant's current `create` is "a seal that adds the tag",
    which means something different from a Val's `create` (which generates the payload)
  - Add the Enum's `PrivateSeal` here too (§6.12)
  - Remove here the `impl` / `implSeal` left on the `implVariant` frame. `Shape.Circle.implSeal(evil)`
    still passes the types after `.build()` (§6.12, "Close the chain with `.build()`")
  - Ways to write `implSeal`
    - Strings: `implSeal(fn)` and `implSeal("Circle", fn)`. The unqualified one reads as the type itself
    - Modifiers: `implSeal.Circle(fn)`, `implCreate.Circle.noseal(fn)`. This matches `implCreate.noseal`, and completion
      lists the Variants. The cost is that `Fault` forbids the Variant name `noseal`, `implSeal` becomes a Proxy,
      and the linter reads `.implSeal.X(f)`
    - Record: `implSeal({ Circle: fn })`. Weak, because nothing in the name refers to the whole
  - Two of the reasons in §15.2, "Rejected: write one seal for the whole enum", are weak: "the amount of code does not change" and "TS7022 in `match`"
    (it can be written as `switch (p._tag)`). What remains is that the return type does not differ per Variant
- [x] ~~**`unimplemented-trait` ignores traits declared on a variant (§15.2, "Build with one chain").**~~ It reads them,
      2026-11-03. `TraitImplementation.variant` holds the variant of `.Book.implTrait`, and a trait in a variant's
      payload is met only by that variant's implementation. The record from that time follows. There are no false positives, but
      it does not warn about a forgotten implementation. `scan` would need to read the trait in `{ Book: … & Named }` and `.Book.implTrait`.
      Add it in the valof-lint rewrite
- [x] ~~**A lint rule over `implAssoc` members (§6.13).**~~ Added, 2026-11-03: `constructor-name` for naming and
      `unrelated-assoc` for references, both warn. `unused-member` counts `implAssoc` members too. A reference is the
      type's name (the companion shares it) or the name of the `seal` / `create` the step's function receives. The
      record from that time follows
  - Naming: an `implAssoc` member that calls `seal` / `create` is named `from*` / `parse*` / `create*` (matched at a word boundary).
    Warn when an `impl` member uses one of these prefixes. The prefix check is `/^(?:from|parse|create)(?:$|[A-Z0-9_])/`.
    Rejected: `of` (`Val.of` does not go through the seal, while `Money.of` does), `with*` (in JS it means a derived value), `decode*` /
    `try*` / `new*` (overlaps `parse*`; the return type already shows failure; in a type literal it becomes a construct signature)
  - Reference: warn on a member whose parameter annotations and implementation never mention the type. A companion is not a place for helper functions
  - `unused-member` covers `implAssoc` members too
  - **A member passed by name is read through the function in the same file (2026-11-10).** In `exec: scan`, `scan`
    is read as a function declared at the file's top level with `function` or `const`, and a type name inside it
    counts as a reference. Until then only the one identifier was read, and a member that uses the type was reported.
    A function imported from another file is not read
  - **`constructor-name` was dropped (2026-11-11).** Too strict (user). Running valof-lint on itself, the rule would
    have split `Files.fromPaths` out of `Files.read` and `Parser.fromModule` out of `Parser.load`. A name cannot show
    whether a function is pure, and the rule conflicts with naming a construction with side effects by its action
    (`read`, `load`, §14.8). Keeping only the check on the `impl` side was rejected too. It has few false positives,
    but that alone does not justify a rule
  - **`unrelated-assoc` was dropped too (2026-11-11).** It guesses from syntax whether a member belongs to its type,
    and what it guards is a style: a companion used as a place for helpers. It needed a fix for members passed by
    name, and its sibling `constructor-name` was already gone (user)
- [x] ~~**A valof-lint false positive, from §6.12.** `detached-impl` reports a member named `fixed`, called from another file,
      as "a step written outside the chain".~~ Fixed after `fixed` moved to a type argument and left `STEPS`
      (2026-10-22). The types reject a member named like a step, so no other false positive of this kind can occur
- [x] ~~Implement the valof-lint rule `brand-mismatch` (§14.12)~~ Implemented. With `incomplete-disable` (§14.14) and `unused-disable` (§14.15), there are 6 rules
- [x] ~~valof-lint does not know `Trait`.~~ It tracks Trait declarations, companions, `implTrait` and `dyn` from the syntax.
      Two kinds of addition
  - [x] Extend the existing rules to the trait syntax. The judgments are the same; they only recognize more forms. `brand-mismatch`
        (`Trait<"Greetble", …>`), `duplicate-brand`, `companion-mismatch`, `split-companion`,
        `unnecessary-alias`, `unused-member` (a final can be read through two paths, `Greetable.shout` and `User.shout`,
        so either counts as a use)
  - [x] One new rule: it reports a Val that claims a trait but has no companion calling `implTrait` (§15.1). This was also said to close declarations whose payload
        does not satisfy the shape. Since 2026-10-19 a Val brings in the shape, so such a declaration
        cannot occur, and the types reject a contradicting declaration at its position (§15.1, "Vals bring in the shape too")
  - `unnamed-of` / `bypassed-companion` are not extended. A trait does not change anything about construction
- [ ] **Justify two awkward spots in the API early in the docs, one line each.** Both come from TypeScript's limits, but a first-time reader
      reads them as redundant: the two steps of `Val.companion<User>().impl(...)` (no partial inference, §13.1), and
      writing `"User"` twice in `type User = Val<"User", …>`
- [ ] **The name `dyn`.** It is Rust vocabulary, the only exception to the policy of avoiding FP vocabulary. Readers who do not know Rust
      cannot read it. Look at it in real use, together with the demand for `Trait` (§15.1)
- [ ] Survey existing npm libraries (`brand` / `value-object` / `newtype`)
- [ ] **Measure §15.3 `path`.** Before writing it, check whether inference for `glue`'s union handler works. The declaration budget
      went up to 64 kB, so it is no longer something to measure (§16)
- [x] ~~**§15.2 `Enum`: add `tag-mismatch` to valof-lint.**~~ Not needed. When the companion's argument types are
      looked up from the tag name, the types reject a forgotten, misspelled or extra tag. A clash with a payload key
      also fails at the brand position (§15.2)
- [ ] **Ship `hash`? On hold, 2026-09-10.** Nothing happens until a real case appears. Only one question matters: **is there a real case that puts
      many large values into a set?** If not, the canonical key in §8.1 settles it
  - **The canonical key competes with it.** A Val is JSON serializable, so a canonical string key turns `Set<string>` into a value-based
    set. It has no collisions and adds no API. Traversal is O(n), as with hash. hash wins only for large values
  - **It does not fit the budget.** Using it for early rejection in the default `equals` would make users of `Val` alone pay for it. The headroom is 133 B
    (1.12 / 1.25 kB), and a hash implementation is 200-400 B. As a standalone export it would be tree-shaken (like `dyn` in §15.1), but
    then the default equals cannot use it
  - **hash alone must not decide equals.** 32 bits give false positives. Limit it to early rejection, and confirm a pass with a structural
    comparison. Effect does it this way too
  - **The contract with a custom equals is the only design decision.** `implHash` is rejected (most people would not write one). The chosen form
    **treats equals equality and hash equality as different things**. It adds one more rule like §5's "a parent cannot call a child's custom equals".
    `hash` is limited to the default `equals`'s internals and the keys of structural Sets / Maps, and
    **is forbidden inside `implEquals`**. Using `hash(a) === hash(b)` for equality lets every false positive through as an equal pair
  - **The types cannot express the ban.** TypeScript cannot restrict where a free function is called, and branding the return value still lets `===` through.
    Make it a valof-lint rule. `chains.ts` already looks at the position of `.implEquals(...)`
  - **2026-09-15: the custom equals is withdrawn (§5).** The contract and the rule in the two items above are no longer needed
  - **64 / 128 bit cannot be built from built-ins.** `crypto.subtle.digest` returns a Promise, `crypto.hash` is Node only,
    and `BigInt` allocates on the heap. The only way is to line up 32-bit lanes of `Math.imul`, and bytes and time grow with the number of lanes.
    On top of that, 128 bits in hex take 32 characters, longer than the canonical key of a small value. **There is no middle ground**
  - Array hashes depend on order. Effect's `structure` folds with XOR, so permutations get the same hash (its authors call this a
    gotcha themselves). §5 requires order independence only for object keys
- [x] ~~Does the Mutable ↔ DeepReadonly round trip work smoothly with type inference?~~ Yes. A property's `readonly` does not affect assignability, and a mutable array is assignable to `ReadonlyArray`, so with `SeedOf<V>` as the argument type a mutable input can be passed as is
- [ ] **Imports in `.d.ts` keep the `.ts` extension (§18).** `dist/val.d.ts` contains `from "./namespace/val.ts"`,
      but `dist` has no `val.ts`. `rewriteRelativeImportExtensions` rewrites only JS. tsc resolves it to the
      `.d.ts`, so it works on 5.9 / 7.0, with or without `skipLibCheck`. Revisit once a tool that reads the path literally
      breaks on it
- [x] ~~**Type-aware lint warns on spreading a Val.**~~ Solved with configuration, 2026-11-03. typescript-eslint's and
      oxlint's `no-misused-spread` report `{ ...user }` as "spreading a class instance". `Phantom` is a
      `declare class`, so the rule sees a Val as a class instance. At run time a Val is a plain object, and
      spreading loses nothing. The docs' Linting chapter gives the configuration
  - **The configuration is `allow: [{ from: "package", package: "valof", name: "Phantom" }]`.** The entry does not export `Phantom`,
    but `dist/val.d.ts` declares it, so the package specifier matches. A bare `"Phantom"` also
    works, but it also exempts users' types of the same name. It clears Vals, variants, Vals that declare a Trait and, in ESLint, the enum union too, while
    ordinary classes still warn (probed with ESLint 10 + typescript-eslint 8.72.1, and oxlint 1.82.0 and 1.90.0)
  - **oxlint keeps warning on the enum union.** tsgolint's `TypeMatchesSomeSpecifier` does not decompose unions.
    typescript-eslint passes a union when every member matches. The union's alias is the user's `Shape`, so a specifier naming `Enum` does not match it.
    Adding `{ from: "file", path, name: "Shape" }` clears it, but the docs do not recommend it (next item)
  - **Spreading a value whose fields are not all known is not recommended, 2026-11-03.** A whole enum, a Trait type and a `Dyn` value are
    such values. The warning is treated as correct, and the docs give no workaround. They say only "match an enum first, and read a trait's fields
    by name". The example allowing `Shape` with `from: "file"` and the advice to silence Trait-typed values with a disable comment were removed
  - **Rejected: allowing `TraitPhantom` too.** It clears Trait-typed values, but also the spread of a `Dyn`. Spreading a `Dyn`
    drops its members, so that warning is correct (the item below)
  - **Rejected: making `Phantom` not a class (a string key `__valof_brand_…`).** The brand would survive a spread and let code bypass the seal,
    a brand could be forged by hand, it would appear in `keyof`, and the reservation of `__valof_` would come back. These are the reasons §2.1, "2026-10-26: back to symbol keys", rejected the symbol-key version
  - **Rejected: intersecting the whole enum with `Phantom` as well.** TypeScript distributes `(A | B) & P` into `(A & P) | (B & P)`, so
    the type stays a union, and oxlint still warns (probed)
  - **Enabled in this repo too.** It allows two: `Phantom` from `src/lib/val.ts` (the tests import from `src/lib`), and the same
    package specifier as the docs (`#valof` is named `valof`). `tests/no-misused-spread.ts` pins each form where the warning disappears or stays, one per line. An unused disable comment is an error, so the test fails whichever way the rule's behavior changes.
    The three disable comments in the tests that silenced spreading a Val are no longer needed
- [x] ~~**Spreading a `Dyn` lies about the type.**~~ Treated as misuse, left to the `no-misused-spread` warning, 2026-11-03.
      The type of `{ ...Greetable.dyn(User, user) }` is `{ name: string; greet: () => string }`, but at run time it is
      `{ id, name }`, with no `greet`. There is almost no use for spreading a box (reading the fields is enough, and the result is neither a Val
      nor a box), so the docs do not mention it
  - **Rejected: closing it in the types.** TypeScript drops from a spread's type only the members a class declares as methods. `Bound` is
    a mapped type, and mapping from a class with `Pick` does not drop them either (probed)
  - **Rejected: making the box a class instance.** Giving the Proxy target a class prototype would make `instanceof`
    pass, but a spread reads the target's own keys, so the result does not change. The members are dropped at run time already. A trait's
    shape exists only in the types, so dropping just `id` is not possible either
- [x] ~~**Restrict `Self` to the first parameter. Type the other parameters with `Payload<T>`, 2026-11-03.**~~ Done, 2026-11-03.
      §15.1, "`Self` only as the first parameter"
  - **The hole.** A `dyn` box replaces `Self` in any parameter but the first with the trait's type. Another Val can be passed, and
    the wrapped Val's implementation receives it. A companion is a concrete type, so it rejects that. Rust also makes a method with `Self` in
    a position other than the first parameter uncallable through `dyn`
    ```ts
    type Same = Trait<"Same", { n: number }, { same: (self: Self, other: Self) => boolean }>;
    Same.dyn(A, a).same(b); // accepted. A's implementation receives a B
    A.same(a, b); // type error
    ```
  - **Type the other parameters with `Payload<T>`.** A check or comparison over common fields reads only the other value's shape.
    A trait cannot reference itself in its own declaration (`other: Same` raises TS2615 in `Declarable`), so write
    `Payload<{ n: number }>`. A bare object is accepted too. ~~A member that reads only common fields has no problem~~
    → It is a problem, 2026-11-04. With the same shape, a value without a brand is accepted too
    - [x] ~~**Accept only Vals that implement the trait, with `Impl<Same>`.**~~ Done, 2026-11-04. §15.1, "`Impl`".
          `other: Impl<Same>`. Breaking
      - **With `Impl` as an interface marker, member parameters do not become circular (probe).** The search for `Self` recognizes it by key alone and stops
        (the same trick as `Rec`), and `Unbound` / `Bound` replace `Impl<X>` with `X`. However,
        `let s: Impl<Same>` stays a marker and does not become the same type as `Same` (`interface Impl<Tr> extends Tr` raises TS2312)
      - **Direction: make a trait a declaration-only type, and write the value type as `Impl<Same>` everywhere.** `Trait<K, S, M>` becomes an interface that only
        holds type arguments, and the member checks move to where it is used (the companion, the Val's declaration). In the prototype it did not become circular, and it
        rejected values without a brand. `Same` can no longer annotate a value's type
      - Open: combining several traits, reworking `Dyn`, `MembersOf` and so on, the depth of replacement, the name being close to
        `.impl()`, cost
      - **Implementation plan (confirmed in a prototype, TypeScript 7.0.2), 2026-11-04**
        - **`interface Trait<K, S, M> extends TraitDeclaration<B, S, V>`.** `TraitDeclaration` is a class with only three protected
          keys. B is a record from names to members (the bare members), S is the shape, and V is a record from names to
          check results. An interface's base resolves only where it is used, so nothing is evaluated on the declaration's line.
          The keys are protected, so they appear in neither `keyof` nor a spread
        - **The checks sit in V.** They are the expressions now at the brand's position (the shape rules and `Declarable`). `AnyTrait` requires V to be
          a record of `Members & Unrejected`, so the gates (companion, `Val`, `Dyn`, `implTrait`) report at the same
          positions as now. B holds the bare members so that `Impl<Same>` reading B does not run the checks
        - **`Impl<Tr> = DeepReadonly<ShapeOf<Tr>> & TraitPhantom<BrandsOf<Tr>>`.** It is the same class as the brand a Val holds,
          so a Val that declares the trait is assignable as is. It is a value type, not a marker, so `Unbound` / `Bound`
          replace nothing. `Impl<Same>` inside arrays, callbacks and return values works as is, and the
          depth-of-replacement problem goes away. Inside an `.impl()` callback, `other` also appears as `Impl<Same>`
        - ~~**Stop `HasSelf` at `TraitPhantom`.**~~ Not added. The brand is private, so even without stopping,
          `Self` is not found inside `Impl<X>`. Removing it changed nothing (test-audit)
        - **Combine as `Impl<Greetable & Weighed>`.** An intersection of traits becomes an intersection of the per-name records, `ShapeOf` becomes
          the intersection of the shapes, and `BrandsOf` holds both names. It is mutually assignable with `Impl<Greetable> & Impl<Weighed>`.
          The docs write it in the same `&` form as a Val's third argument
        - **Writing `Same` as a value's type raises a type error about the missing declaration keys.** `const s: Same = meter`
        - Revision of 2026-11-04 (at the user's direction): the interface becomes a type alias, the keys merge into one message, and
          the type argument rejects `Impl<A | B>`. §15.1, "`Impl`"
  - [x] **Add the payload rule checks to `Payload`.** → Done, 2026-11-03. `Payload<T> = Validate<T>`
    - **`Validate` maps any `Invalid<M>` it meets to `Refused<M>`.** `Invalid` itself is a valid payload, so
      without the mapping, `Val<"U", Payload<{ f: () => void }>>` takes `{ f: Invalid<…> }` as its payload, passes the companion, and
      stays silent until the first seal. With the mapping, the companion raises TS2344 as it does for a bare payload, and the last line carries the message.
      The mapping condition is non-distributive. `T extends Invalid<infer M>` distributed over a union of objects and erased the union rule
    - **For a valid payload, `Validate<T>` is the same type as `T`.** Rebuilding arrays as `ReadonlyArray` made
      `Val.unwrap` return readonly (§3, "do not write `readonly` in a payload"), and adding `| undefined` to optional keys
      made the seed accept `undefined` as a value under EOPT. Arrays are mapped with a homomorphic mapped type, and
      optional keys keep only an `undefined` that was written (`| Extract<T[K], undefined>`). The hover shows the expanded object
    - **Where it reports.** ~~Nothing on the line of `type X = Payload<…>`.~~ → Reports on the type argument, 2026-11-04.
      The use site still reports as before. For a Val's payload, the companion. A trait member's parameter
      (`other: Payload<{ f: () => void }>`) stays silent on both the trait's companion and `implTrait`, and the call's argument raises
      `'() => void' is not assignable to type 'Invalid<"functions are not allowed">'`. A check on the trait's side would have to walk
      member parameters deeply, so it was not added. Reporting on the type argument makes it unnecessary
      - **`Payload<T extends ValidateFields<T>>`.** `ValidateFields` is the object branch of `ValidateValue` cut out as a
        mapped type, shared with `Validate`. `Payload<{ a: { f: () => void } }>` raises TS2344 on the type argument.
        A constraint that contains `Validate<T>` (`Validate<T>`, `ValidateFields<T> & Validate<T>`) still raises TS2313.
        A mapped type alone does not become circular. The same on TypeScript 5.9.3 / 6.0.3 / 7.0.2
      - **Roots the type argument does not catch.** `bigint`, `undefined`, `symbol`, functions, number keys (caught when nested),
        unions of valid objects, `string | null`. The mapped type returns primitives as is, maps functions to `{}`, and
        ignores the kind of key. The use site reports them. A `Date`'s methods are rejected as functions, so the type argument catches it.
        Adding a conditional type that looks only at the root, as `& Root<T>`, does not become circular (probe), but it would duplicate `Validate`'s root
        rules, so it was not added → Added, 2026-11-04 (`Allowed` in §3). It reads the result of `Validate<T>` with a conditional type, so nothing is duplicated
      - **A `Payload` containing a type parameter cannot be written.** Both `type G<T> = Payload<T>` and `Payload<{ left: T }>` raise TS2344
        (even with `T extends string`). The constraint's `ValidateFields` is not exported
        - **Decided: no generic `Payload` and no generic Val, 2026-11-04.** Write a Val per concrete type. Extracting a generic bare type
          (`type Items<T> = { items: T[] }`) and wrapping it is not recommended either. `model-only-in-valof` reports it.
          The docs state the fact in one sentence (allowed-types.md). It only forbids, with no alternative to show, so it needs no section or example.
          A generic Val is rejected on the type definition's line by the same constraint (§3, "2026-11-04: report on the type definition line too"). Both the types and the linter
          agree that data is defined with concrete types
      - **Cost.** The fixtures do not use `Payload`, so instantiations changed by core −51, trait −46, enum −114, and
        `index.d.ts` +0.51 kB (TypeScript 5.9.3). A probe with 20 Vals wrapped in `Payload` went 36,968 → 30,195
        (TypeScript 7.0.2). Why it decreased is unverified
    - **`Invalid` and `Refused` are expressed with symbol keys only, 2026-11-04.** This keeps `__valError` from becoming a reserved name.
      Both keys are unexported `unique symbol`s, so no user payload can take this shape
      - **The hole while they were string keys.** A payload field holding a string literal under `__valError` could not be told apart from `Invalid`
        and was rejected. In `Payload<Payload<{ f: () => void }>>`, the outer layer mapped `Invalid` to `Refused`, and
        the Val accepted the string-keyed `Refused` as an ordinary value
      - **`Validate` maps `Invalid` to `Refused` and `Refused` to `Invalid`.** Without the mapping the symbol-key
        rule still rejects them, but the message changes to "keys must be strings". With it, the original rule's message survives any number of wrappings
      - **`AnyTrait` rejects both markers (`Unrejected`).** A broken declaration puts a marker at the brand map's or the member set's position.
        A string-keyed marker was rejected because its message is not a function, but a marker with only symbol keys fits in
        `Record<string, …>`. Both the brand map's and the member set's positions got `[InvalidKey]?: never` / `[RefusedKey]?: never`
      - **Cost.** Compared with main (#121), instantiations core +107, trait +120, enum +257, `index.d.ts`
        +0.52 kB (TypeScript 5.9.3)
    - **Cost.** The fixtures do not use `Payload`, so instantiations rose only trait +4 and enum +39 (TypeScript 5.9.3).
      About +320 per Val wrapped in `Payload` (probe, 20 of them: 60,719 → 67,072). `index.d.ts` +0.55 kB
    - **Correction: the record that said it "cannot be added".** `feat/self-first-parameter` concluded from a probe that it "cannot be checked" and
      recorded leaving `Payload` as the identity. The observations were correct. `Payload<T extends Checked<T>>` raises TS2313, `Payload = Checked<T>`
      raises TS2456 / TS2615 on a self-referential payload, and with a `Validate` that does not map, the companion stays silent. Only the conclusion was wrong.
      ~~What becomes circular is the comparison outside `Checked` (`[T] extends [Validate<T>]`); `Validate<T>` alone does not.~~
      → Wrong, 2026-11-04. In a constraint, `Validate<T>` alone raises TS2313 too (probe). It does not become circular when written in the body,
      as `Payload = Validate<T>`. Reporting on the type argument was added through `ValidateFields` above.
      The silence goes away with the mapping. The record in §15.1 was corrected to match this item
  - **`HasSelf` stays.** It walks the parameters other than the first and the return value. The depth limit (§15.1, "Capping the search
    depth") is needed for the same reason
  - **Rejected: treating the first parameter specially as a receiver.** Valof avoids method syntax and chains with pipe.
    The first parameter is special because it is the data of a dual (§6.11), and OO vocabulary does not belong there
  - **Rejected: deciding the replacement by which companion the member is called from** (`User` for `User.same`,
    `Greetable` for `Greetable.same`). It removes the positional exception, but the box would have to drop members with `Self` outside the first parameter.
    That creates members whose declaration is accepted but which the box cannot call
  - **Rejected: renaming `Payload` to `Shape`.** In Valof, a shape means a trait's fields (`ShapeOf<Tr>`).
    The `-Of` convention already separates `Payload` from `PayloadOf`
  - **Rejected: adding a Val-only type (`AnyVal & DeepReadonly<Checked<T>>`).** In a probe it
    rejected bare objects, and the box could still call it. Add it when it becomes necessary. Adding it later is not a breaking change

- [ ] **`Rec<Dollar | Yen>` and `Rec<Impl<Priced>>` pass in a field (2026-11-12, §3.6).** `equals` cannot tell the Vals
      apart, as in the field `Dollar | Yen`. `Validate` reads a `Rec` by its keys, so it never sees the type argument. Opening the `Rec`
      is circular for a type that references itself (§3.7). Undecided: leave it as misuse of `Rec`, or check the argument only
      where it is not the type being declared
  - `{ x: Rec<Tree> }[] | { x: Dollar }[]` (§3.7's `Tree`) passes too. `Collides` compares the objects with each Val read as its
    payload, but not a `Rec` read as its Val (2026-11-12, §3.6)

- [ ] **Exported types that take `any`, `never` or a Val silently (2026-11-12, the sixth type hunt).**
  - **Closed:** `Patch<User>` resolved to `never`, so a parameter typed with it took nothing. It now
    resolves to "`Patch` takes a payload; write `Patch<SeedOf<V>>`". Internally, `Patching` keeps `never` for a Val, and `PatchValue` reads that `never` as "replace the field whole". `Patch<never>` stays `never`, which `PatchMethod` reads as "no `patch`", and `Patch<any>` stays the object it was
  - **Closed:** `Unpatchable<any>` made every key unpatchable, and the error appeared only at the `patch` call.
    It now resolves to a message, which the companion's option list rejects. `UnpatchablePhantom`
    is exported, since a user's `.d.ts` now references it (§18.4). `Unpatchable` reads the key through `infer`, because against the constraint `K extends string`, `1 & K` resolves to `never` before `K` is known
  - **Closed:** `PayloadOf<never>` recursed past the checker's depth limit (TS2589), and `PayloadOf<Impl<G>>` raised TS2589 beside the constraint error. `Opened` returns `never` for
    `never`
  - **Open: `Impl<any>`, `Impl<never>`, `Dyn<any>` and `Dyn<never>` pass.** Every Val that declares a trait fits `Impl<any>`. §18.6 argues against such a generic over any trait. Making `Impl`
    a conditional type changed the type of every trait companion when its declaration was emitted and read back (ts-compatibility). A trait's members reference `Impl` of the trait being
    declared, so the conditional stays unresolved
  - **Open: `export const of = Val.of` fails the user's declaration emit** (TS4094 on the phantom
    keys, TS7056 for a generic over `Val.unwrap`). Naming the type of `Val.of` would fix it. Few
    users re-export it
  - **Open: `Rec<Impl<G>>`, `Rec<G>` (a trait), `Rec<any>` and `Rec<never>` pass in a field,** as
    `Rec<Dollar | Yen>` does. Checking a `Rec`'s argument opens it, which is circular for a type
    that references itself
  - The two messages take `index.d.ts` from 106.79 to 107.13 kB, inside the 108 kB budget (§3.6)
