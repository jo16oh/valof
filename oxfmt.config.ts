import type { OxfmtConfig } from "vite-plus/fmt";

export default {
  ignorePatterns: ["src/lint/**/fixtures/**", "**/*.hbs"],
  proseWrap: "always",
  // Node's modules, then packages, then `#valof`, then relative paths, a blank line between groups.
  sortImports: true,
  overrides: [
    {
      files: ["notes/**/*.md"],
      options: {
        // Japanese has no spaces between words, so the only break opportunities are the
        // ones around inline code, and wrapping there strands particles at line starts.
        proseWrap: "preserve",
        // A sample in the notes quotes code as it was written or generated.
        sortImports: false,
      },
    },
  ],
} satisfies OxfmtConfig;
