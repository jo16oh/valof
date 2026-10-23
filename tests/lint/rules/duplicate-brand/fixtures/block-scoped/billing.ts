describe("one", () => {
  type Id = Val<"Id", string>;
  const Id = Val.companion<Id>().build();
});
