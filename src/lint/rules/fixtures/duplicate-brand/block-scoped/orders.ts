import { Val } from "valof";
describe("two", () => {
  type Id = Val<"Id", string>;
  const Id = Val.companion<Id>().build();
});

declare function describe(name: string, body: () => void): void;
