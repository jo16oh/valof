// The API surface a consumer touches, typechecked against the published `dist/index.d.mts` by
// `vp run ts-compatibility`. The tsconfig beside it aims `valof` there.
//
// Not a copy of the README's examples. It changes when the API does, not when the prose does.
import {
  Trait,
  Val,
  type Companion,
  type Dyn,
  type Final,
  type PayloadOf,
  type Patch,
  type SeedOf,
  type Self,
} from "valof";

type City = Val<"City", { name: string; zip?: string }>;
const City = Val.sealer<City>();

type Shop = Val<
  "Shop",
  {
    id: string;
    owner: { name: string; contact: { email: string; phone?: string } };
    city: City;
    tags: readonly string[];
    at: readonly [City, number];
    staff: Readonly<Record<string, { role: string }>>;
  }
>;

const Shop = Val.sealer<Shop>().impl({
  label(s) {
    return s.id; // contextual typing: `s` needs no annotation
  },
});

declare const shop: Shop;

export const patched = [
  Shop.patch(shop, { owner: { contact: { email: "a@example.com" } } }),
  Shop.patch(shop, { owner: { contact: { phone: undefined } } }),
  Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) }),
  Shop.patch(shop, { staff: { u1: { role: "chef" }, u2: undefined } }),
  Shop.update(shop, (s) => ({ ...s, id: "x" })),
];

// @ts-expect-error a required key cannot be deleted, however deep it sits
Shop.patch(shop, { owner: { contact: { email: undefined } } });
// @ts-expect-error excess-property checking reaches the nested literal
Shop.patch(shop, { owner: { contact: { fax: "1" } } });
// @ts-expect-error a Val takes a Val, not a patch
Shop.patch(shop, { city: { name: "Osaka" } });
// @ts-expect-error a plain payload is not a Val
export const wrong: City = { name: "Kyoto" };

declare const patch: Patch<SeedOf<Shop>>;
export const email = patch.owner?.contact?.email;
export const name: PayloadOf<City>["name"] = shop.city.name;
export const positioned: readonly [City, number] = shop.at;
export const companion: Companion<City, Record<never, never>> = City;

type Named = Trait<
  "Named",
  { name: string },
  {
    greet: (self: Self) => string;
    label: (self: Self, prefix: string) => string;
    shout: Final<(self: Self) => string>;
  }
>;

const Named = Trait.companion<Named>().impl({
  greet: (n) => `Hi, ${n.name}`,
  shout: (n) => n.name.toUpperCase(),
});

type Person = Val<"Person", { id: string; name: string }, Named>;
const Person = Val.sealer<Person>().implTrait(Named, {
  label: (p, prefix) => `${prefix}${p.id}`,
  greet: (p) => `Hello, ${p.name}`,
});

declare const person: Person;

export const traitMembers = [
  Person.greet(person),
  Person.label(person, "#"),
  Person.shout(person),
  Named.shout(person),
];
export const boxed: Dyn<Named> = Named.dyn(Person, person);
export const boundMembers = [boxed.greet(), boxed.label("#"), boxed.shout()];

type Identified = Trait<"Identified", { id: string }, { identify: (self: Self) => string }>;
type Item = Val<"Item", { id: string }, Identified>;
export const Item = Val.sealer<Item>().implTrait<Identified>({ identify: (item) => item.id });

// @ts-expect-error a Val must declare a trait before it implements it
Val.companion<City>().implTrait(Named, { label: (city, prefix) => `${prefix}${city.name}` });
// @ts-expect-error a Final member cannot be replaced by a Val
Val.companion<Person>().implTrait(Named, { label: () => "", shout: () => "" });
