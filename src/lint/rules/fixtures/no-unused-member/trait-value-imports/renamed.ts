import { Friendly as Renamed, User as Person } from "./declaration.ts";

Person.dyn<Renamed>(person).greet;

declare const person: Person;
