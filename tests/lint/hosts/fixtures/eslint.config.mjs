import valof from "../../../../src/lint/eslint-plugin.ts";

export default [
  {
    files: ["**/*.js"],
    plugins: { valof },
    ...valof.configs.recommended,
  },
];
