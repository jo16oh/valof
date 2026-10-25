// Keys the library reads and users never write. The entry does not re-export them, so they stay out
// of completions. `Tag` sits in `enum.ts` beside its type.
export const Traits: unique symbol = Symbol();
export const Shared: unique symbol = Symbol();

// Type-only keys.
export declare const RecKey: unique symbol;
export declare const NoSeal: unique symbol;
export declare const Unbuilt: unique symbol;

// Phantom keys: type-only, and private or protected in their class.
export declare const PhantomBrand: unique symbol;
export declare const PhantomPayload: unique symbol;
export declare const PhantomTypes: unique symbol;
export declare const VerdictKey: unique symbol;
export declare const PrivateSealKey: unique symbol;
export declare const PrivateCreateKey: unique symbol;
export declare const UnpatchableKey: unique symbol;
export declare const UnpatchableTypes: unique symbol;
export declare const TagKey: unique symbol;
export declare const TagTypes: unique symbol;
export declare const EnumKey: unique symbol;
export declare const EnumTypes: unique symbol;
export declare const VariantOptionsKey: unique symbol;
export declare const VariantOptionsTypes: unique symbol;
export declare const TraitBrands: unique symbol;
export declare const TraitTypes: unique symbol;
