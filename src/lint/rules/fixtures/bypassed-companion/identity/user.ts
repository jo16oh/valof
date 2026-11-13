import { Val } from "valof";
import { type Shared as B } from "./b.ts";
import * as b from "./b.ts";

Val.of<B>({});
Val.of<b.Shared>({});
