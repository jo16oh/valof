import { Enum, Val } from "../../index.ts";
import type { Project } from "../files.ts";
import type { Finding } from "../index.ts";

/** What the plugin asks the worker about one file. */
export type Query = Val<
  "Query",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: Project;
    file: string;
    text: string;
  }
>;
export const Query = Val.companion<Query>().build();

/** What the worker answers, the findings or the message to throw. */
export type Reply = Enum<"Reply", { Found: { findings: Finding[] }; Failed: { message: string } }>;
export const Reply = Enum.companion<Reply>().build();

/** The findings for one query, under the key the next query is compared by. */
export type Answer = Val<"Answer", { key: string; findings: Finding[] }>;
export const Answer = Val.companion<Answer>().build();
