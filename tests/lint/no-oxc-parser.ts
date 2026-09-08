import { registerHooks } from "node:module";

// Makes `import("oxc-parser")` fail the way an absent install does, so the command's instruction
// can be tested on a machine that has the parser.
registerHooks({
  resolve: (specifier, context, next) => {
    if (specifier !== "oxc-parser") return next(specifier, context);
    throw Object.assign(new Error("Cannot find package 'oxc-parser'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  },
});
