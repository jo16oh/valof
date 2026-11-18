import byethrow from "@praha/byethrow-oxlint";
import { defineConfig } from "oxlint";

import valof from "./src/lint/eslint-plugin/index.ts";

export default defineConfig({
  extends: [byethrow.recommended],
  plugins: ["typescript", "unicorn", "oxc", "import", "promise", "node", "vitest"],
  // The plugin from source, so the linter checks the library, the scripts and itself as it stands.
  // The second holds the rules this repository keeps for itself.
  jsPlugins: ["./src/lint/eslint-plugin/index.ts", "./scripts/lint/braces.ts"],
  settings: {
    valof: {
      project: [
        "src/**/*.ts",
        "scripts/**/*.ts",
        "!**/fixtures/**",
        "!**/*.test.ts",
        "!src/lint/integration/**",
      ],
      // An override cannot carry settings. The rule is on for the linter and check-dist, below.
      "data-type-outside-valof": { constraints: true, extraction: true },
    },
  },
  categories: { correctness: "error", suspicious: "error", perf: "error" },
  rules: {
    "byethrow/consistent-namespace": ["error", "R"],
    "local/braces": "error",
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
    { files: ["src/**/*.ts", "scripts/**/*.ts"], rules: valof.configs.recommended.rules },
    // The repository's coding rules cover all code but the library's `src` and the tests.
    { files: ["src/**/*.ts"], rules: { "local/braces": "off" } },
    { files: ["src/lint/**/*.ts"], rules: { "local/braces": "error" } },
    {
      // Both build their errors as classes, and the linter keeps state in classes.
      files: ["src/lint/**/*.ts", "scripts/check-dist/**/*.ts"],
      rules: { "valof/data-type-outside-valof": "error" },
    },
    {
      // A test passes a value the types reject, and builds the class a Val must refuse. It also
      // declares the misuses valof-lint reports, so the Valof rules stay off.
      files: ["src/lint/integration/**", "**/*.test.ts"],
      rules: {
        ...Object.fromEntries(
          Object.keys(valof.configs.recommended.rules).map((rule) => [rule, "off"]),
        ),
        "valof/data-type-outside-valof": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-extraneous-class": "off",
        // A matcher cannot give back the value a test unwraps to set itself up.
        "byethrow/prefer-result-matchers": "off",
        "local/braces": "off",
      },
    },
  ],
  ignorePatterns: [
    "src/lint/**/fixtures/**",
    "scripts/check-dist/check/types/fixtures/*.ts",
    "scripts/check-dist/check/compat/fixtures/*.ts",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "error",
  },
});
