import { registerHooks } from "node:module";

// Makes `import("oxc-parser")` fail for a reason other than a missing install.
registerHooks({
  resolve: (specifier, context, next) => {
    if (specifier !== "oxc-parser") return next(specifier, context);
    throw new Error("the parser's native binding failed to load");
  },
});
