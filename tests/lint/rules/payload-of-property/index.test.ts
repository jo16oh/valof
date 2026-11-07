import { expect, test } from "vite-plus/test";

import { PayloadOfProperty, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports PayloadOf inside a payload, and spares it as the payload or its base", async () => {
  expect(await lint("order")).toEqual([
    { rule: PayloadOfProperty, at: "order.ts:5:43" },
    { rule: PayloadOfProperty, at: "order.ts:5:77" },
    { rule: PayloadOfProperty, at: "order.ts:11:47" },
  ]);
  expect((await messages("order"))[0]).toBe(
    "Order holds PayloadOf<Money>, which drops Money's brand and its seal; hold Money",
  );
});

test("follows a Payload alias of PayloadOf one step", async () => {
  expect(await lint("aliased")).toEqual([{ rule: PayloadOfProperty, at: "aliased.ts:7:47" }]);
});
