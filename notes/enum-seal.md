# Enum のカスタム seal

判断の理由は `design.md` §15.2「検討中: Variant ごとの seal と union の `seal`」。ここは形と手順。
**まだ実装しない。**§9 の未解決項目。

## 何を足すか

`Val` の `sealer` / `companion` の対称を Enum に持ち込む。新しい語彙は増やさない。

- `Enum.sealer<E>()`: 全 Variant が callable、既定 seal のみ。`implSeal` は無い
- `Enum.companion<E>()`: 全 Variant が `.create`。Enum レベルの `implSeal` を持つ
- `implVariant`: Variant 1 つを名前と callback で受ける。builder は callback の中にしか無い
- 境界の入口: タグで枠を引き、その Variant の seal に委ねる。`Enum.sealer` は companion 自体が
  callable、`Enum.companion` は `seal`

```ts
type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }, { id: string }>;

const Shape = Enum.companion<Shape>()
  .implSeal((p, seal) => (p.id ? seal(p) : new RangeError("id must not be empty")))
  .implVariant("Circle", (b) =>
    b.implSeal((p, seal) => (p.r > 0 ? seal(p) : new RangeError("r must be positive"))).impl(),
  )
  .implVariant("Square", (b) => b.impl({ diagonal: (s) => s.side * Math.SQRT2 }))
  .impl();

Shape.Circle.create({ r: 2, id: "c1" }); // Circle | RangeError
Shape.seal(fromWire); // タグで分ける。戻りは Variant の union
```

## 値の形は採らない

`Circle: Shape.Circle.implSeal(…)` のように、公開された枠から鎖を伸ばす形を検討して落とした。枠は
companion に載ったまま残るので、`Shape.Circle.implSeal(evil)` が定義の外で通る。同じ型に 2 つ目の
コンストラクタが立つ。`Val.sealer<VariantOf<…>>()` の偽造と違い、これは公開 API の補完に並ぶ。

builder を `implVariant` の callback にだけ渡せば、その経路が型に現れない。`implTrait` が trait の
companion を引数で受けるのと同じ形。

## 鎖を閉じる

今は `impl` も `implVariant` も `implTrait` も `EnumBuilder` を返す。export した companion にステップが
載ったままなので、`implSeal` を足すとそこが穴になる。

```ts
export const Shape = Enum.companion<Shape>().implSeal(strict);
Shape.implSeal((p, seal) => seal(p)); // 検査を外した別の Shape
```

`Val` は `Sealer.impl()` が `Sealed` を返して閉じる。Enum も `impl` で閉じ、`implSeal` /
`implVariant` / `implTrait` だけが `EnumBuilder` を返す。union メンバが無ければ `impl()`。
**seal より先、単独でマージできる。**

代償は `Val` と同じで、`implVariant` の callback から `impl` のメンバを読めないこと。

## タグを第 3 引数へ

`Tag<T>` は宣言のレコード（第 2 引数）ではなく、共有フィールドと trait の側（第 3 引数）に置く。タグは
全 Variant が持つフィールドそのもので、`Fault` の「タグが共有フィールドと同名」の検査も同じ引数の中で
閉じる。probe 済み: `TagIn<X>` は `"kind"`、`keyof (Tag<"kind"> & { id: string })` は `"id"` だけ、
`X` を省いたときの既定も `"_tag"` のまま。

```ts
type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
```

**これも seal とは独立。**単独でマージできる。

## 対称にする理由

`Enum.companion` で `b.sealer()` を許すと、`Shape.Circle({ r: 2 })` と `Shape.Square.create({ … })` が
並ぶ。呼び分けが型を読むまで分からない。既定でいい Variant は `implVariant` に書かなければいいだけで、
書く量は増えない。

引っかかるのは 12 個のうち 1 個に seal を付けたいとき。全部が `.create` になる。`Val` が 1 つの型で
払っているのと同じ代償だが、Enum では Variant の数だけ増える。実利用で刺さったら `Enum.companion` の
側だけ緩められる。緩めるのは後方互換、締めるのは違う。

## Enum の seal と Variant の seal

**Enum の seal は共有フィールドを検査する用。**Variant の seal と競合させない。合成を Enum 側で
やることはできない: Variant の seal が返すのはユーザーの型で、`val.ts` はその中を見ない
（{@link Constructed}）。`Result` を受け取った Enum の seal は成功かどうかを判定できない。

**渡せば 1 本になる。**Variant の seal の第 2 引数を、既定 seal ではなく「Enum の seal を通してから既定
seal」にする。実行の順は Variant、Enum、既定。合成はユーザーが `seal(p)` の戻りを見て書く。Variant の
`.seal` を直接呼んでも Enum の検査は通る。

Variant の seal を書かなかった Variant は、Enum の seal がそのまま seal になる。

## 型

`val.ts` の `SealImpl` / `CheckedSeal` / `Constructed` を Variant ごとに借りる。新しい機構は要らない。

| 型                   | 役目                                                          |
| -------------------- | ------------------------------------------------------------- |
| `VariantSteps<E,N>`  | `implVariant` の callback が受ける `b`。`impl` / `implSeal`   |
| `SealedPayload<E>`   | Enum の seal と境界の入口の入力。タグ付きのペイロードの union |
| `Constructors<E,VM>` | `N extends keyof VM ? VM[N] : DefaultFrame<E, N>`             |

**枠の形は callback の戻り値そのもの。**callable か、`.seal` があるかが Variant ごとに違う。今より
素直だが、Variant ごとに Val の companion 型を 1 つ実体化する。

**`seal` の入力はタグを含む。**枠を引くのがタグなので、書き換えられる形にはしない。`create` がタグを
入れた後の payload なので、Enum の seal が見るものと同じ型になる。

```ts
type SealedPayload<E> = {
  [N in keyof VariantsOf<E>]: SeedFor<E, N> & { [P in TagOf<E>]: N };
}[keyof VariantsOf<E>];
```

**戻り値は Variant ごとの seal の union。**`match` と同じ規則。

## 実行時

**`Enum.companion` の Variant は `Val.companion` の鎖をタグの分だけ進めたもの。**`val.ts` にフックは要らない。

```ts
Val.companion<VariantOf<E, N>>()
  .implCreate((seed: SeedFor<E, N>) => ({ ...seed, [tag]: name }))
  .fixed<typeof tag>();
```

タグが `patch` に届かないのは `fixed` が止めるから（`val.ts` の `Derivable`）。`implCreate` と `fixed` は
Variant に出さない。タグのために使い切っている。

**`implSeal` だけは Enum が挟む。**Val の seal の枠は 1 つしかないので、`ctors.seal` に
`(p, terminal) => variantSeal(p, (x) => enumSeal(x, terminal))` を組んで渡す。`VariantSteps` は
`CompanionBuilder` の薄い包みで、`implSeal` を横取りし、`impl` だけ素通しする。

`Enum.sealer` の側は今の `frame()` の包みがそのまま残る。callable、既定 seal、`patch`。

**`nocopy` は自然に付く。**`val.ts` の `attach` が `create` と custom seal の両方に生やしている。
Variant の枠が Val の companion なので、追加の実装は要らない。

境界の入口は `frames[value[tag]]` の seal に委ねる。数十バイト。`Enum.sealer` では proxy の `apply`、
`Enum.companion` では `get` の `seal`。

**`get` の順に `seal` が入る。**steps が登録したメンバ、`match`、`seal`、`__valof_traits`、それ以外は
Variant の枠。

## 予約名

`seal` を Variant 名とメンバ名の両方で落とす。今の `Fault` は Variant 名が `match` / `impl*` /
`__valof_*`、それに `then`。`seal` を同じ一覧に足す。実行時の proxy のガードも同じ。

## 順序

1. `impl` で鎖を閉じる。型だけの変更。単独でマージできる
2. タグを第 3 引数へ。`docs/src/enums.md` とテストが動く。単独でマージできる
3. `Fault` に `seal` を足し、テストを 1 本足す
4. `Enum.sealer` を足し、`implVariant` を builder callback 形にする。ここまでカスタム seal は無い
5. `Enum.companion` の `implSeal` と境界の入口。型を書き、`tests/enum.test.ts` を `expectTypeOf` で
   埋める。カスタム seal の戻り値、`seal` の入力がタグを要求すること、`patch` が差し替えに従うこと
6. 実行時。テストは値の振る舞い（Variant、Enum、既定の順で走る、`.seal` を直接呼んでも Enum の検査が
   通る、境界の入口の分岐）
7. `ne vp run bundle-size`。予算は `Val` + `Enum` の 1.10 kB gzip から動く。実測してから決める
8. `ne vp run type-perf`。Variant ごとに Val の companion 型が増えるので、45,000 の予算を確かめ直す
9. docs。`docs/src/enums.md` に節を 1 つ。`custom-constructors.md` から `{@link}` ではなくリンク
10. `design.md` §9 の項目を閉じ、§15.2 の見出しから「検討中」を外す

## Variant ごとの `implTrait` は出さない

builder が Val の鎖を持つので自然に生えるが、出さない。抽象化はすでに Enum が 1 つ与えている。その下の
Variant 単位で trait を実装して嬉しい場面が挙がらない。Enum レベルの `implTrait` が同じ trait を実装した
ときどちらが勝つか、という規則も要らなくなる。

`VariantSteps` は `impl` と `implSeal` だけを持つ。

## 境界の入口も対称にする

`Enum.sealer` は companion 自体を callable にする。`Enum.companion` は `seal` を生やす。`Val` の
`sealer` が callable で `.seal` を持たないのと同じ形。

```ts
Enum.sealer<Shape>(); // Shape.Circle({ r: 2 }) / Shape(fromWire)
Enum.companion<Shape>(); // Shape.Circle.create({ r: 2 }) / Shape.seal(fromWire)
```

どちらもタグで枠を引き、その Variant の seal に委ねる。**Variant のカスタム seal が 1 つも無くても出す。**
`Enum.companion` は共通フィールドの検査という責務を持つし、既定の seal でも境界の分岐は消える（§15.2）。
Val の `Companion.seal` がカスタム seal のときだけ生えるのと違う点。

## lint

保留。`bypassed-companion` を Variant のカスタム seal に広げるかは、実装計画 §4 の新規規則と一緒に見る。
