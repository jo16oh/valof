import { Bundle, Imports, Registry } from "./schema.ts";
import { budgets, json, over, sizes } from "./format.ts";
import { assertProduction, capped, measure, pack } from "./measure.ts";

// `Trait` and `Enum` ship from their own subpath, so a bundle names the module per import.
const registry = Registry([
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

await pack();

const baseImports = Registry.base(registry);
const results = await Promise.all(
  registry.map(async (bundle) => ({
    bundle,
    ...(await measure(bundle.base ? bundle.imports : Imports.merge(baseImports, bundle.imports))),
  })),
);
const [only, ...more] = results.filter(({ bundle }) => bundle.base);
// With one base bundle, the base is that bundle, already measured.
const base = only !== undefined && more.length === 0 ? only : await measure(baseImports);

for (const measured of [base, ...results]) assertProduction(measured);

if (process.argv.includes("--json")) {
  console.log(json(results));
} else {
  for (const measured of base === only ? results : [base, ...results]) {
    console.log(sizes(measured));
    console.log();
  }
  console.log(budgets(results, base));
}

const exceeded = results.filter((result) => capped(result, base) > result.bundle.budget);
if (exceeded.length > 0) {
  console.error();
  for (const result of exceeded) console.error(over(result, base));
  process.exit(1);
}
