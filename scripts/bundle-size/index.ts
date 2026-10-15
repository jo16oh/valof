import { Bundle, Imports } from "./bundle.ts";
import { Cli } from "./cli.ts";
import { Suite } from "./suite.ts";

const suite = Suite([
  Bundle({
    key: "val",
    name: "Val",
    base: true,
    imports: Imports({ "./dist/index.mjs": ["Val"] }),
    budget: 1024,
  }),
  Bundle({
    key: "equals",
    name: "Equals",
    imports: Imports({ "./dist/index.mjs": ["equals"] }),
    budget: 256,
  }),
  Bundle({
    key: "trait",
    name: "Trait",
    imports: Imports({ "./dist/experimental.mjs": ["Trait"] }),
    budget: 256,
  }),
  Bundle({
    key: "enum",
    name: "Enum",
    imports: Imports({ "./dist/experimental.mjs": ["Enum"] }),
    budget: 640,
  }),
  Bundle({
    key: "all",
    name: "All",
    imports: Imports({
      "./dist/index.mjs": ["equals"],
      "./dist/experimental.mjs": ["Enum", "Trait"],
    }),
    budget: 1024,
  }),
]);

await Cli.run(suite);
