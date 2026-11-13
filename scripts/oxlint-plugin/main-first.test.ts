import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { mainFirst } from "./main-first.ts";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester().run("main-first", mainFirst, {
  valid: [
    'import { a } from "a";\nasync function main() {}\nconst X = 1;\nawait main();',
    "function main() {}\nmain();",
    'export { a } from "a";\nfunction main() {}\nif (import.meta.main) {\n  await main();\n}',
    "const X = 1;\nfunction f() {}",
  ],
  invalid: [
    { code: "const X = 1;\nfunction main() {}\nmain();", errors: [{ messageId: "first" }] },
    { code: "function main() {}\nconst X = 1;", errors: [{ messageId: "last" }] },
    { code: "function main() {}\nmain();\nconst X = 1;", errors: [{ messageId: "last" }] },
  ],
});
