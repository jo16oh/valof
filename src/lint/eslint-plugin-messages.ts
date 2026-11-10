import { Enum, Val } from "../index.ts";
import type { Finding } from "./index.ts";

/** What the plugin asks the worker about one file. */
export type Ask = Val<
  "Ask",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: string[];
    file: string;
    text: string;
  }
>;
export const Ask = Val.companion<Ask>().build();

/** What the worker answers, the findings or the message to throw. */
export type Reply = Enum<"Reply", { Found: { findings: Finding[] }; Failed: { message: string } }>;
export const Reply = Enum.companion<Reply>().build();
