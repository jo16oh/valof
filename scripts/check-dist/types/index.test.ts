import { expect, test } from "vite-plus/test";

import { Counts } from "./index.ts";

test("reads the counts tsc prints, over a baseline", () => {
  const counts = Counts.fromDiagnostics(
    "Files: 3\nTypes:  427\nInstantiations:  1763\nCheck time:  0.31s\nTotal time:  0.90s\n",
  );
  expect(counts).toEqual({ types: 427, instantiations: 1763, check: 0.31, total: 0.9 });

  const baseline = Counts.seal({ types: 86, instantiations: 100, check: 0.1, total: 0.2 });
  expect(Counts.above(counts, baseline)).toEqual({
    types: 341,
    instantiations: 1663,
    check: 0.31,
    total: 0.9,
  });
});
