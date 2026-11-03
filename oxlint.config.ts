import { defineConfig } from "oxlint";

export default defineConfig({
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
  },
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
