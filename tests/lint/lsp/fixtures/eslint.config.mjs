import valof from "../../../../src/lint/eslint-plugin.ts";

// ESLint parses no TypeScript, and typescript-eslint refuses TypeScript 7. So the text arrives
// unparsed: valof re-parses it with oxc-parser and reads nothing off the host's tree.
const parser = {
  parseForESLint: (text) => ({
    ast: {
      type: "Program",
      sourceType: "module",
      body: [],
      comments: [],
      tokens: [],
      range: [0, text.length],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    },
  }),
};

export default [
  {
    files: ["**/*.ts"],
    languageOptions: { parser },
    plugins: { valof },
    ...valof.configs.recommended,
  },
];
