import { expect, test } from "vite-plus/test";

import { InternalImport, fixtures } from "../integration-tests/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports an import or a re-export from `valof/internal/*`, and spares one from `valof`", async () => {
  expect(await lint("imports")).toEqual(
    ["2:29", "3:15", "4:29", "5:27"].map((at) => ({
      rule: InternalImport,
      at: `imports.ts:${at}`,
    })),
  );
  expect((await messages("imports"))[0]).toBe(
    "`valof/internal/*` is exported for declaration output, and can change in any release; import from `valof`",
  );
});
