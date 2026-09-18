# Enum 実装計画

設計は `design.md` §15.2。型は 2026-09-16 に probe で確かめ済み（TS 7.0.2 / 6.0.3 / 5.9.3）。ここは
手順だけを書く。判断の理由は §15.2 にある。

## 置き場所

`src/enum.ts` に書き、`src/experimental.ts` から export する。Trait の隣。`valof` 本体のバンドルは
変わらない。

`src/enum.ts` は `val.ts` と `trait.ts` から直接 import する。`DeepReadonly`、`Patch`、`Invalid`、
`FinalsOf`、`Implement`、`MembersOf`、`TraitCompanion`、`Unbound` は公開 API に出ていないが、
ライブラリ内部なので問題ない。

## 1. 型

probe から移す。名前は `Sealer` / `Companion` の系統に揃える。

| 型                                             | 役目                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `EnumPhantom<K,V,S,Tr,Tag>`                    | 宣言を union から復元するための private / protected クラス    |
| `AnyEnum`                                      | 制約。壊れた宣言はこれを満たさない                            |
| `Tag<T>`                                       | タグ名を渡すマーカー。private メンバ 1 つ、`keyof` から消える |
| `Enum<K,D,X>`                                  | 宣言。型引数は 3 つ                                           |
| `VariantOf<E,N>`                               | Variant 1 つ。**トップレベルを交差にする**（名前が残る）      |
| `VariantsOf` / `TagOf` / `NameOf` / `SharedOf` | phantom から読む                                              |
| `SeedFor<E,N>`                                 | コンストラクタが取る payload。タグ抜き、共通フィールド込み    |
| `Handlers` / `Only`                            | `match` のハンドラと、知らないキーを落とす検査                |
| `Constructors<E,VM>`                           | Variant の枠。コンストラクタ + 自分のメンバ + `patch`         |
| `EnumCompanion` / `EnumBuilder`                | companion と、steps の付いたビルダー                          |

踏む地雷が 3 つある。どれも probe で踏んだ。

- **`Enum` のトップレベルを条件型にしない。**エイリアス名が落ち、利用者の `.d.ts` が union を展開して
  `Phantom` に当たる（§15.2「トップレベルを条件型にすると宣言出力が壊れる」）。Fault は各 Variant の
  ブランド位置へ
- **`VariantOf` を `Extract` で書かない。**同じ型になるが、エラーに展開した交差が出る
- **`SeedFor` を `SeedOf<VariantOf<…> & AnyVal>` から作らない。**`PayloadOf` が 2 つ目の `Phantom` から
  `unknown` を拾い、種が `{}` に潰れて `patch` が何でも受ける。`DeepReadonly<V[N] & S>` と宣言から組む

`Fault` が見るもの: Variant 名が `match` / `impl*` / `__valof_*`、payload がオブジェクトでない、
タグ名が payload か共通フィールドのキーと衝突。

## 2. 実行時

`Enum.companion<E>(tag?)` は proxy を返す。`get` の順は、steps が登録したメンバ、`match`、
`__valof_traits`、それ以外は Variant の枠。

**Variant の枠は `Map` に記憶する。**アクセスのたびにクロージャ一式を作り直さないため。同一性のためでは
ない（§15.2）。枠の中身は 3 つ。

- コンストラクタ: `{ ...payload, [tag]: name }` を組んで、既定の seal に通す
- `patch`: タグを含めずに merge して seal し直す。タグは型で届かないので実行時の検査は要らない
- `implVariant` が登録したメンバ

**`get` は symbol を `undefined` で返し、`then` も返さない。**proxy は Variant 名を知らないので、
どんなキーにもコンストラクタを作ってしまう。`then` を返すと companion が thenable に見え、
`await` や `Promise.resolve` が壊れる。`then` という Variant は型が宣言の位置で落とす
（design.md §15.2）。Val のメンバ名、Trait のメンバ名も同じ。

**`match` は `handlers[value[tag]](value)`。**カリー化しない。

**trait。**`implTrait` は `val.ts` の `attach` と同じく、trait の `__valof_shared` と Val 側の実装を
混ぜて `__valof_traits` に置く。`Trait.dyn` はそこを読む。

## 3. 順序

1. `src/enum.ts` に型だけ書き、`tests/enum.test.ts` を `expectTypeOf` で埋める。probe の主張をそのまま
   移す（宣言、`match` の絞り込みと exhaustive、共通フィールド、trait、`VariantOf`、patch 境界、
   Fault 6 種）
2. 実行時を書く。テストは値の振る舞い（コンストラクタ、`match`、`patch`、`implVariant`、`dyn`、
   ネストした Variant の置換、`equals`）
3. `src/experimental.ts` から export
4. **利用者側の `declaration: true` を確かめる。**`scripts/ts-compatibility/` の隣に置くか、既存の
   仕組みに乗せる。`export const Shape = Enum.companion<Shape>()` を含むファイルを `dist` に対して
   `tsc --declaration` に掛け、TS4094 / TS4023 が出ないことを見る。**型検査だけでは出ない**
5. `ne vp run bundle-size`。`scripts/bundle-size.ts` の `entries` に `enum` と、`all` への追加。
   予算は `trait` と同じ形で `BUDGET_VAL_GZIP + n`。実測してから決める
6. `ne vp run type-perf`。`scripts/type-perf/fixtures/enum.ts` を足す。probe の実測は Variant 2 個で
   約 4,600 instantiation、12 個で約 9,600。`trait` の 15,000 と同じ桁
7. docs。`docs/src/enums.md` と `SUMMARY.md`。`traits.md` の隣
8. `design.md` §9 の Enum の項を閉じる

## 4. lint（別 PR）

Trait のときと同じ量。既存規則を Enum の構文に広げるのが主で、判断は変わらない。

- `brand-mismatch`: `Enum<"Shape", …>` と `type Shape`
- `companion-mismatch` / `split-companion` / `duplicate-brand` / `unnecessary-alias`: Enum の宣言と
  `Enum.companion` を認識させる
- `unused-member`: `implVariant` が登録したメンバは `Shape.Circle.diameter` と `Circle.diameter` の
  2 経路で読まれる。Trait の final と同じ扱い
- **新規 1 本**: Variant に別の companion を立てる（`Val.companion<VariantOf<…>>` /
  `Val.sealer<VariantOf<…>>`）。型では塞げない
- `bypassed-companion`: `Val.of` で Variant を作る形に広げる
- **`tag-mismatch` は要らない。**型が落とす（§15.2）

## 5. 決まっていないこと

- **Variant のメンバを持つ枠の名前。**`implVariant` で進める。`implTrait` / `implSeal` の系統に揃う。
  実装中に読みにくければ変える
- **`match` に fallback を足すか。**足さない。条件が要るなら ts-pattern（§15.2）。実利用を見てから
- **Variant に `create` / `implSeal` を出すか。**出さない。既定の seal だけ

## 6. §15.4 との関係

**前提ではない。**Enum の steps（`impl` / `implVariant` / `implTrait`）はコールバック形 1 本で出す。
自分の `match` を参照するのが普通の書き方で、オブジェクト形だと TS7022 で止まるため。`val.ts` 側の
§15.4 は別の作業で、Enum を待たせない。形だけ揃えておく。
