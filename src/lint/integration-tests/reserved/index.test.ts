import { test } from "vite-plus/test";

import { reserved } from "../../scan/index.ts";

test("rejects a reserved name left without a pattern, and a pattern that is no reserved name", () => {
  // @ts-expect-error `create` has no pattern.
  reserved(["patch", "seal"]);
  // @ts-expect-error `nope` is not reserved.
  reserved(["patch", "seal", "create", "nope"]);
});
