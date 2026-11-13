import { registerHooks } from "node:module";

// Makes `import("oxc-parser")` fail for a reason other than a missing install.
registerHooks({
  resolve: (specifier, context, next) => {
    if (specifier !== "oxc-parser") return next(specifier, context);
    throw Object.assign(new Error("the parser's binding failed to load"), {
      code: "ERR_DLOPEN_FAILED",
    });
  },
});
