import { Val } from "valof";
describe("one", () => {
  type Id = Val<"Id", string>;
  const Id = Val.companion<Id>().build();
});

declare function describe(name: string, body: () => void): void;
