import { defineConfig } from "oxlint";

export default defineConfig({
  rules: {
    "typescript/no-explicit-any": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unsafe-function-type": "error",
  },
  ignorePatterns: ["tests/lint/**/fixtures/**"],
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "error",
  },
});
