# 再帰する Val

`Tree` が `Tree` を持つ型を書けるか。調査と実装の記録。設計判断は `notes/design.md` §3.7（`Rec`）、
§4.3（`DeepReadonly` が開く）、§11.2（判定位置）に移した。ここに残すのは経路と実測だけ。

- 調査日: 2026-09-18、実装 2026-09-19
- 基準: `main`（bc1eeeb、Enum を含む）。TypeScript 5.9.3 / 6.0.3 / 7.0.2

## 1. 結論

**書けるようになった。構造的な制約ではなかった。**

- 実行時のコードは 1 行も変わらない。壁は型エイリアスの解決順だけ
- 入ったのは 3 つ。`Rec<V>`、判定を private フィールドへ移す `Verdict<X>`、キーで見る `IsRec<T>`
- 型コストは**下がった**。core の instantiations 5,694 → 5,400、trait 13,356 → 13,378
- 差分は `src/val.ts` だけ。bundle は変化なし（型だけの差分）

## 2. 素直に書くと落ちる

```ts
type Tree = Val<"app/Tree", { value: number; children: Tree[] }>;
// TS2456 Type alias 'Tree' circularly references itself.
```

payload を interface に切り出しても同じ。`Val` が mapped type で payload を写すので、`Tree` を
解決するのに `Tree` が要る。`Rec<Tree>` は interface への参照なので、そこで切れる。

## 3. 3 つの壁と、その順番

順に潰した。前の 1 つを潰すまで次は見えない。

| 壁                                                   | 症状                       | 直し方                              |
| ---------------------------------------------------- | -------------------------- | ----------------------------------- |
| `Checked<T>` がエイリアス解決中に payload を比較する | TS2456                     | `Verdict<X>` へ移す（design §11.2） |
| `Rec` の判定が型引数を読む                           | TS2615、`next?: Rec<Node>` | `IsRec<T>` をキーで書く（§4.3）     |
| 配列判定が同名プロパティの型を読む                   | TS2456、`entries` だけ     | `number extends keyof T`（§4.3）    |

3 つ目は名前で出る。`kids: Record<string, Rec<Dir>>` は通り、`entries: Record<string, Rec<Dir>>` は
落ちる。`ReadonlyArray` の `entries` と比較するために payload のプロパティを読むからで、index
signature とも optional キーとも関係がなかった。切り分けの初期はそこを疑って外していた。

## 4. 巻き添えで直した穴

`Validate` は index signature を optional キーと見なしていた。`Record<never, never> extends
Pick<T, string>` が true になるため、`Record<string, Money>` が `{ [x: string]: Money | undefined }`
になり、`Object.values` が落ちる（`docs/src/patterns.md` の twoslash が検出）。`Checked` の「妥当なら
`T` をそのまま返す」経路が隠していた。**`Rec` とは独立のバグ。**

```ts
[K in keyof T]: string extends K
  ? Validate<T[K], false>
  : K extends OptionalKeys<T>
```

## 5. 実測

|                     | main     | この変更              |
| ------------------- | -------- | --------------------- |
| `vp test`           | 515      | 529（うち再帰 13 件） |
| core instantiations | 5,750    | 5,733                 |
| trait               | 13,753   | 13,784                |
| enum                | 70,873   | 32,238                |
| `index.d.mts`       | 56.10 kB | 58.82 kB              |
| bundle              | 852 B    | 852 B                 |

**enum が半分以下になった。**Enum は Variant ごとに `Val` を通すので、値の形から検査が消えたぶんが
variant の数だけ効く。調査時のプロトタイプは逆に core +14%、trait は予算残り 6% だった。値の形を
`DeepReadonly<Grounded<T>>` に変えて（検査は verdict だけが持つ）、配列判定を `keyof` にしたぶんが
戻っている。

## 6. 残り

- valof-lint が `Rec` を知らない。`Rec<number>` と `Rec<Other>` を報告する規則（design §14.26）
- 手書きの index signature（`{ readonly [k: string]: Rec<C> }`）は `keyof` に `number` が入るので
  「keys must be strings」で落ちる。`Record<string, …>` なら通る。`Rec` とは独立の既存挙動
- Enum の Variant も `Rec` で再帰する。宣言・構築・`match` まで通る（`tests/enum.test.ts` の
  `recursion`）
