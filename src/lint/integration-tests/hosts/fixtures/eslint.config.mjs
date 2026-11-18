import valof from "../../../eslint-plugin/index.ts";

export default [
  {
    files: ["**/*.js"],
    plugins: { valof },
    ...valof.configs.recommended,
  },
];
