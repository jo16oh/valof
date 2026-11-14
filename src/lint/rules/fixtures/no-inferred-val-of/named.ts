import { Val } from "valof";

type Token = Val<"Token", string>;

export const token = (raw: string): Token => Val.of<Token>(raw);
