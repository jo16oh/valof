import valof from "../../../../src/lint/eslint-plugin/index.ts";

export default [
  {
    files: ["**/*.js"],
    plugins: { valof },
    ...valof.configs.recommended,
  },
];
