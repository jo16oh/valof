import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import", "promise", "node", "vitest"],
  categories: { correctness: "error", suspicious: "error", perf: "error" },
  rules: {
    "typescript/no-explicit-any": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-misused-spread": [
      "error",
      {
        allow: [
          { from: "file", path: "src/val.ts", name: "Phantom" },
          // The entry the Linting chapter recommends, for the published package `#valof` resolves to.
          { from: "package", package: "valof", name: "Phantom" },
        ],
      },
    ],

    // Picked from the pedantic category.
    eqeqeq: ["error", "always", { null: "ignore" }],
    "typescript/switch-exhaustiveness-check": [
      "error",
      { considerDefaultExhaustiveForUnions: true },
    ],
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "no-promise-executor-return": "error",
    "typescript/prefer-promise-reject-errors": "error",
    "typescript/return-await": "error",
    "unicorn/new-for-builtins": "error",
    "unicorn/no-immediate-mutation": "error",
    "unicorn/prefer-native-coercion-functions": "error",
    "unicorn/prefer-string-replace-all": "error",
    "unicorn/prefer-type-error": "error",

    // A `.then` at the end of a chain whose promise nobody reads.
    "promise/always-return": ["error", { ignoreLastCallback: true }],
    // The library's runtime sits behind its types, and reaches them through casts.
    "typescript/no-unsafe-type-assertion": "off",
    // A phantom type parameter is how a type carries what it was declared with.
    "typescript/no-unnecessary-type-parameters": "off",
    // `_` is the name `match` gives the handler for the rest.
    "no-underscore-dangle": "off",
    // Merging members into a new object is the point, and the records hold a few keys.
    "oxc/no-map-spread": "off",
    // `Record<never, never>` is the empty set of members a builder starts from.
    "typescript/no-generated-empty-object-type": "off",
    // Its `targetOrigin` is `window.postMessage`'s. Nothing here posts to a window.
    "unicorn/require-post-message-target-origin": "off",
    // A test named from a variable, which the rule cannot read as a string.
    "vitest/valid-title": ["error", { ignoreTypeOfTestName: true }],
    // A type test asserts with `@ts-expect-error` and `expectTypeOf`, which the type check runs.
    "vitest/expect-expect": "off",
    // Dropped on 2026-09-09, see "Fix tsconfig before adding rules" in `notes/design/14.19-oxlint.md`.
    "no-shadow": "off",
    "no-useless-concat": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-array-reverse": "off",
    "unicorn/consistent-function-scoping": "off",
  },
  overrides: [
    {
      // A test passes a value the types reject, and builds the class a Val must refuse.
      files: ["tests/**", "**/*.test.ts"],
      rules: {
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-extraneous-class": "off",
      },
    },
  ],
  ignorePatterns: [
    "tests/lint/**/fixtures/**",
    "scripts/type-perf/fixtures/*.ts",
    "scripts/ts-compatibility/fixtures/*.ts",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "error",
  },
});
