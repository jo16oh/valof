import { Bundle, Imports } from "./bundle.ts";
import { Suite } from "./suite.ts";
import { budgets, json, over, sizes } from "./format.ts";
import { Result as R } from "better-result";
import { checkProduction, capped, measure, pack } from "./measure.ts";

// `Trait` and `Enum` ship from their own subpath, so a bundle names the module per import.
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

const measured = await R.gen(async function* () {
  yield* R.await(pack());
  const baseImports = yield* Suite.base(suite);
  const results = yield* R.await(Suite.measure(suite, measure));
  const [only, ...more] = results.filter(({ bundle }) => bundle.base);
  // With one base bundle, the base is that bundle, already measured.
  const base =
    only !== undefined && more.length === 0 ? only : yield* R.await(measure(baseImports));
  for (const each of [base, ...results]) yield* checkProduction(each);
  return R.ok({ base, results, extra: base === only ? [] : [base] });
});

if (measured.isErr()) {
  console.error(measured.error.message);
  process.exit(1);
}
const { base, results, extra } = measured.value;

if (process.argv.includes("--json")) {
  console.log(json(results));
} else {
  for (const each of [...extra, ...results]) {
    console.log(sizes(each));
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
