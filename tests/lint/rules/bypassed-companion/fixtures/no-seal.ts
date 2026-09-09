import { Val } from "valof";

type Row = Val<"Row", { id: string }>;

const Row = Val.companion<Row>().impl({
  id: (r) => r.id,
});

export const lift = (raw: { id: string }): string => Row.id(Val.of<Row>(raw));
