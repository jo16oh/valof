import { Bundle, Imports } from "./bundle.ts";
import { Cli } from "./cli.ts";
import { Suite } from "./suite.ts";

const suite = Suite.seal([
  Bundle.seal({
    key: "val",
    name: "Val",
    base: true,
    imports: Imports.seal({ "./dist/index.js": ["Val.companion"] }),
    budget: 1024,
  }),
  Bundle.seal({
    key: "equals",
    name: "Equals",
    imports: Imports.seal({ "./dist/index.js": ["equals"] }),
    budget: 256,
  }),
  Bundle.seal({
    key: "trait",
    name: "Trait",
    imports: Imports.seal({ "./dist/experimental.js": ["Trait.companion"] }),
    budget: 256,
  }),
  Bundle.seal({
    key: "enum",
    name: "Enum",
    imports: Imports.seal({ "./dist/experimental.js": ["Enum.companion"] }),
    budget: 640,
  }),
  Bundle.seal({
    key: "features",
    name: "Equals + Enum + Trait",
    imports: Imports.seal({
      "./dist/index.js": ["equals"],
      "./dist/experimental.js": ["Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
  Bundle.seal({
    key: "all",
    name: "All",
    imports: Imports.seal({
      "./dist/index.js": ["equals", "Val.of", "Val.unwrap"],
      "./dist/experimental.js": ["Enum.companion", "Trait.companion"],
    }),
    budget: 1024,
  }),
]);

await Cli.run(suite);
