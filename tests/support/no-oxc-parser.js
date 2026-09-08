import { register } from "node:module";

// Makes `import("oxc-parser")` fail the way an absent install does, so the command's instruction
// can be tested on a machine that has the parser.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export function resolve(specifier, context, next) {
        if (specifier !== "oxc-parser") return next(specifier, context);
        const error = new Error("Cannot find package 'oxc-parser'");
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
    `),
);
