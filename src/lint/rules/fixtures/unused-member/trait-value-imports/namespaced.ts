import * as domain from "./declaration.ts";

domain.User.dyn<domain.Named>(user).name;

declare const user: domain.User;
