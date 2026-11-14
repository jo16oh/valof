import * as domain from "./declaration.ts";

domain.Named.dyn(domain.User, user).name;

declare const user: domain.User;
