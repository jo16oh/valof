# valof — 設計メモ

TypeScript 向け値オブジェクトライブラリの設計記録。

- **パッケージ名**: `valof`（npm 空き確認済み）
- **主要エクスポート**: `Val`（型 + 名前空間）

```ts
import { Val } from "valof";
```

詳細は §12。

---

## 1. 設計思想

> **値はプレーンなデータであり、振る舞いは外にある。**

この一行から、以下の設計判断がすべて導かれる。

値をプレーンなオブジェクト・配列・プリミティブに限定することで、次の性質が保証される。

- `structuredClone` を通る
- `JSON.stringify` / `JSON.parse` を対称に往復する
- React の state や Redux のストアにそのまま置ける
- イミュータブル更新でプロトタイプが落ちない
- ブランドはファントム型なので、実行時にコストもなければ痕跡も残らない

コンストラクタは引数をディープコピーする（§4.1）。ゼロコストではないが、これは
「値はデータである」を実行時にも成立させるための最小限の代償である。

class ではこのいずれも得られない。逆に、この線を守るために諦めたものが §7 にまとめてある。

---

## 2. 基本 API

```ts
export type User = Val<
  "app/User",
  {
    id: string;
    name: string;
  }
>;

export const User = Val.sealer<User>().impl({
  greet(u: User) {
    console.log(`Hi, I'm ${u.name}.`);
  },
});

const user = User({ id: "a", name: "bob" });
User.greet(user);
```

`Val.sealer<V>()` がコンストラクタで、`.impl({...})` がそこに振る舞いを付ける。
コンストラクタを渡したくない型は `Val.companion<V>().impl({...})` を使う（→ §6.1）。
2 段になっているのは TS に型引数の部分推論がないためで、経緯は §13.1。

### 2.1 ブランド

ライブラリ内部に固定のファントム文字列キーを持ち、値は文字列リテラルとする。

```ts
type Val<K extends string, T> = DeepReadonly<T> & {
  readonly __valof_internal_phantom_brand: K;
  readonly __valof_internal_phantom_payload: T;
};
```

`__valof_internal_phantom_payload` は実装時に追加した 2 本目のファントムキー。ペイロード型 `T` を
復元するためだけに存在する。これがないと `Val<"IsoDate", string>` のようなプリミティブを
包んだ Val からコンストラクタの引数型を導けない（`Omit` はプリミティブに効かない）。
どちらも実行時には存在しない。

- 判別が文字列リテラルなので、型ごとに `declare const XxxBrand: unique symbol` を書く必要がない
- 衝突は同名の文字列同士のみ。`"app/User"` のように名前空間を付ける命名規約を推奨する

symbol / 文字列を利用者に選ばせる案は却下。API 表面が増えるだけで、上のハイブリッドが両方の利点を持つ。

#### なぜ `unique symbol` をやめたか

当初はキーを非公開の `unique symbol` にしていた。ユーザーのプロパティと絶対に衝突しない
という利点があったが、**valof を使うライブラリが `declaration: true` でビルドできない**
という致命的な問題があった。

```
error TS4023: Exported variable 'User' has or is using name '__brand'
from external module ".../valof/dist/index" but cannot be named.
```

`export const User = Val.sealer<User>().impl({...})` を再エクスポートするという、
まさに想定される使い方で発生する。symbol を `export` するだけでは直らない。TypeScript は
宣言を出力するファイルで名前が**スコープに入っている**ことを要求するため、利用者が
`import { __brand, __payload }` を書く羽目になる。

ブランドはどのみち実行時に存在しないので、衝突耐性は symbol であること自体ではなく
**名前の長さ**で買える。`__valof_internal_phantom_` 接頭辞を実際のプロパティ名に使う者は
いない。`phantom` を名前に入れているのは、ホバーやエラーメッセージでこのキーに出くわした
人が実行時に探しに行かないようにするため。

代償として文字列キーは `keyof Val<...>` に現れる。ペイロードのキーだけが欲しい場面では
`PayloadOf<V>` / `SeedOf<V>` を使う（`with` / `update` は元からこちらを経由している）。

### 型名の規約

`-Of` は「Val から射影して取り出したもの」を意味する。したがって `PayloadOf<V>` /
`SeedOf<V>` は Val を受け取る。`Patch<T>` は Val ではなくペイロード型を受け取るので
接尾辞を持たない。この違いは意図的で、カスタム `with` がフィールドの部分集合に対する
patch を受け取れるのはこのためである（生成された `id` を patch 対象から外す用途）。

`Sealer` / `Sealed` / `Companion` / `CompanionBuilder` も Val を受け取るが、値から
取り出したものではなくコンパニオン機構の形なので接尾辞は付かない。

ブランドはファントム型であり、**実行時には存在しない**。この事実が §5・§7.6 の制約の根拠になる。

### 2.2 `Val.of`

**既定の seal を、型を明示して呼ぶ形。** brand してディープコピーする、という操作は
3 か所に現れるが、どれも同じもので、違うのは型がどこから来るかだけ:

|                               | 型の出どころ                 |
| ----------------------------- | ---------------------------- |
| `Val.sealer<V>()` の callable | sealer が持っている          |
| `implSeal` の第 2 引数        | 登録先の型に束縛済み（§6.8） |
| `Val.of<V>(x)`                | 呼び出し側が型引数で書く     |

```ts
Val.of<User>({ id: "a", name: "alice" });
```

したがって `Val.of` は「seal を迂回する関数」ではない。カスタム seal を持たない型に
とっては正規のコンストラクタであり、境界での持ち上げ（§8.3）も設計上の正解。カスタム
seal を持つ型に対して使ったときだけ、「その型の seal ではなく既定の seal で封をする」
＝検査を飛ばす、という帰結になる。**逃げ道であることは事実だが、逃げ道であることが
本質ではない。**

（この整理はパッケージ名にも効く。`valof` が指しているのは逃げ道ではなく、
「値を作る操作」そのもの。`Val.of` を `Val.lift` などに改名すると §12 が名前の利点に
挙げた「パッケージ名が API に現れる」が消えるだけなので、改名しない。）

---

## 3. 許可型

コンストラクタと `Val.of` が受け取れる型を以下に制限する。

```ts
type Primitive = string | number | boolean | bigint | null;
```

`undefined` は値として許可しない（→ §3.5）。

**プレーンなネストしたオブジェクトは禁止。ネストは必ず Val にする。**

### なぜこの制限か

1. **型推論コストが下がる** — DeepReadonly の再帰が 1 段で止まる（子は既に readonly な Val）。条件型が浅くなるので `tsc` が重くならない。
2. **構造的等価性が well-defined になる** — プロトタイプ持ちや循環参照を考えなくてよい。
3. **シリアライズ境界を必ず通る** — `structuredClone` / JSON が常に安全。
4. **設計として正しい方向に寄る** — Val の合成が強制されるので、DDD 的にまともな構造になる。

`ReadonlyArray` と `Record` は再帰的に定義する。これがないと `readonly string[][]`（行列・グリッド）や `Readonly<Record<string, Val>>`（ID 索引）が書けない。各ノードは浅いので、再帰があっても破滅的なコストにはならない。

### 移行の摩擦

API レスポンスや既存コードのプレーンなネストオブジェクトは、そのまま渡せない。seal の中で子 Val を組み立てる作業が発生する。

思想としては正しいが、**README の冒頭でこの制限の理由を説明しないと初見で離脱される**。最優先で書く。

### プリミティブを直接包める

```ts
export type IsoDate = Val<"IsoDate", string>;
```

これは重要なユースケース（§8.2）。

### 3.5 `null` と `undefined`

|                            | 判定                                   |
| -------------------------- | -------------------------------------- |
| `null` を値として持つ      | 許可                                   |
| `?`（キーの不在）          | 許可                                   |
| `undefined` を値として持つ | **禁止**                               |
| patch 内の `undefined`     | **プロパティ削除**の意味に予約（§6.2） |

#### なぜ「undefined 禁止」ではなく「値としての undefined 禁止」なのか

オプショナルプロパティ自体はシリアライズ的に無害。キーが存在しなければ `JSON.stringify` は出力せず、`parse` してもキーは存在しない。`structuredClone` も同じで、往復は対称になる。

壊れるのは「キーは存在するが値が `undefined`」のときだけ:

```ts
JSON.parse(JSON.stringify({ a: undefined })); // {} — キーが消える
structuredClone({ a: undefined }); // { a: undefined } — キーが残る
```

2 つのシリアライズ経路が食い違う。これが禁じたい本当の理由。

TS では `?` が圧倒的に慣用的なので、オプショナルプロパティを一律禁止して `nickname: string | null` を強制するのは受け入れられない。よって線引きは「キーの不在は OK、値としての `undefined` は禁止」とする。

#### 型による検査

optional キーは判定できる。

```ts
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
```

`-?` は、マップ先の値型に `undefined` が混ざらないようにするために必要。

これを使って、optional キーだけ `undefined` を剥がしてから検査する。

```ts
type Invalid<Msg extends string> = { readonly __valError: Msg };

type Validate<T> = [T] extends [Primitive]
  ? T
  : [T] extends [AnyVal]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? ReadonlyArray<Validate<E>>
      : [T] extends [Function]
        ? Invalid<"functions are not allowed">
        : [T] extends [object]
          ? {
              [K in keyof T]: K extends OptionalKeys<T>
                ? Validate<Exclude<T[K], undefined>> | undefined
                : undefined extends T[K]
                  ? Invalid<"required property cannot be undefined; use null or make it optional">
                  : Validate<T[K]>;
            }
          : Invalid<"not a plain value">;

type Val<K extends string, T extends Validate<T>> = DeepReadonly<T> & Brand<K>;
```

- `[T] extends [X]` の非分配形にしているのは、`string | null` のような union をまとめて判定するため

これで `Val<"User", { nickname: string | undefined }>` は弾ける。

#### 実装時の修正: 自己参照制約は型エイリアスでは書けない

当初は `T extends Validate<T>` という自己参照制約で「型定義の場所でエラーを出す」つもりだったが、
これは**型エイリアスでは TS2313「型パラメーター 'T' には循環参照する制約が指定されています」に
なる**（ジェネリック関数の型パラメーターなら書けるが、`Val` は型エイリアスなので通らない）。
条件型で同じ検査に置き換えた:

```ts
type Val<K extends string, T> = [T] extends [Validate<T>]
  ? DeepReadonly<T> & Brand<K>
  : Validate<T>;
```

違反時は `Invalid<Msg>` を含む `Validate<T>` に解決される。それは `AnyVal` を満たさないので、
`Val.of` / `Val.sealer` / `Val.companion` に渡した時点でエラーになる:

```
Property '[__brand]' is missing in type
  '{ nickname: Invalid<"required property cannot be undefined; use null or make it optional"> }'
but required in type 'AnyVal'.
```

**エラー位置は型定義時ではなく最初の使用時に後退する**が、メッセージは意図どおり表示される。
検査自体は `Val<K, T>` から一度だけ適用されるので、推論コストの利点は保たれている。

#### `exactOptionalPropertyTypes` の壁

EOPT が **off**（TS のデフォルト）のとき、`{ a?: string }` と `{ a?: string | undefined }` は文字通り同じ型として扱われ、**区別する手段が言語に存在しない**。したがって以下は検出できない:

```ts
const raw: { nickname?: string } = { nickname: undefined }; // EOPT:false なら合法
User(raw); // 型検査を通る。キーが存在して値が undefined
```

EOPT を on にすれば `Record<K, undefined> extends Pick<T, K>` で判定できるようになるが、有効化すると既存コードで大量にエラーが出ることがあるため**必須要件にはしない**。

freeze を切ったとき（§7.1）の根拠は「破るには `as any` が必要」だったが、こちらは**キャストなしで普通のコードから漏れてくる**。保証としては一段弱いことを認識しておく。

#### 二段構えで無害化する

1. `Primitive` から `undefined` を外す
2. 上の `Validate` を入れる（型定義時に検査）
3. README で **EOPT: true を強く推奨**する。必須にはしない
4. `with` は patch の `undefined` キーを削除として解釈し、マージ後に落とす（§6.2）
5. **デフォルト deep equals で、値が `undefined` のキーを無視する**（§5）

5 が効く。`{ a: undefined }` と `{}` が等価と判定されるなら、2 つのシリアライズ経路の食い違いが**観測できなくなる**。実行時コストはほぼゼロで、キー順非依存にする実装のついでに書ける。

型で大半を防ぎ、残りは equals で無害化する。EOPT を必須にして型で完全に閉じるより、導入コストと保証のバランスが良い。

#### interop の摩擦

`undefined` は TS のあちこちから湧いてくる（`Array.prototype.find`、`Map.get`、`noUncheckedIndexedAccess` 有効時の添字アクセス、OpenAPI/GraphQL のコード生成、フォームライブラリ、分割代入のデフォルト値）。seal に渡す前に `?? null` を挟む場面が増える。

ただしこれは**スマートコンストラクタで正規化すべき場所そのもの**であり、§5 の「正規形で構築する」原則と一貫している。「境界で正規化しろ」というメッセージとして README に書く。

#### 副次的な利点

`undefined` が値として存在し得ないため、`with` の patch における `undefined` を**削除の sentinel として使える**（§6.2）。

```ts
User.with(user, { nickname: undefined }); // nickname を削除
```

`null` と `undefined` を両方値として許すと、この sentinel が使えなくなる。「`null` を設定したい」のか「削除したい」のかを区別する手段が別途必要になり、専用の sentinel 値を導入する羽目になる。ここが綺麗になるのは実利として大きい。

このライブラリでは値の更新に必ず新しいオブジェクトを作るため、そもそも「プロパティに `undefined` を代入する」という操作が存在しない。よって `undefined` を値の空間から外しても表現力を失わない。

deep equals も同様に、`{ a: undefined }` と `{}` が等しいかという厄介な問いが発生しない。

---

## 4. DeepReadonly

`Val` で定義した型は DeepReadonly になる。§3 の制限により再帰は 1 段で止まるため、コストは低い。

### 4.1 コンストラクタは引数を所有する（コピーする）

DeepReadonly は型の話で、実行時には消える。したがって呼び出し側が引数への可変な参照を
持ち続けていると、Val を後から書き換えられる。

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // コピーしなければ "mallory"
```

これは「利用者の責任」で済ませられない。`as` も何も要らず、素直なコードが黙って壊れる。
値オブジェクトが背後で変わり得るなら、それは値オブジェクトではない。よって
`Val.of` / sealer / `.impl()` のコンストラクタ、および既定の seal を通る `with` / `update` /
`create` は引数をディープコピーする。

payload はプリミティブ・配列・プレーンオブジェクト・ネストした Val（これもプレーンな
データ）に限られるので、再帰コピーに特別扱いは要らない。`structuredClone` は使わない
（下の実測どおり自前の再帰の 5〜6 倍遅い）。

カスタム seal を書く場合、コピーの責任は seal にある。`Val.of` を通すのが正規の方法で、
**所有権を取る場所はそこ 1 箇所**（§6.8）。

**コスト実測**（Node 24 / M シリーズ、入力は毎回フレッシュ、ns/op）

|                   | flat 3キー | ネスト ~40ノード | 1000 行 |
| ----------------- | ---------- | ---------------- | ------- |
| そのまま返す      | 2          | 4                | 14      |
| ディープコピー    | 47         | 858              | 99,731  |
| `structuredClone` | 514        | 5,474            | 469,529 |

まともなサイズの値オブジェクトで 1μs 未満。1000 行を 1 つの Val に詰めると 100μs 払うが、
それはネスト Val に切るべきという話であり、§4 の「再帰は Val で止まる」方針とも一致する。

**将来の最適化（v1 では入れない）**: 自分が作ったコピーを WeakSet で覚えておけば、既に Val
である部分木を作り直さずに共有できる。子が Val の場合 1,055 → 220 ns、さらに共有によって
`deepEquals` の `a === b` 高速パスが節点ごとに当たり、内容の等しい 2 値の比較が
2,020 → 200 ns になる。意味論を変えない純粋な最適化なので後から足せる。ただし小さく平坦な
Val では WeakSet の参照コストのぶん逆に遅い（44 → 142 ns）ので、実ワークロードを見てから。

#### `with` / `update` のコピーを削るなら、フックは第 2 引数の seal

`with(v, patch)` は今、ツリー全体をディープコピーしている。しかし `v` 由来の部分木は既に
`v` が所有していて不変なので、本当にコピーが要るのは**その呼び出しで初めて来た patch の値
だけ**である。理想形:

```ts
const merged = { ...v, ...deepCopyEach(patch) };
seal(merged, share); // この経路では「コピーしない既定の seal」を渡す
```

重要なのは、**これが `Result` 非依存のまま実現できる**こと。コピーはカスタム seal が最後に
通す既定の seal（`Val.of` / 第 2 引数、§6.8）の中で起きていて、ライブラリは戻り値を素通し
するだけなので、`Result` の中身を知っても知らなくてもコピー回数は変わらない。逆に第 2 引数の
既定の seal は**経路ごとに差し替えられるフック**になっており、戻り値の形を固定しなくても
所有権の情報を渡せる。「seal の戻り値を `V` に固定する」「独自 Result を定義してユーザーに変換
させる」といった案は、§6.3 の相互運用性を捨てる割に、この利得とは無関係。

素朴な「コピーしない既定の seal」は**不健全**であることに注意:

```ts
.implSeal((u, seal) => seal({ ...u, tags: DEFAULT_TAGS })) // 外部のオブジェクトが値に埋まる
```

カスタム seal が既定の seal に渡すものがマージ済みオブジェクト由来とは限らない。健全にするには上記の
WeakSet 所有権追跡（ライブラリが鋳造したノードだけコピーを飛ばす）が必要で、`update` は
`fn` の戻りの出どころが分からないぶん、なおさらそれ頼みになる。つまりこの最適化は
「WeakSet を入れるか」と同じ 1 つの判断で、上の実測どおり**ネストが深いと勝ち・小さく
平坦だと負け**。実ワークロードを見てから、という結論も同じ。

#### 所有権の印を symbol キーで持たせる案（WeakSet の代替）

WeakSet の代わりに、鋳造したオブジェクト自身に `obj[MARK] = true` を持たせれば判定が速い
のではないか、という案。実測した（Node 24.19 / M シリーズ、ns/op）。

**印 1 個あたりのコスト**

| 操作                                             | ns/op |
| ------------------------------------------------ | ----- |
| `{a,b,c}` を作るだけ                             | 3.7   |
| + `owned.add(o)`                                 | 81.9  |
| + `Object.defineProperty(o, MARK, {value:true})` | 69.5  |
| + `o[MARK] = true`（enumerable）                 | 6.6   |

**判定 1 回あたり**

|                      | hit | miss |
| -------------------- | --- | ---- |
| `weakset.has`        | 7   | 5    |
| `obj[MARK] === true` | 3   | 3    |

symbol が勝つのは判定側だけで、印を付けるコストは `WeakSet.add` と同オーダー。そして
**構築経路では印を付けるほうが支配的**なので、正味の差は 0〜20% にしかならない。

ここから出てくる本当の知見は symbol か WeakSet かではなく、**印は全ノードではなく seal が
返す根にだけ付ける**こと。全ノードに付けると 30 ノードの値で 2,000 ns 前後かかり、素の
コピー 700 ns より遅くなる。この選択はどちらの機構でも同じように効く。

**根だけに印を付けたときの実測**

| ケース                                                 | 素のコピー | WeakSet | symbol |
| ------------------------------------------------------ | ---------- | ------- | ------ |
| Order（子 Val 3 個 + 平坦なフィールド）を新規 seal     | 504        | 616     | 578    |
| その Order に `with(v, {note})`                        | 523        | 639     | 655    |
| 全ノードが Val の木（3 段 × 4 分岐、85 節点）を再 seal | 3,111      | 186     | 153    |

- 浅くて子 Val の少ない値では共有のほうが遅い（523 → 639）。§4.1 の「小さく平坦だと負け」が再現した
- 新規 seal は必ず遅くなる（504 → 578〜616）。印 1 個ぶんの純増
- 深い木では 20 倍勝ち、ここでだけ symbol が WeakSet より 18% 速い（判定回数が支配的になるため）

**唯一の大勝ち（`o[MARK]=true`、印 6.6 ns、再 seal 13 ns）は不健全。** enumerable な symbol は
スプレッドで複製されるので、`with` の `{...value, ...patch}` に印が乗り、コピーが丸ごと
スキップされて patch 由来の外部オブジェクトが値に埋まる。§4.1 が防いでいるエイリアシング
そのもの。`with` 側で `delete` しても、利用者が自分のコードで `{...user}` した瞬間に素の
オブジェクトへ印が漏れ、それを再びコンストラクタに渡すと同じ穴が開く。防げないので
non-enumerable 一択で、それは上の 69.5 ns の経路。

速度以外では WeakSet が有利。

- **偽造できない。** 内部 `Symbol()` なら symbol も同様だが、その場合デュアルパッケージや
  複数レルムで印が共有されない。共有したければ `Symbol.for` になり、その瞬間に誰でも
  `obj[Symbol.for("valof.owned")] = true` と書けて、可変オブジェクトを値に埋め込める
- **値に余分な状態が乗らない。** symbol は `Object.getOwnPropertySymbols` に出る（`util.inspect`
  は non-enumerable を隠すので実害は薄いが、「値は素のデータ」の主張に対する例外ではある）
- 取りこぼしの向きは同じ。どちらも JSON / `structuredClone` を越えると印を失い、コピーに縮退する。
  `%HasFastProperties` は non-enumerable symbol を足しても `true` のままで、読み出しコストも 4 ns で変化なし

**結論: 速度を理由に symbol を選ぶ根拠は立たない。** §4.1 の判断（機構は WeakSet、実ワーク
ロードを見てから）は据え置き。内部実装なので、必要になれば後から非破壊で差し替えられる。

#### 閾値つきの所有権追跡（実測）

登録は 1 個 97 ns、判定は 5〜8 ns。**書きが読みの 15〜20 倍**なので、絞るべきは書きのほう。
「seal が返す根だけ登録する」（ws-root）は小さく平坦な値で 2.5〜3.3x 損をするが、
**登録するノードを閾値で絞ると、その損が消えたうえで利得は残る**。

閾値の候補は 2 つ。

- **interior**: オブジェクト/配列の子を 1 つ以上持つノードだけ登録する。部分木サイズ 2 以上と
  同値なので、**カウンタも WeakMap も要らず WeakSet で足りる**（判定は boolean 1 個）
- **K=n**: 部分木のノード数が n 以上のノードだけ登録する。サイズを持つので `WeakMap<node, size>`。
  所有ノードに当たったらそのサイズを親の集計に足すので、再 seal を繰り返しても登録状態は振動しない

実測は `scripts/bench-ownership.ts`（ブランチ `perf/ownership-tracking`）。`pnpm run bench`。
以下は Node 24.19 / M シリーズ、plain 比。

| 形                   | 経路                 | ws-root               | interior              | K=8                   | K=32                  |
| -------------------- | -------------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| flat 3 keys          | seal / with          | 3.29x / 2.62x         | 1.13x / 1.08x         | 1.11x / 1.07x         | 1.18x / 1.12x         |
| order（子 Val 3 個） | seal / with / equals | 1.07x / 1.12x / 0.78x | 1.41x / 0.72x / 0.49x | 1.37x / 0.69x / 0.50x | 1.06x / 1.11x / 0.98x |
| deep 3x4             | seal / with / equals | 0.08x / 0.07x / 0.02x | 0.10x / 0.04x / 0.01x | 0.14x / 0.07x / 0.01x | 1.19x / 0.07x / 0.01x |
| 200 行               | seal / with / equals | 0.23x / 0.21x / 0.07x | 1.11x / 0.02x / 0.00x | 1.07x / 0.03x / 0.01x | 1.06x / 0.03x / 0.00x |

リスト形で ws-root（0.21x）より interior（0.02x）が 10 倍良いのは、ws-root が Val の根しか
登録しないのに対し、interior は **`rows` 配列そのもの**を登録するので、判定 1 回でリスト全体を
共有できるから。**リストに Val を入れる形は追跡と相性が良い。**

#### 閾値の判断を反転した: フレームワークが見るのは identity

interior 規則（オブジェクトを保持するノードだけ登録）は**コピー時間**で閾値を決めていた。
これは目的関数を間違えている。React / Vue / Svelte が比較するのは identity であって
コピー時間ではない。

interior のままだと、`user.name` を変えただけで `user.wallet`（プリミティブだけの葉の Val）が
コピーされ、参照が変わる。`React.memo(Wallet)` は**見てもいない変更で再レンダリングする**。

全ノード登録に変えたときの収支:

|              | flat 3keys の seal | Val 200 個のリスト構築 | 子の identity |
| ------------ | ------------------ | ---------------------- | ------------- |
| interior     | 57.7 ns (1.25x)    | 11.0us (1.12x)         | 変わる        |
| 全ノード登録 | 145 ns (3.14x)     | **2346 ns (0.24x)**    | 保たれる      |

- 小さく平坦な値の構築で +100 ns。ns オーダーであり、オブジェクトが大きくなるほど相対コストは下がるので、
  全体のボトルネックにはなりにくい
- Val のリスト構築が 4.7 倍速い。各行が自分の seal で登録され、親が共有できるため。
  リストは React の主戦場でもあるので、interop の観点でも同じ側
- 再レンダリング 1 回は μs〜ms のオーダーで、100 ns とは釣り合わない
- 簿記（`nested` / `holdsObject`）が消えてサイズが 31 B 減る

**§4.1 の「小さく平坦だと負け」は速度としては今も正しい。負けを承知で取る、という判断に変えた。**

#### 何も変わらない `with` は値そのものを返す

共有を入れても、no-op な `with` は新しい root を作るので identity が変わり、再レンダリングが走る。
`with` は既に merged payload のキーを 1 周しているので、そのループに identity 比較を相乗りさせた。
Immer の `produce`（何も変えなければ元の参照を返す）と同じ挙動。

- 拾う: `with(v, { name: 同じ値 })`、`with(v, {})`、値が持たないキーの削除、`update(v, (x) => x)`
- 拾わない: 同値だが新しい子 Val を渡した場合。**コンストラクタを通した以上、新しいインスタンスに
  なるのが JS として自然**なので、これは仕様
- 拾わない: `update` で spread した場合。新しいオブジェクトが同値かの判定は `with` の仕事で、
  そこでしか走査が既に払われていない
- カスタム seal のときは値を seal に通す。戻り値の形は seal が所有しているため。中の `copy` が
  値を認識して同じノードを返すので、`Result` の中身の identity は保たれる

セマンティクス上の注意: 短絡は既定の seal のときだけ seal を飛ばす。§6.8 の「値になる経路はすべて
seal を通る」はカスタム seal については保たれる。

サイズは 939 → 972 B（予算 1 kB に対して残り 52 B）。閾値の変更で 31 B 浮いたぶんが短絡の
コストをほぼ肩代わりしている。

#### 共有が作るのはダイヤモンドであって循環ではない

**保証しているのは deep copy ではなく生成順。** ここは取り違えやすい。共有経路ではコピーを
飛ばすので、「入口でディープコピーするから循環しない」という説明だと共有を入れた時点で
崩れる。実際に効いているのは `copy` がボトムアップであること: 子を全部コピーし終えてから
`out` を作るので、**`out` が参照できるのは自分より前に存在したノードだけ**になる。共有経路で
返るのはさらに古い所有ノードなので、所有グラフは生成時刻で順序づけられた DAG になり、
後から作られたノードへの辺が存在しない。deep copy の担当はエイリアシング（§4.1）であって
循環ではない。

型でも作れない。親を作るには子が先に要るので、循環は変異でしか作れない。

循環した payload を渡した場合は `RangeError`（スタックオーバーフロー）。`copy` は visited セットを
持たない素の再帰なので、**共有の前後で失敗の仕方は変わらない**。サニタイズはされない。

**新しく起きるようになったのはダイヤモンド。** 同じ子 Val を 2 箇所に置くと、以前は別々に
コピーされていたものが同一参照になる。循環ではないので無害だが、境界で差が出る。

```
ダイヤモンド: a === b → true   a === m → true
JSON 往復:    {"a":{"amount":1},"b":{"amount":1},"note":"n"}   ← 共有は失われる
structuredClone 後も a === b: true                              ← DAG は保たれる
with 後も a === b: true   元と共有: true
```

値としては等しいので `equals` の答えは変わらない。差が観測できるのは identity を見たときだけ。

**失敗の仕方が変わるのは 1 ケースだけ。** キャストで不変性を破ったあとに限る。

|                           | production                                                                     | development                 |
| ------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `(v as any).self = v`     | 書けてしまう                                                                   | **TypeError**（dev freeze） |
| その `v` を他の値に入れる | 所有ノードなので共有され、循環したまま値に入る（以前はスタックオーバーフロー） | 上で止まるので到達しない    |

production では「即座にクラッシュ」から「静かに循環を含んだ値」に変わる。ただし前提が
`as` によるキャストと書き換えなので、これは §7.1 の dev freeze がその一歩手前で捕まえる話であり、
新しい穴ではない。

#### GC は妨げない

確認すべきは「参照カウントではない」ことではなく、**全ノード登録に変えて増えた WeakSet の
エントリが保持しないこと**のほう。`--expose-gc` で実測した。

```
1. WeakSet 登録済みの値:              回収された
   その子（ダイヤモンドの共有ノード): 回収された
2. 子だけ保持したとき親は:            回収された（子は生存）
3. 派生元の root:                     回収された
```

**1. `owned` は WeakSet なので所有ノードを保持しない。** 全ノード登録で増えたのは弱参照の数だけ。
到達不能になれば登録済みでも回収される。

**2. 参照は下向きだけなので、子を保持しても親は回収される。** 共有ノードは自分より前に作られた
ノードしか指さない（生成順の DAG、上記）。`user.wallet` を握っても `user` は生き残らない。
Java の旧 `substring` のような「小さな断片が巨大なバッファを掴む」型の危険はない。
**ノード全体を共有していて、切り出しをしていない**ため。

**3. 共有は生存集合をむしろ減らす。** ダイヤモンドは 2 つのオブジェクトが 1 つになったという
ことなので、live なオブジェクト数はコピー方式より少ない。派生元を捨てたとき共有部分木は
生き残るが、それは派生先が実際に使っているノードなので、コピー方式で払っていた量以下に必ず収まる。

#### 分解のコストと、更新するか否かでのモデリング

生の 106 ノードの木（深さ 3 分岐 4）を、1 個の Val にそのまま持たせる場合と、階層ごとに
ネスト Val へ分解する場合の比較。

| 方式          | 分解なし 1 回 seal | 分解して構築      | 分解なし + with x10 | 分解 + with x10 |
| ------------- | ------------------ | ----------------- | ------------------- | --------------- |
| plain（現状） | 3020               | **11.4us (3.8x)** | 30.1us              | 30.0us          |
| interior      | 9308 (3.08x)       | 11.4us (1.00x)    | 3066 (0.10x)        | 2015 (0.07x)    |
| K=8           | 4690 (1.55x)       | 10.8us (0.94x)    | 3062 (0.10x)        | 1831 (0.06x)    |
| K=32          | 3696 (1.22x)       | 13.0us (1.14x)    | 3138 (0.10x)        | 1948 (0.06x)    |

3 つ出てくる。

1. **分解のコストは今すでに払っている。** plain で 3.8x。親の seal が子をもう一度コピーするので、
   階層を切るたびに下の全ノードが再コピーされる。**現状のライブラリは、自分が推奨している
   モデリング（ネスト Val に切る）を構築時に罰している。** これは共有とは独立した既存の問題で、
   design.md のどこにも書かれていなかった
2. **追跡はその罰を消す。** 追跡ありの分解は 0.94〜1.00x で、追跡なしの分解より速い
3. **更新が 1 回でも入れば全部ひっくり返る。** 概算の損益分岐は 2 回目の `with`

ここから指針が出る。**カスタム seal の推奨ではない**（`CheckedSeal` が「seal は payload を受け取る、
wire format ではない」を型で縛っているので、分解は seal の手前で起き、seal を書き換えても
コピーの位置も回数も変わらない）。梃子はモデリングのほう。

> 更新する値はネスト Val に分解する。読むだけの値は 1 つの Val に深い payload のまま持たせる。

利用者は「この値は更新するか」を設計時に知っているので、判断できる線引きになっている。

残る損失は表の左上、**読むだけの深い値**だけ。interior で 3.08x、K=32 なら 1.22x に落ちるが、
その K は分解経路を 1.14x に悪化させる。どの閾値も全勝はしないので、ここは実ワークロード待ち。
どちらも意味論を変えないので後から入れ替えられる。

#### 実装した（ブランチ `perf/ownership-tracking`）

interior 規則で `src/val.ts` に入れた。`copy` が作ったノードのうち**オブジェクトを保持する
ものだけ** WeakSet に登録し、次に出会ったらそのまま返す。

- `nested`（直前にコピーしたのがオブジェクトだったか）と `sharing`（共有を止めるか）の
  2 つのモジュール変数を足しただけで、公開 API は変わらない
- `Val.unwrap` は `sharing = false` で走る。可変なコピーを返す契約なので、**ノードを共有しても
  いけないし、共有されるノードになってもいけない**。後者を忘れると、unwrap した payload を
  seal し直したときに呼び出し側の可変オブジェクトを値が抱え込む
- 取りこぼしはコピーに縮退するだけなので、レルムをまたいで WeakSet が別インスタンスになっても
  修復すべきものは何もない

**バンドルサイズ: gzip 853 B → 937 B（+84 B）。予算 1 kB に対して残り 87 B（17% → 8%）。**

テストは 7 件足した（`with` / `update` が触っていない部分木を保つ、patch 由来のノードは
採用せず必ずコピーする、`Val.unwrap` は何も共有しない、unwrap した payload は再 seal しても
採用されない、`equals` の答えは変わらない）。加えて **「プリミティブだけのノードは共有せず
コピーする」を明示的にテストしている**。閾値の存在自体が観測可能な挙動なので、
偶然そうなっているのではないと分かるようにしておく。

残る検討事項:

- 予算まで 87 B しかない。この先 `Val.eqBy`（§5）を `Val` に生やすなら予算を上げる判断が要る
- 値は freeze していないので、キャストして値を書き換えると**共有先の値にも波及する**ようになった。
  破るのに `as` が要る点は §7.1 と同じだが、影響範囲は広がった

#### ネスト Val の seal は型で強制されている（`PayloadOf` の穴を除く）

ファントムブランドがあるので、素の payload からネスト Val は作れない。tsc で確認済み:

```ts
type OrderA = Val<"OrderA", { id: string; total: Money }>;
OrderA({ id: "o", total: { amount: 1, currency: "JPY" } });
// error TS2322: missing __valof_internal_phantom_brand, __valof_internal_phantom_payload
```

つまり「JSON から親を作る」経路でも子は必ず子の seal を通り、追跡下では登録される。抜けられるのは
`as` を書いたときと、**`PayloadOf` をフィールド位置に置いたとき**:

```ts
type OrderB = Val<"OrderB", { id: string; total: PayloadOf<Money> }>;
OrderB({ id: "o", total: { amount: 1, currency: "JPY" } }); // 通る
```

ブランドごと落ちるので、子の seal（不変条件・正規化）も、子のカスタム `equals` も、追跡下での
共有も失われる。完全に silent ではない（`Money.equals(order.total, x)` を書けば型エラーになる）が、
構築の瞬間には気づかない。

README の `Reusing a Val` が見せているのは**トップレベルでの合成**（`PayloadOf<User> & { … }`）で、
これは正当な用法。フィールド位置との区別が書かれていないため、実際に読み違いが起きた。

### 既知の摩擦

- `readonly T[]` は `T[]` に代入できない。`readonly` を知らないサードパーティ関数に渡すたびに詰まる（`Array.prototype.sort` すら通らない）
  → `Val.unwrap` で可変なコピーを取り出す。`Val.of` の逆向き。実装は `copy` の再利用で、
  minify 後 +44 B / gzip +13 B。代替手段の `structuredClone` より約 9 倍速い（95 vs 855 ns/op）

  **再測定（共有と dev freeze を入れたあと）**: バイト数の比較は逆転した。`copy` の再利用は
  `sealing` フラグを要求し、`structuredClone` ならフラグごと消せる。実際に差し替えて測ると
  **gzip 939 → 930 B（-9 B）で、テスト 102 件は全部通る**。正しさの差も見つからなかった:

  - `__proto__` を own property に持つ payload → own のまま複製され、汚染もしない
  - null プロトタイプ → `Object.prototype` になる（`copy` と同じ挙動）
  - frozen な値 → 複製は frozen ではない（`unwrap` の契約どおり）

  残る差は速度だけで、そこは変わらず大きい（381 vs 2,587 ns/op、約 6.8 倍）。**9 B のために
  `unwrap` を 7 倍遅くする取引なので `copy` の再利用を維持する。** ただし判断の根拠が
  「サイズと速度の両取り」から「速度のみ」に変わったことは記録しておく。

- エラーメッセージが `readonly` の入れ子で膨れて読みにくくなる

`unwrap` はあくまで外部に渡すための出口であって、値の派生に使うものではない。`SeedOf<V>` が
Val をそのまま受けるので `Val.of` / `with` は 1 回のコピーで済むが、`unwrap` を経由すると
2 回になる（92 → 184 ns/op、ネスト約 8 ノード）。

`unwrap` を `Val` に生やして単体 export にしなかった理由。単体なら使わない利用者から
tree-shaking で落ちる（gzip 1,011 vs 1,023 B）が、44 B のために `unwrap` という
ありふれた名前をトップレベルに置くと `Result` 系ライブラリと衝突する。`Val.of` の逆操作
であることも名前空間側に置く根拠になる。

### ベンチマーク

DeepReadonly・ブランド・コンパニオンのオーバーロード判定はすべて条件型なので、規模の大きい
コードベースでの型チェック速度を計測した。合成ベンチはフィールド 30 個 × ネスト 3 段 × 200 型
（= 18,000 プロパティ）で、`tsc --extendedDiagnostics` の `Check time` と `Instantiations`
を見る。

| 変種                                              | Types  | Instantiations | Check (TS 7.0.2) | Check (TS 5.9.3) |
| ------------------------------------------------- | ------ | -------------- | ---------------- | ---------------- |
| 素の `interface`（ライブラリなし）                | 3,979  | 0              | 0.036s           | 0.09s            |
| `Val<K, T>` 型 + `Val.of` のみ                    | 46,744 | 765,435        | 0.207s           | 0.54s            |
| + `sealer().impl` と `with` / `update` / `equals` | 88,145 | 943,921        | 0.285s           | 0.71s            |

型 1 個あたり約 4,700 instantiations、チェック時間 1.4ms（TS 7）。素の `interface` に対して
絶対値では 8 倍だが、200 型を丸ごと 1 ファイルで型付けして 0.3 秒に収まる。

型数に対して線形で、条件型の展開が組合せ爆発する箇所はない（フル変種の Check time は
50 型 0.065s / 100 型 0.137s / 200 型 0.285s / 400 型 0.601s、instantiations も同じ傾きで
237K / 473K / 944K / 1,886K）。

TS 7 の値だけを見て安心しないための併記が右列。ただし上表の 2.5 倍という差は TS 7 に最も
不利な測り方（200 型を 1 ファイル）で出たもので、TS 7 の速さの多くを占めるファイル単位の
並列チェックが効かない。同じ 200 型を 1 型 1 ファイルに分けると差は 7 倍以上に開く。

| フル変種の並べ方         | Check (TS 7.0.2) | Check (TS 5.9.3) |
| ------------------------ | ---------------- | ---------------- |
| 1 ファイル（200 型）     | 0.285s           | 0.71s            |
| 200 ファイル（1 型ずつ） | 0.094s           | 0.70s            |

TS 5.9 は並べ方で変わらず、TS 7 だけが 3 倍速くなる。裏を返せば、巨大な 1 ファイルに型を
集約すると TS 7 の利点をほぼ捨てることになる。

いずれの並べ方でも **instantiations は両コンパイラでほぼ同一**（943,921 / 943,425）なので、
回帰の監視は時間ではなくこちらを見る。負荷そのものはコンパイラのバージョンにも
ファイル分割にも依らない。

DeepReadonly をオプトインにする案は、この結果では不要と判断する。コストの大半は `Val` 型の
定義側（2 行目、コンパニオンなしで既に 765K instantiations）にあり、`with` / `update` /
`equals` のオーバーロード判定が上乗せするのは 23% にすぎない。

---

### 4.2 タプルは保持されない（要修正）

現状、タプルの payload は `DeepReadonly` で潰れる。

```ts
type Pair = Val<"Pair", { at: readonly [Money, Tag] }>;
declare const check: Pair["at"];
const b: Tag = check[1]; // error TS2322: Type 'Money | Tag' is not assignable to type 'Tag'
const len: 2 = check.length; // error TS2322: Type 'number' is not assignable to type '2'
```

配列分岐の `ReadonlyArray<infer E>` がタプルも受けて `ReadonlyArray<DeepReadonly<E>>` に
均してしまう。`SeedOf` も `DeepReadonly<PayloadOf<V>>` なので同じく潰れる。つまり
**`SeedOf<V>` から導く API（`with` の patch、§5 の `eqBy` の spec）では位置ごとの扱いが
そもそも書けない**。

`Validate` はタプルを通す（`[A, B] extends ReadonlyArray<A|B>` が真なので `Checked<T>` は
`T` のまま）。ただし違反時のメッセージが劣化する。

```
Val<"InTuple", { t: readonly [string, () => void] }>
  → Invalid<"not a plain value">         // 要素の union が Function 分岐に入らず object 分岐に落ちる
Val<"InArray", { t: readonly (() => void)[] }>
  → Invalid<"functions are not allowed"> // こちらは正しい
```

弾けてはいるので実害はメッセージのみ。

**修正**: `DeepReadonly` に分岐を足す。`number extends T["length"]` で配列とタプルを分け、
タプル側は同形マップ型にすればタプル性も `readonly` も保たれる（動作確認済み: `t.at[1]` が
`Tag`、`t.at.length` が `2`、要素への代入は依然エラー）。

```ts
: [T] extends [ReadonlyArray<infer E>]
  ? number extends T["length"]
    ? ReadonlyArray<DeepReadonly<E>>
    : { readonly [I in keyof T]: DeepReadonly<T[I]> }
```

`Validate` にも同じ分岐を入れればメッセージも直る。

---

## 5. 等価性

### API

自由関数 `Val.equals` は**提供しない**。ファントムブランドのため実行時に型を特定できず、型ごとのカスタム等価性にディスパッチできないため。

代わりに `Val.companion` の返り値がデフォルトで `equals` を持ち、必要に応じてオーバーライドできる。

```ts
User.equals(a, b); // デフォルトは deep equal
```

デフォルト実装 `deepEquals` も**エクスポートしない**。自由関数として出すと、名前が違うだけで
上と同じものになり、型ごとの `equals` を黙って迂回する経路になるため（`(a: unknown, b: unknown)`
なので異なる型の Val 同士の比較も通ってしまう）。

代わりに**オーバーライドの第 3 引数として束縛して渡す**。委譲が意味を持つ場所にだけ、
その Val の型が付いた状態で置く。

```ts
const Doc = Val.sealer<Doc>().impl({
  equals: (a, b, deepEquals) => (a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id),
});

Doc.equals(a, b); // 呼ぶ側は 2 引数のまま。第 3 引数は束縛済み
```

渡すのは構造比較そのものであって「オーバーライド前の equals」ではない。したがって
下の §「親から子のカスタム equals は呼べない」制約はこの引数にもそのまま当てはまる。

### デフォルト実装の要件

- 構造的な深い比較
- **キー順に依存しないこと**（キーをソートしてから比較）。§8.1 の Set 表現のために必須であり、そもそも正しい挙動
- **値が `undefined` のキーを無視すること**。`{ a: undefined }` と `{}` を等価とする。EOPT off の環境で漏れてきた `undefined` による 2 経路のシリアライズ差異を観測不能にする（§3.5）

### 制約: 親から子のカスタム equals は呼べない

```ts
const Money = Val.sealer<Money>().impl({
  equals: (a, b) => a.currency === b.currency && normalize(a) === normalize(b),
});

const Order = Val.sealer<Order>(); // デフォルトの deep equals

Order.equals(o1, o2); // ← 中の Money は Money.equals ではなく汎用比較される
```

デフォルトの deep equals は、子の値を見てもそれが `Money` だと分からない。

これは実装の工夫で回避できる問題ではない。実行時に値から型を引く方法は原理的に 3 つしかなく、

1. 値がプロトタイプを持つ → class
2. 値がタグを持つ → タグ付きレコード
3. 呼ぶ側が型を知っている → 辞書渡し（型クラス / implicit）

1・2 は「ブランドはファントム」の前提と両立せず、3 は TypeScript に手段がない。**「値は実行時にはただのデータ」と「実行時ポリモーフィズム」のトレードオフ**という構造的事実であり、設計ミスではない。

### 解決: 正規形で構築する原則

カスタム equals が必要になる型は、**seal で正規化すれば構造的等価性で正しくなる**。

```ts
const Email = Val.companion<Email>().implSeal(
  (s: string, seal) => seal(s.trim().toLowerCase()), // ← ここで正規化
);
```

こうすれば `Email.equals` のオーバーライドは不要になり、親から構造比較されても正しい。スマートコンストラクタで不変条件を確立するのは値オブジェクトの定石なので、この制約はむしろ正しい設計へ誘導している。

**README にはこれを「制限」ではなく「原則」として書く:**

> Val は正規形で構築してください。等価性は構造的に定義されます。`Email` を case-insensitive に扱いたいなら、`equals` をオーバーライドするのではなく seal で小文字化してください。この原則に従う限り、ネストした Val の等価性は自動的に正しくなります。

`equals` のオーバーライド機能自体は残すが、「トップレベルの比較にのみ効き、親から呼ばれる際には適用されない」と明記する。逃げ道はあるが推奨経路ではない、という位置づけ。

---

### 冗長さを削る: 等価性コンビネータ `Val.eqBy`

上の原則で大半は消えるが、正規化で表現できない等価性は残る（id だけで比べる、キャッシュ列を
無視する、`updatedAt` を等価性から外す）。そのとき親が手で書く `equals` は、関係のないキーまで
自分で並べることになって冗長。これを **実行時のタグではなく、親の型定義の場所にある静的な
宣言** で書けるようにする。

```ts
export const Order = Val.sealer<Order>().impl({
  equals: Val.eqBy({
    total: Money, // companion をそのまま渡す。Money.equals が使われる
    email: Email, // プリミティブ payload の子でも動く（ここが要点）
    lines: [OrderLine], // 配列は要素ごと
    shipping: { zip: Zip }, // Val ではない素のネストは、中の指定だけ書く
    updatedAt: () => true, // 等価性から外す
  }),
});
```

指定のないキーは既定の `deepEquals` に落ちる。`id` や `note` を列挙する必要はない。

**spec が受け付ける形**

| 書き方                         | 意味                               |
| ------------------------------ | ---------------------------------- |
| companion（`equals` を持つ値） | その `equals` を使う               |
| `(a, b) => boolean`            | その関数を使う                     |
| `[spec]`                       | 配列。長さ一致 + 要素ごとに `spec` |
| `{ k: spec, ... }`             | 素のネストオブジェクトに降りる     |

companion と「`equals` というキーを持つネスト spec」の曖昧さは、`typeof spec.equals === "function"`
を先に見れば解ける。payload に関数は入れられない（§3 の `Validate`）ので、`equals` が関数である
オブジェクトは companion 以外にあり得ない。

**実装**（既存の `deepEquals` を再利用して 30 行ほど）

```ts
function toEq(spec: unknown): Eq {
  if (typeof spec === "function") return spec as Eq;
  if (typeof (spec as any).equals === "function") return (spec as any).equals;
  if (Array.isArray(spec)) {
    const e = toEq(spec[0]);
    return (a, b) =>
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => e(x, b[i]));
  }
  const handlers = new Map(Object.entries(spec as object).map(([k, s]) => [k, toEq(s)]));
  return (a, b) => {
    if (a === b) return true;
    if (!isObjectShaped(a) || !isObjectShaped(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.hasOwn(b, k)) return false;
      const e = handlers.get(k);
      if (!(e ? e(a[k], b[k]) : deepEquals(a[k], b[k]))) return false;
    }
    return true;
  };
}
```

キー数の一致と `hasOwn` を既定の `deepEquals` と同じ規則（キー順非依存、値が `undefined` の
キーは無視）で先に見ているので、spec 指定キーが片方だけに存在する場合も落ちる。

**型**

```ts
type EqSpecOf<T> =
  | ((a: T, b: T) => boolean)
  | { equals: (a: T, b: T) => boolean }
  | (T extends readonly (infer E)[] ? readonly [EqSpecOf<E>] : never)
  | (T extends object ? { [K in keyof T]?: EqSpecOf<T[K]> } : never);

declare function eqBy<V extends AnyVal>(spec: {
  [K in keyof SeedOf<V>]?: EqSpecOf<SeedOf<V>[K]>;
}): (a: V, b: V) => boolean;
```

`.impl({ equals: ... })` の位置では `equals` の文脈型が `(a: V, b: V, deep) => boolean` なので、
`V` は戻り値の文脈から推論されるはず。2 引数関数は 3 引数スロットに代入可能なので、
コア側の型は 1 行も変わらない。ただし「文脈の戻り値型からの推論 + マップ型の制約」は
TypeScript の弱いところなので、実装時に要確認。落ちた場合の逃げは 2 つ。

- `Val.eqBy<Order>({ ... })` と明示する（型名を 2 回書くことになり、方針とはずれる）
- ビルダーの段にする（`Val.sealer<Order>().implEq({ total: Money })`）。`V` が固定済みなので
  推論の問題は消えるが、`equals` の書き方が 3 通りになり API 表面が増える

まず自由関数で試し、推論が渋ければビルダー段に降ろす。

#### タプルの位置ごとの指定

§4.2 のタプル対応が入ってからなら、同形マップ型がタプルに対してタプルを返すので素直に書ける。

```ts
T extends readonly unknown[]
  ? number extends T["length"]
    ? readonly [EqSpecOf<T[number]>]
    : readonly [EqSpecOf<T[number]>] | { [I in keyof T]: EqSpecOf<T[I]> }
  : never
```

実行時の規則は「spec の長さが 1 なら全要素に適用、2 以上なら位置ごとに対応」。曖昧なのは
長さ 1 のタプルだけで、そのとき 2 つの解釈は同じ結果になるので害がない。

#### 省略を許すか（許す）

spec のキーを必須にすればカスタム equals の指定忘れを型で防げる、という発想は成立しない。
選択肢は 3 つあり、型で解ける範囲に上限がある。

1. **全キー省略可。** 簡潔だが指定忘れは検出されない
2. **子が Val であるキーだけ必須にする。** `HasVal<T>` を書けば型で計算できる。ただし
   カスタム equals を持たない子まで必ず書かされる。ネストした Val の大半は既定の
   `deepEquals` のままで、その場合は構造比較でも答えが同じなので、書かせても得るものがない。
   機械的に埋める作業になり、その状態の「忘れ検出」はほぼ機能しない
3. **子が `equals` を上書きしたキーだけ必須にする。** 理想だが型からは見えない。
   `Val<"Money", ...>` から companion の値の型への参照が存在しないため。宣言マージの
   レジストリを用意すれば書けるが、問題が「レジストリへの登録忘れ」にずれるだけ

決定打は、**型で守れるのは `eqBy` を呼んだ人だけ**だということ。指定忘れが本当に危ないのは
`equals: Val.eqBy(...)` を書いていない親、つまり何も書いていない親であり、そこに型の付け入る
隙はない。一番忘れやすい人が一番守られない。

したがって **`eqBy` は全キー省略可にし、忘れ検出は valof-lint に置く。**

- リンタは `.impl({ equals })` の存在をソースから直接見られるので、レジストリも型の仕掛けも要らない
- 必要な解析は既存実装と同じ形。import / namespace import / renaming re-export の追跡と、
  チェーンの根での companion 同定は既に入っている
- 規則: ある companion が `equals` を上書きしていて、その Val を payload に埋めている別の Val が
  ある場合、親の companion は `equals` を上書きするか `eqBy` の spec でそのキーを指定していること
- 直し方が一意なので提案（fix）まで出せる

型は「spec に書いた比較が型に合っているか」を守り、リンタは「書き忘れていないか」を守る。

---

## 6. スマートコンストラクタと更新

### 6.1 コンストラクタの出し分け

当初の案は「`from` または `new` が companion に渡されていたらコンストラクタを返さない」という
**ゲート方式**だった。`HasSmartCtor<M>` でキーの有無を検出し、コンストラクタの呼び出し
シグネチャを引数型にメッセージを埋め込んだものに差し替える:

```ts
(...args: ["User has a smart constructor. Use User.from() instead."]): never
```

これは実装して動いたが、**ゲートそのものが不要だと分かったので破棄した**。

#### 採用: コンストラクタは作らなければ迂回できない

コンストラクタ生成を `Val.sealer` に分離し、`companion` からは切り離す。

```ts
Val.sealer<Tags>(); // コンストラクタ（+ 既定の振る舞い）
Val.sealer<User>().impl({ greet }); // コンストラクタ + 振る舞い
Val.companion<Age>().implSeal(check); // 振る舞いのみ。呼べない
```

呼べるかどうかは**検出の結果ではなく出自**で決まる。sealer はコンストラクタなので、そこから
作ったものはコンストラクタのままであり、sealer を通さずに作った companion はそもそも関数ではない。

これによって次が全部消える:

- `HasSmartCtor<M>` — 何も検出しない
- `SmartCtorGuard` — 潰すべき呼び出しシグネチャが存在しない
- `new`（当時のスマートコンストラクタの別名）— ゲートのためだけの存在だった
- `CompanionMethods` のスマートコンストラクタに対する返り値制約 — ただのユーザー関数になった

保証も強くなる。ゲート方式では**型エラーは出るが関数は実在し、実行時は throw していた**。
新方式ではコンストラクタが存在しないので、迂回する対象がない。

```ts
export const Age = Val.companion<Age>().implSeal((n: number, seal) =>
  n >= 0 ? ok(seal(n)) : err("negative"),
);

Age(30); // この式は呼び出し可能ではありません
Age.seal(30); // ← 唯一の入口
```

seal の中で値を作るには第 2 引数の seal（既定の seal、§6.8）を使う。private な sealer を
置く必要はない。当時はスマートコンストラクタを `.impl` のキーとして渡していたが、今は
専用のステップになっている（`.impl({ seal })` は型エラー、§6.5）。

#### なぜ 2 段呼び出しなのか

`Val.sealer<User>().impl({...})` / `Val.companion<Age>().impl({...})` が 2 段なのは、
**TS に型引数の部分推論がない**ため。Val 型を明示しつつメソッド群を推論させるには
カリー化しかない。詳細と却下した代替案は §13.1。

2 つの入口の差は「頭」だけに寄せてある。付与手段は `.impl()` ひとつで、選ぶのは
「コンストラクタが要るか」という意味のある軸だけになる。

### 6.2 `with` / `update`

**自由関数版 `Val.with` は提供しない。** 実行時に型を特定できず、その型の seal に
ディスパッチできないため。companion のメソッドとして提供する。

```ts
User.with(user, patch);
// 内部的には seal({ ...user, ...patch }) をそのまま返す
```

- カスタム seal が未定義 → 既定の seal（コピー）を通るので戻り値は `User`
- カスタム seal が定義済み → 戻り値は `ReturnType<typeof seal>`

これにより「`with` がスマートコンストラクタを迂回する」穴が塞がる。値を作る経路は
すべて seal を通る、という §6.8 の不変条件の一部である。

#### 実装時に見つかった穴: `from` の引数型を検査していない

`with` は `from` に「マージ後のペイロード」を渡す。したがって `from` がペイロード全体を
受け取れないと成立しないが、当初の実装はそれを検査せず `construct(merged)` を呼んでいた。
`from(x: number, y: number)` のような定義が型検査を通り、実行時に壊れる。

最初の対処は `with` / `update` を、`from` が `SeedOf<V>` を受け取れるときにだけ生やす形
（受け取れない場合は §6.1 で捨てたはずの「引数型にメッセージを埋め込む」技で説明を出す）
だった。**これは §6.7 で撤回した。** エラーが `with` の呼び出し側に出るせいで、原因
（10 行上の登録）から離れていたため。今は `implSeal` の引数を `SealImpl<V>` に制約して、
登録時に落とす。

#### プリミティブ・配列の Val には `with` を生やさない

`Patch<T>` はオブジェクト以外に対して `never` を返す。当初はそのまま
`Routed<V, M, never>` になっていたので、`Val<"IsoDate", string>` の companion にも
`with` が生え、**引数が `never` で呼べないのに補完に出る**という状態だった。実行時にも
`TypeError` を投げるだけで、型が先に止められるはずのものを実行時に持ち越していた。

`with` を条件付きのプロパティにして、パッチする対象がないときは型から丸ごと消す:

```ts
// 当時の形。`Routed` はのちに削除され、今は Slot と Rebuild で同じことをしている（§6.7）
type WithMethod<V, M> = [Patch<SeedOf<V>>] extends [never]
  ? Record<never, never>
  : { with: Routed<V, M, Patch<SeedOf<V>>> };
```

`[...] extends [never]` と裸でない形にするのは、`never` に対する条件型の分配を止めるため
（分配すると条件全体が `never` に潰れる）。

- `update` は残す。プリミティブでも値→値の変換は意味を持つ（`IsoDate.update(d, addDay)`）。
- 実行時の `TypeError` ガードも残す。型を通らない JS からの呼び出しには依然として必要で、
  役割が「主たる防御」から「最後の網」に下がっただけ。
- 配列 Val も同じ扱いになる。要素単位の patch は `Patch` が表現できないので、`update` で
  丸ごと作り直すのが正しい経路。

#### patch 内の `undefined` は「削除」

| patch の書き方     | 意味       |
| ------------------ | ---------- |
| キーを省略         | 変更しない |
| `{ k: undefined }` | **削除**   |
| `{ k: value }`     | 設定       |

patch は `Partial` なので、キーを省略すれば既に「変更しない」を表現できる。`undefined` にも同じ意味を持たせると**同じ操作に 2 通りの書き方ができる一方で、削除を表現する手段がなくなる**。

`undefined` は §3.5 で値の空間から除外した結果、**sentinel として使える唯一の値**になっている。その希少な枠は、他に表現手段のない「削除」に割り当てる。これで 3 つの操作が過不足なく揃う。

実装も素直になる。`{ ...user, ...patch }` はスプレッド時点で「キーが存在して値が `undefined`」になるので、**マージ後に `undefined` のキーを落とせばそのまま削除**。マージ前に patch を掃除する必要がない。

参考: JSON Merge Patch（RFC 7386）は `null` を削除の意味に使う。本ライブラリは `null` を正当な値として許すため同じ手は使えないが、**「値空間から外れた値を削除の sentinel にする」という発想は共通**。

#### 誤削除への防御

`with(u, { nickname: form.nickname })` で `form.nickname` がたまたま `undefined` だったときの意図しない削除を、多層で防ぐ。

**1. 必須キーへの `undefined` は型エラーにする。** patch の型を optional / required で分ける。

```ts
type Patch<T> = { [K in Exclude<keyof T, OptionalKeys<T>>]?: T[K] } & {
  [K in OptionalKeys<T>]?: T[K] | undefined;
};
```

**2. optional キーの削除は正当な操作。** 「あってもなくてもいい」と宣言した項目なので、消せて当然。

**3. EOPT off でも seal が拾う。** §3.5 と同じ壁で、EOPT が off なら required キーへの `undefined` は型で止まらない。ただしその結果は不変条件を満たさないのでカスタム seal が `Err` を返す。**静かに壊れず、大きな音で失敗する**。

穴が残るのは「EOPT off かつカスタム seal 未定義」の組み合わせのみ。§3.5 と同じ立て付けであり、README の EOPT 推奨がここでも効く。

### 6.3 Result 型は提供しない

すでに neverthrow / Effect / fp-ts など多数あるため、このライブラリでは提供しない。

そして**提供しなくても `with` は実装できる**。`with` は seal の戻り値を unwrap する必要がない（古い値は既に妥当なので、マージして seal に流すだけ）。戻り値の型を `ReturnType<typeof seal>` として推論すればよく、ライブラリは `Result` の中身を一切知らずに済む。どの Result 実装でも自作でも動く。

### 6.4 `update` の注意

関数で変換する `update` は、チェーンすると `Result<Result<...>>` になりかねない。

**`update` は「値 → 値」に限定する。** 失敗し得る変換は `with` + 利用者側の `andThen` に任せる。

### 6.5 メソッドの第一引数を Val に固定する（`impl` / `implSeal`）

`greet(u: User)` の `: User` は、全 companion の全メソッドに書く定型だった。`impl` の
index signature を Val 始まりの**単一の関数型**にすると contextual typing が効き、
注釈が不要になる。

```ts
export type CompanionMethods<V extends AnyVal> = {
  equals?: (a: V, b: V) => boolean;
  seal?: never;
  create?: never;
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonMethod;
};
```

#### 「単一の関数型」でなければ効かない

contextual typing が生きる形は 1 つしかない。実測で全滅した代替案:

| 形                                                  | 結果                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| union に `AnyFn` を足して `from` を逃がす           | 候補シグネチャが 2 つになり contextual typing が消える                                    |
| F-bounded な mapped 制約 `M extends Table<V, M>`    | 検証は効くが contextual typing は消える                                                   |
| intersection `{ from?: AnyFn } & Record<string, …>` | `Record` 側が全プロパティを見るので例外にならない                                         |
| overload（strict → loose の 2 本）                  | `from` を含むと他のメソッドまで implicit any になり、loose 側が何でも通すので検証も消える |

さらに、**`M` にデフォルト型引数を与えるだけで contextual typing が死ぬ**。
`impl: <M extends CompanionMethods<V> = Record<never, never>>(methods?: M) => …` だと
TS は制約を contextual type に使わなくなり、全メソッドの第一引数が implicit any に落ちる。
引数なしの `.impl()` はオーバーロードで残した:

```ts
impl: {
  (): Sealed<V, Record<never, never>>;
  <M extends CompanionMethods<V>>(methods: M): Sealed<V, M>;
};
```

`...rest` を `never[]` ではなく `any[]` にしているのは、注釈のない第二引数以降が `never`
に推論されるのを避けるため。代入互換性はどちらでも通る。

#### コンストラクタは `.implSeal` / `.implCreate` に出す

第一引数が Val でない関数はこの制約を通らない。スマートコンストラクタの第一引数は
「封をする対象」であって Val ではないので、メソッド表には置けない。builder の一段に出す:

```ts
export const Age = Val.companion<Age>()
  .implSeal((n: number): Result<Age> => …)
  .impl({
    next(a) { … }, // a は Age
  });
```

オプション引数（`Val.companion<Age>({ seal })`）は取れない。TS は型引数の部分推論が
できないので、`V` を明示した時点で関数の型は推論されずデフォルトに落ちる。§2 で
`sealer<V>().impl()` を 2 段にしたのと同じ理由。

**名前は `implSeal`。** `.seal(fn)`（登録する）と `Age.seal(x)`（呼ぶ）が同名になる駄洒落を
避けた。`smart` / `ctor` は短いが「生えるメソッドが何であるか」を名前が示さない。
`impl` の第 2 スロットにする案は名前の問題は消えるが、意味が位置でしか決まらず、
一番重要なコンストラクタが従属物に見える。名前が `seal` に落ち着くまでの経緯は §6.9。

#### `.impl({ seal })` / `.impl({ create })` は型エラーにする

プリミティブ payload では `V` が第一引数の型に代入可能になることがある
（`Val<"Age", number>` に対する `seal(n: number)`）。すると **関数が制約を通り、
ただのメソッドとして生えて、`with` / `update` が配線されない**（`create` なら
**seal を通らない鋳造経路ができる**）という無言の事故になる。実際にこの移行中に踏んだ。
`seal?: never` / `create?: never` を宣言して弾く。

§6.2 の `Routed` のようにメッセージを型に乗せる（`seal?: "use .implSeal() …"`）案も試したが、
`never` を採った。エラー文の見た目は落ちる — optional 修飾子のせいで `never | undefined` に
なるため、TS は次のように言う:

```
Type '(n: number) => Age' is not assignable to type 'undefined'.
```

`Routed` でメッセージ埋め込みが要るのは、**あそこには他に情報の置き場がない**から
（引数の型としてしか出てこない）。ここは `seal` というキー名自体が何をしようとしたかを
示していて、`implSeal` は API のすぐ隣にある。型の意図（「ここに `seal` は置けない」）を
そのまま書けるほうを取る。

#### sealer に `implSeal` は生やさない

**sealer は既定の seal そのもの**であり、その隣に検査つきの seal を並べれば、最初の
seal が「迂回する穴」になる（§6.1）。`implSeal` は companion 専用。

#### `implSeal` は必須にしない

`Val.companion<V>().impl({…})` をカスタム seal なしで許すか。**許す。**

1. **必須にしても閉じる穴がない。** `Val.of` は公開 API で、seal の有無に関わらず
   `Val.of<Age>(-1)` は通る。必須化は安全性を 1 ミリも増やさない。
2. **一貫性が取れない。** `Val.companion<V>()` は素の状態で既に使える Companion
   （`equals` / `with` / `update` を持つ）。`.impl` だけ seal 必須にしても手前が空いている。
   塞ぐなら素の companion も殺すことになり、§6.1 の「sealer の鏡像」という位置づけが壊れる。
3. **偽の seal を書かせる。** `(v) => Val.of<V>(v)` という素通しのラバースタンプが生える。
   検証しているように読めて何もしていない seal は、seal がないことより悪い。

カスタム seal なし companion は意味のある形でもある。値が境界（デコーダ、DB 行、外部 API）から
来る型では、コンストラクタを持たず振る舞いだけ束ね、構築は `Val.of` で行うのが正しい。

#### 失うもの

第一引数が Val でない補助ファクトリ（`Money.fromCents(n)` / `IsoDate.parse(s)`）は
companion に置けなくなる。これらは「値に対する振る舞い」ではないので、素の export 関数に
分離されるほうが筋が通っている、と判断した。多引数のコンストラクタ（`Point.create(x, y)`）は
`implCreate` が引き受けるので影響なし。

---

### 6.6 `with` / `update` は上書き可能にする（強制はしない）

カスタム seal があるとき `with` / `update` の手動定義を必須にするか、という論点。**必須には
しない。ただし書けるようにする。**

必須にすべきでない理由は §6.5 の `implSeal` 必須化と同じで、**ラバースタンプを書かせる**から。
自前の `with` は `seal({ ...v, ...patch })` というライブラリの既定そのものになる。

一方で、実装を見直したら**逆向きの穴**が空いていた。`Routed` は `from` がペイロードを
受け取れないとき「write your own updater」と言うのに、**書く場所が型に存在しなかった**。
`.impl` に自前の `with` を書くと `attach` が既定の後にユーザーのメソッドを定義するので
**実行時には正しく上書きされる**が、型は `Omit<M, "with" | "update">` で捨てていたため
既定のシグネチャのまま。呼び出し側は相変わらずエラーになる。型と実行時が食い違っていた。

`equals` と同じ扱いに揃えた:

```ts
type WithMethod<V, M, F> = "with" extends keyof M
  ? { with: M["with"] }
  : [Patch<SeedOf<V>>] extends [never]
    ? Record<never, never>
    : { with: Routed<V, F, Patch<SeedOf<V>>> };
```

副次的に、既定では `with` を持たないプリミティブ Val（§6.2）にも、明示的に定義すれば
`with` を生やせるようになる。既定を消すことと、書くことを禁じることは別、という整理。

エラーメッセージも実態に合わせた:
`"from() does not accept this Val's payload; define your own with/update in impl()"`。

（`Routed` とこのメッセージは §6.7 で削除した。ペイロードを受け取れないコンストラクタは
`implSeal` の登録時に落ちるようになり、`with` 側に説明を出す必要がなくなったため。上書き
可能という結論だけが残っている。現在の形は §6.7 の `Rebuild`。）

#### 上書きには seal を第 3 引数で渡す

自前の `with` は「新しいペイロードを型の seal に通す」だけのことが多いが、**その seal を
参照する手段が無かった**。`YourVal.seal(...)` は companion 自身の初期化中なので書けず、
`Val.of` を直に呼ぶと型の seal を迂回する（「値になる経路はすべて seal を通る」§6.8 を、
自分の手で破れる唯一の場所）。名前付きの関数に括り出して両方から呼ぶ、という定型を
ドキュメントに書いていたが、定型は API の不足の兆候だった。

`equals` が `deepEquals` を第 3 引数で受け取るのと同じ形にした。理由も同じで、
**自由関数として公開すると型の seal を迂回する経路になる**ので、必要な場所にだけ手渡す。

```ts
.impl({
  with(u, patch: Patch<Fields>, seal) {
    return seal({ ...u, ...patch });
  },
});
```

公開側は 2 引数に潰す（`WithoutSeal<T>`）。パラメータの数で分岐するので、seal を取らない
2 引数の上書きはそのまま公開される:

```ts
type WithoutSeal<T> = T extends (...args: infer A) => infer R
  ? A extends [infer Value, infer Arg, unknown]
    ? (value: Value, arg: Arg) => R
    : T
  : T;
```

第 3 引数の型を与えるために `CompanionMethods<V, F>` に `with?` / `update?` を宣言した
（`equals?` と同じ立て付け）。patch の型は利用者が決めるものなので `any` にしてある。
`never` にすると index signature（`(value: V, ...rest: any[]) => unknown`）に代入できず
TS2411 になる — `any` は `never` に代入できないため。

---

### 6.7 seal と create を分ける

§6.6 の時点で、既定の `with` には型で塞げない穴が残っていた。`Routed` の判定は
`SeedOf<V> extends P`（コンストラクタがペイロードを受け取れる）だが、これは**必要条件で
あって十分条件ではない**。

```ts
.implSeal((input: Fields): User => make({ id: crypto.randomUUID(), ...input }))
```

`SeedOf<User>`（`{id, name, email}`）は `Fields`（`{name, email}`）に代入可能なので
`with` は型検査を通る。しかし実際に走るのは `seal({ id, name, email })` で、この関数は
渡された `id` を捨てて新しい `id` を振る。**型エラーなしに ID が毎回変わる。**

構造的にこれを弾くことはできない。「引数がペイロードそのもの」を要求すると
`seal(input: unknown)` という zod の正当な形が消える。`unknown` も `Fields` も同じく
`SeedOf<V>` の真の supertype で、区別がつかない。

#### 規約: seal は冪等（鋳造は `create` へ）

seal は「ペイロードに封をする」操作であり、**`seal(v のペイロード)` は `v` を返さなければ
ならない**。ID 生成・時刻・連番のような鋳造はこの法則を破るので `create` に出す。
登録も別ステップ:

| ステップ        | 制約                                                                            | 生えるもの |
| --------------- | ------------------------------------------------------------------------------- | ---------- |
| `implSeal(f)`   | `f: SealImpl<V>`（`(value: SeedOf<V>, ...rest: never[]) => unknown`）           | `seal`     |
| `implCreate(f)` | `f: Minter<V>`（`(...args: never[]) => SeedOf<V>`。引数は自由、戻りは payload） | `create`   |

得られるもの:

1. **エラーが間違えた場所で出る。** 多引数コンストラクタは `implSeal` の**登録時**に
   落ちる。以前は 10 行下の `Point.with(...)` で怒られていた。`Routed` の
   「define your own with/update in impl()」分岐は不要になり、削除した。
2. **`create` と seal が共存できる。** DDD の create / reconstitute の分離そのもの。
   `create` がペイロードを鋳造し、seal がそれに封をし、`with` は seal を通るので
   `create` が再実行されない。§6.6 で「自前の `with` を書くしかない」と言った ID の例が、
   既定のまま正しく動くようになった。
3. **`create` だけでも `with` / `update` は生える。** 既定の seal（コピー）もペイロード
   関数だからで、`create` が振った `id` はコピーされて保存される。かつては
   「`create` だけなら再構築の当てがない」として型から消していたが、`create` の戻り値が
   seal を通るようになった時点（§6.8）で当てはまらなくなった。`Rebuild` は分岐を失った:

```ts
type Rebuild<V, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;
```

#### 規約は規約のまま

サブセット形（`seal(f: { name: string })`）は今も `SealImpl<V>` の制約を通る。
§6.5 の `seal?: never` と同じで、型では閉じない。冪等性も型では書けない。`create` という
別ステップを用意し、そこに鋳造の置き場を作ることで、**規約を守る側が楽になる**という
形で担保する。

#### 名前

`new` も検討した。プロパティ名としては合法（`User.new(...)` は動く）だが、型リテラルで
`{ new(x: number): Y }` と書くと構築シグネチャとして解析される罠があり、予約語でもある。
`create` を採った。

#### sealer には生やさない

当初の理由は「素のコンストラクタ経由で `create` を迂回できる（穴）」だったが、`create` の
戻り値が seal を通るようになった今（§6.8）、これは穴の話ではない。sealer は callable なので
`create` を足しても構築経路は 1 本も絞られず、**得られるのは名前空間だけ**である。

問題は、**名前が果たせない約束をする**こと:

```ts
const Task = Val.sealer<Task>().implCreate((t: Fields) => ({ id: uuid(), ...t }));

Task.create({ title: "x" }); // id が振られる
Task({ id: "forged", … });   // ← 隣で素通り
```

companion の `create` は「鋳造は `create`、封は seal、それ以外に値になる経路は無い」
（§6.7 / §6.8）の一部として意味を持つ。sealer に同じ名前を置くと、同じ `create` が型に
よって強さの違うものになり、守っているように読めて何も守らない。`.unpatchable`（§6.10）も
companion builder のステップなので、道具立てとしても中途半端になる。

多引数の別名コンストラクタ（`Point.create(x, y)`）が欲しいだけなら、§6.5 で補助ファクトリを
追い出したのと同じく素の export 関数で足りる。そして **「sealer に `create` が欲しい」は
たいてい companion が欲しい合図**で、鋳造したいフィールドがあるなら素の payload を誰でも
渡せてはいけない。無いことがその方向に押す、という §6.1 と同じ効きかたをする。

（後方互換に追加できるステップなので、実例が積み上がったら再考すればよい。）

---

### 6.8 seal を唯一の関門にする

§6.7 の分離まで来ると、`create` は自分で `Val.of` を呼んで値を作っていた。つまり
**`create` だけが検査を通らずに値を鋳造できる**。§6.6 が `with` について塞いだ穴の、
鋳造側の残りである。

**`create` の戻り値を seal に流す。** `create` の戻り型を `SeedOf<V>` に固定し、
公開される `create` は `seal(create(...args))` になる。

```ts
.implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f })) // payload を組むだけ
.implSeal((u: SeedOf<User>): Result<User> => check(u)) // 封をするのはここだけ
User.create(fields); // → Result<User>
```

- **値になる経路が 1 本になる。** 「payload が Val になるのは seal を通るときだけ」が
  ライブラリの不変条件になり、`create` は「引数から payload を組む」だけの存在に痩せる。
- **戻り型が揃う。** 以前は `create` が `User`、`from` が `Result<User>` を返す不揃いが
  ありえた。今はどちらも `Constructed<V, F>`。
- **ユーザーコードから `Val.of` が 1 つ減る。**
- **カスタム seal がないときは既定の seal（コピー）に落ちる。** `implCreate` の制約を
  `F` の有無で変えると登録順で `create` の型が変わってしまうので、常に `SeedOf<V>` を
  要求して実行時にどちらの seal を使うかを決める。

失うのは **`create` 自身が失敗できること**。`Result<SeedOf<V>>` を返されるとライブラリが
bind しなければならず、「ライブラリは `Result` を知らない」（§6.4）に反する。壊れうる入力の
検査は seal 側に寄せる（`seal(v: unknown)` は制約を通るので zod 形はそのまま書ける）。
どうしてもペイロードを組む段階で失敗するものは素の export 関数に分ける（§6.5 で
`fromCents` を追い出したのと同じ判断）。

#### seal の引数は不変のまま、コピーは `Val.of` の 1 回だけ

seal の引数を可変（`PayloadOf<V>`）にして、公開 `seal` が入口でディープコピーを取る案を
一度実装した。正規化のために配列を `sort` できる、可変型を要求する他人の関数に渡せる、が
理由だったが、捨てた。

1. **immer 風の可変ドラフトになる。** 「値 → 値」に限定した `update`（§6.4）と書き味が
   矛盾する。
2. **ES2023 で不要になった。** `toSorted` / `toSpliced` / `with` / `toReversed` があるので、
   正規化は「書き換える」ではなく「導出する」で足りる。
3. **コピーが 2 回になる。** 入口のディープコピーは、末尾の `Val.of` のディープコピーに
   上乗せされる。

引数を `SeedOf<V>` に戻せば、**入口のコピーはそもそも要らない**。readonly の引数を受けた
seal は（キャストしない限り）呼び出し側のオブジェクトに触れず、所有権は `Val.of` が取る。

カスタム seal が無い場合は既定の seal（`copy`）がその 1 回を担う。可変引数を検討したときに
出てきた「内部呼び出しだけコピーを迂回できるか」という問いも、コピーが入口に無いので
消滅する。

#### 経路とコピー回数（シナリオ別）

`copy` はペイロード全体を 1 回なめるディープコピー。浅いコピー（トップレベルの
スプレッド）は別カウントにしてある。ネストした子 Val もプレーンデータなのでディープ
コピーの対象に含まれるが、**子の seal は再実行されない**（§5 のディスパッチ不可）。

| 呼び出し                                   | カスタム seal を通るか        | 浅いコピー                | ディープコピー                      |
| ------------------------------------------ | ----------------------------- | ------------------------- | ----------------------------------- |
| `Val.of<V>(x)` / sealer の callable `V(x)` | 通らない（これが既定の seal） | 0                         | 1                                   |
| `V.seal(x)`（カスタム seal）               | 通る                          | seal が導出した分だけ     | 1（最後に通す既定の seal）          |
| 同上・検証に失敗して `Err` を返す          | 通る                          | 同上                      | **0**（既定の seal を通さない）     |
| `V.with(v, patch)`（カスタム seal なし）   | —                             | 1（マージ）               | 1                                   |
| `V.with(v, patch)`（カスタム seal あり）   | 通る                          | 1 + seal の導出分         | 1                                   |
| `V.update(v, fn)`                          | 上と同じ                      | `fn` が作る分（通常 1）   | 1                                   |
| `V.update(v, fn)`（`.unpatchable` あり）   | 上と同じ                      | `fn` の分 + マージ 1      | 1                                   |
| `V.create(args)`                           | 通る                          | create が組む分（通常 1） | 1                                   |
| `.impl` の自前 `with` → 第 3 引数の seal   | 通る                          | 自前実装しだい            | 1                                   |
| `.impl` の自前 `with` → `Val.of`           | **通らない**                  | 同上                      | 1                                   |
| `Val.unwrap(v)` → 加工 → `V.seal(...)`     | 通る                          | 加工分                    | **2**（unwrap と seal で 1 回ずつ） |

読み取れること:

- **どの正規経路もディープコピーは 1 回**で、位置は常に「値になる瞬間」＝ 既定の seal。
- 失敗経路はコピーしない。検証が落ちる入力に対してコピー代を払わない。
- 浅いコピーは経路の構造そのもの（マージ、`fn` の戻り、正規化の導出）で、
  ES2023 の非破壊メソッドで書く分もここに乗る。可変ドラフト案が要求した入口の
  ディープコピーに比べれば桁が違う（§4.1 の実測: flat 3 キーで 47ns、
  ネスト ~40 ノードで 858ns）。
- `Val.unwrap` 経由の派生だけが 2 回になる。§4 が「派生に `unwrap` を使うな」と
  言っているのはこのため。

失うのは、可変ペイロードを要求する他人の関数に payload をそのまま渡せないこと。
`Val.unwrap` か spread を挟む（§4）。

公開される `seal` の型は登録された関数そのもの。zod 形（`seal(u: unknown)`）が任意の
入力を受け取れる性質もそのまま残る。

#### 既定の seal を第 2 引数で渡す

custom seal の中で値を作るには `Val.of<Age>(n)` と型引数を書く必要があった。既定の seal
（brand + copy = その型に束縛された `Val.of`）を第 2 引数で渡せば、それが消える:

```ts
.implSeal((n, seal) => (n >= 0 ? ok(seal(n)) : err("negative")))
```

`equals` の `deepEquals`、上書き `with` / `update` の seal（§6.6）と同じ立て付け。渡すのは
**既定の** seal であって自分自身ではないので、再帰にはならない。1 引数で書かれた seal は
そのまま登録される。公開側は `WithoutDefaultSeal<F>` で第 2 引数を落とす（`WithoutSeal` と
同じくパラメータ数で分岐）。

**それでも `Val.of` は公開したままにする。** 消せば `.impl` のメソッドが自分の型の値を
作れなくなり（seal を全メソッドに渡すのは §6.5 の「第一引数は Val、残りは利用者のもの」を
壊す）、seal なし companion（§6.5）も成立しなくなり、検証済みの値の再持ち上げ（JSON 往復、
テストのフィクスチャ）も seal 経由の再検証を強制される。そもそも `payload as Age` は残るので
**閉じられる穴ではない**。§6.1 で「コンストラクタのゲートは無意味」と結論したのと同じ構図で、
`Val.of<Age>(x)` は型引数を明示するぶん grep できる逃げ道である、という位置づけ。

| 値を作る場所                          | 手段                     |
| ------------------------------------- | ------------------------ |
| custom seal の中                      | 第 2 引数の seal         |
| `with` / `update` の上書き            | 第 3 引数の seal（§6.6） |
| `.impl` のメソッド / 境界での持ち上げ | `Val.of`                 |

---

### 6.9 名前が `seal` になるまで

登録は `implFrom`、生えるメソッドは `from` だった。順に落とした:

- **`from`** — `implFrom` が Rust の `impl From<T> for U`（＝任意の型からの変換）に読める。
  それは今の `create` の意味であり、**名前が指すものが実際と逆**だった。
- **`validate`** — 検査は seal がやることの一つにすぎない。正規化（§5 の Email）も
  `Result` 包みも「検証」ではないし、`validate(x)` が引数をコピーするのは奇妙。
  boolean を返す述語だと誤読させる語でもある。
- **`parse`** — コピーも失敗も自然に読める。しかし parse は「緩い入力を解いて型にする」語
  なので、**引数がペイロードに固定されている理由を名前が説明しない**。その制約は
  `with` / `update` がここを通せるために本質的なもので、恣意的に見えては困る。
- **`seal`** — 封をする対象は中身そのものなので、引数がペイロードであることが名前から出る。
  すでにライブラリの語彙（`Val.sealer`）で、三分割が「同じ関門の制約なし版 / あり版 /
  引数カスタム版」として一列に並ぶ。「鋳造してはいけない」という §6.7 の規約も動詞から
  読み取れる。

|                   | 引数    | 制約                         |
| ----------------- | ------- | ---------------------------- |
| `Val.sealer<V>()` | payload | なし（brand + コピーだけ）   |
| `.implSeal(f)`    | payload | あり                         |
| `.implCreate(f)`  | 自由    | payload を組んで seal に流す |

**残るリスクは `Object.seal` / `sealed class` との混線。** JS の `Object.seal` は実行時に
プロパティ追加を禁じる操作だが、valof は凍結しない（§7.7）。Rust / Scala / Kotlin の
`sealed` は型宣言に付く形容詞（閉じた継承階層）だが、こちらは値を作る動詞。valof には
subtyping も variant も無い（TaggedEnum は「入れない」）ので誤読の材料は薄いが、README と
doc に一行で潰しておく。

---

### 6.10 `unpatchable` — 更新経路から外すキー

`create` が鋳造した `id` を `with` / `update` から触らせない、という §8.4 のパターンは、
**`with` / `update` を両方とも上書きする**ことでしか書けなかった。しかし上書きの中身は
既定と 1 文字も違わず、**唯一の内容は patch の型**である。§6.5 / §6.6 で「ラバースタンプを
書かせない」と決めておきながら、最も頻出するパターンでそれを強制していた。

宣言のステップを足す:

```ts
Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal(seal)
  .unpatchable<"id">();
```

#### キーは型引数で渡す（実行時には存在しない）

`unpatchable("id")` と文字列で渡せば実行時にもキーが分かるが、型引数だけにした。
ブランドがファントムであることと揃うし、得られる保証も §8.4 が既に
認めている水準 —「通常の更新経路では触れない。`Val.of` では偽造できる」— と同じだから。
型を迂回したケース（`any` 経由など）で実行時に旧値を復元する挙動は、バグを隠す側にも
働く。

**キー名が無くても `update` は成立する。** `unpatchable` を呼んだという事実（boolean 1 つ）
だけ実行時に残せば、`update` は `seal({ ...value, ...fn(value) })` とマージすればよい。
コールバックが返すのは残りのキーだけなので、触れないキーは古い値から生き残る。

|                         | 既定                        | `unpatchable<K>()` あり              |
| ----------------------- | --------------------------- | ------------------------------------ |
| `with` の patch         | `Patch<SeedOf<V>>`          | `Patch<Omit<SeedOf<V>, K>>`          |
| `update` のコールバック | `(v) => SeedOf<V>` を素通し | `(v) => Omit<SeedOf<V>, K>` をマージ |

既定側でマージしないのは、**optional キーの削除**を残すため（`update` でキーを落とすと
消える）。マージする側ではそれができなくなるので、削除は `with(v, { k: undefined })` を使う。

#### `NoExtra` はライブラリの内側へ

コールバックの戻り型を狭めるだけでは `(v) => ({ ...v, id: "forged" })` が通る。原因は
`Omit` でも `update` でもなく、**余剰プロパティ検査（freshness）のルール**。切り分けた結果:

| 書き方                                              | 結果      |
| --------------------------------------------------- | --------- |
| `const x: Plain = { owner, id }`                    | ❌ エラー |
| `i({ owner, id })`（直接の引数）                    | ❌ エラー |
| `h((): Plain => ({ owner, id }))`（返り値型を注釈） | ❌ エラー |
| `h(() => ({ owner, id }))`（返り値型は推論）        | ✅ 通る   |
| `h(() => { return { owner, id }; })`                | ✅ 通る   |
| `const lit = {…}; h(() => lit)`                     | ✅ 通る   |

余剰プロパティ検査はリテラルが**目標の型と直接突き合わされたとき**にしか働かない。
コールバックに返り値注釈がないと、TS はまず本体から戻り型を推論し、そのあと関数の
代入互換性を検査する。この時点でリテラルの freshness は失われていて、余分なプロパティは
単に無視される。

**回避策は freshness に頼らないこと。** 余分なキーを構造的なエラーにする:

```ts
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

update: <T extends Patchable<V, P>>(value: V, fn: (value: V) => NoExtra<T, Patchable<V, P>>) => …
```

`T` はコールバックが実際に返した型から推論されるので、`Patchable` にないキーは `never` に
写されてエラーになる。`T extends NoExtra<T, S>` と制約側に書くほうが見た目はきれいだが
**TS2313（circular constraint）**。§3.5 で `Val<K, T>` の自己参照制約を条件型に逃がしたのと
同じ制限で、ここでは引数の型に置く。

この技が**利用者のコードからライブラリの実装に移った**のがこの節の実利で、§8.4 は
4 行になった。

#### 名前

`implProtect` / `implFinal` / `implMinted` を経て `unpatchable` にした。

- `impl` 接頭辞は付けない。§6.5 で `impl*` は「X の実装を与える」に揃えたが、これは関数を
  1 つも渡さず型について宣言するだけのステップ。**実装を与える手順と、性質を宣言する手順が
  名前で区別される**ほうが良い。
- `final` は JVM の語彙（`final val` / `sealed abstract class`）を持ち込み、`seal` を
  `sealed trait` の意味に誤読させる方向に働く。`finalize` は GC のファイナライザ
  （`FinalizationRegistry`）と、ビルダーの終端（`.build()`）の両方に読める。
- `minted` は §6.7 の鋳造の比喩と最も整合するが、`create` を持たない型では意味が曖昧になり、
  英語圏外の読み手には通じにくい。
- `unpatchable` は既に公開している `Patch<T>` からしか意味を取らないので、新しい比喩を
  持ち込まない。やっていること（patch の面からキーを外す）以上の約束もしない。

---

## 7. 見送ったもの（と、その理由）

すべて §1 の一本の線から落ちている。

### 7.0 コンストラクタのゲート

→ §6.1。`Val.sealer` にコンストラクタ生成を分離した結果、検出も差し替えも不要になった。
作らなければ迂回できない。

### 7.1 実行時 freeze

不変性の実効的な穴はエイリアシングのほうで、それは §4.1 のコピーで閉じた。freeze が追加で
防ぐのは「`readonly` を意図的に破る書き込み」だけで、それは利用者側の責任と考える。
（なお `as` が必須というわけではなく、`Object.assign(v, {...})` や
`const r: Record<string, unknown> = v; r.k = 1` はキャストなしで型チェックを通る。それでも
「値に書き込む」という意図的な行為であることに変わりはない。）

当初は「freeze があるから部分木を共有できる」と考えたが、実測すると共有の根拠は WeakSet の
ほうで、freeze は単なる上乗せコストだった（ns/op）。

|                          | 入力が新品 | 子が既に Val | flat 3キー |
| ------------------------ | ---------- | ------------ | ---------- |
| コピーのみ               | 853        | 833          | 44         |
| コピー + freeze          | 1,216      | 1,182        | 63         |
| コピー + WeakSet 再利用  | 1,055      | 220          | 142        |
| コピー + freeze + 再利用 | 1,387      | 258          | 162        |

freeze は一律 25〜30% の上乗せで、得るものがない。読み出し側でも、オブジェクトの
プロパティ読みは影響なし（3.54 vs 3.99 ns）だが、**配列の要素アクセスが 1.7x 遅くなる**
（5.42 vs 3.11 ns、V8 が `PACKED_FROZEN_ELEMENTS` に落とすため）。

後からオプトインで足せるので v1 では切る。

WeakSet 再利用のほうも、既定では入れない。子が既に Val なら 833 → 220 ns と効くが、
`flat 3キー` は 44 → 142 ns で **3.2x の劣化**になる。Val の大半は浅くて平坦なので、
常時オンでは多数派が損をする。freeze と同じくオプトインの枠に置く。

なお、この再利用は「ネストは必ず Val を通す」という規則を型で強制しなくても成立する。
封じた値かどうかを実行時に引くだけで、プレーンオブジェクトのネストは遅い経路を通るだけ。
最適化のために許可型を狭める理由にはならない（→ §7.3 の「説明が 1 行で済む」）。

#### 撤回（一部）: dev 限定の freeze は採る

上の却下は**常時 freeze** についてのもので、その根拠（一律 25〜30% の上乗せ、読み出し側にも
影響、得るものなし）は変わらない。ただし §4.1 のノード再利用を入れたことで**不変性違反の
影響範囲が変わった**。キャストで値を書き換えたとき、以前はその値 1 つが壊れるだけだったが、
共有しているすべての値に波及するようになった。

そこで **development でのみ freeze する**。

- 判定は `assertPlainObject` と同じ `process.env.NODE_ENV`。モジュール定数 `development` に
  まとめたので、production ビルドでは分岐ごと畳まれる
- **production の gzip は 937 B のまま変わらない**（development ビルドは 1.02 → 1.04 kB）
- `Val.unwrap` は `sealing = false` で走る。このフラグが「共有しない / 登録しない / freeze しない」の
  3 つを同時に決める。可変なコピーを返す契約なので 3 つとも必要

保証としての位置づけは変わらない。**freeze は保証ではなく開発時の検出**であり、production では
`Object.isFrozen` は `false`。§7.1 の「常時オンでは多数派が損をする」という結論はそのまま。

### 7.2 Map / Set

`ReadonlyMap` / `ReadonlySet` は型レベルの飾りで、実行時は素の Map。`Object.freeze` も効かず JSON も通らない。

独自の不変型で包む案も却下:

- `JSON.stringify` が独自形になる。`toJSON` を書いても復元は自動で戻らないので、「境界を越えられる」が「専用シリアライザを通せば越えられる」に格下げされる
- メソッドを持たせるなら実質 class で、`structuredClone` でプロトタイプが落ちる。class を避けた元の動機を自分で壊す

さらに `structuredClone` は**キーの参照同一性を壊す**:

```ts
const key = { id: 1 };
const m = new Map([[key, "v"]]);
structuredClone(m).get(key); // undefined
```

オブジェクトをキーにした Map は構築した瞬間に引けなくなる。よってキーはプリミティブに限定するしかなく、それなら `Readonly<Record<string, T>>` でほぼ足りる（→ §8.1）。

O(1) ルックアップが本当に必要になったら、値はプレーンな配列のまま WeakMap に索引をキャッシュする方法がある。非破壊的に後から足せる。

### 7.3 Date / Temporal

**両方とも許可型から外す。** ISO 8601 文字列（`string`）か epoch ms（`number`）を推奨する。

`Date` は:

- ミューテータが内部スロットを触るので `Object.freeze` でも止められず、不変性の主張と両立しない
- `JSON.stringify` で文字列になり `JSON.parse` で戻らない、という往復の非対称がある
- デフォルトの deep equals で参照比較になるため特別扱いが要る

独自型に包む案は §7.2 と同じ理由で却下。加えて、日付演算メソッド（`addDays` / `diff` / フォーマット）を生やし始めると**日付ライブラリを書くことになる**。タイムゾーン・DST・月末・ロケールは底なし沼で、値オブジェクトのライブラリが片手間で持つスコープではない。メソッドなしの薄いラッパーにすると、使う側は結局中身を取り出すので包む意味がない。

`Temporal` は不変なので `Date` ほど悪くないが、クラスインスタンスであり JSON の往復は同じく非対称。「プレーンオブジェクトのみ」の例外を作ることに変わりはない。

外すことで許可型が `Primitive | Val | ReadonlyArray | Readonly<Record>` だけになり、**説明が 1 行で済む**。日付演算は利用者が好きなライブラリ（Temporal / date-fns / Luxon）でやればよい。

「型で ISO 文字列を保証したい」というニーズは、ライブラリの中核機能でそのまま解ける（→ §8.2）。

### 7.4 TaggedEnum（Effect.ts 相当）

ADT は判別子が**実データとして**必要で、「ブランドはファントム」という前提から外れる。

また ADT の価値のほぼ全てはパターンマッチの品質にあり、そこは ts-pattern が既に強い。競合するより interop を考える方が筋がいい。

v1 では見送る。やるなら別エントリポイント。

### 7.5 Result 型

→ §6.3

### 7.6 親から子のカスタム equals へのディスパッチ

→ §5

**却下: 値に symbol キーで equals への参照を持たせる。** §5 で挙げた 3 経路のうち
「値がタグを持つ」の変種。実行時に検証した結果、以下の理由で採らない。

1. **プリミティブ payload に付けられない。** `Val<"Email", string>` に `defineProperty` は
   TypeError。カスタム equals が一番欲しいのは case-insensitive な Email のような型で、
   欲しい場所でだけ使えない機能になる
2. **`structuredClone` と JSON 往復で黙って消える**（symbol キーは両方とも脱落する。
   spread は enumerable なら保持される）。`deepEquals(o, structuredClone(o))` が `false`
   になり得る。例外は出ないので、worker 境界や localStorage 経由でだけ壊れる
3. **等価性が対称でなくなる。** 片方だけが symbol を持つ組み合わせが普通に起き、
   `equals(a,b) !== equals(b,a)` になる。同値関係が壊れると Set 表現（§8.1）が崩れる
4. **コンストラクタが呼び出し側のオブジェクトを書き換えることになる**（frozen な入力は
   TypeError）

§4.1 の WeakSet 案と対比すると差が明確になる。WeakSet も「値の外に置いた出自の印」だが、
取りこぼしたときに変わるのは**速度だけで意味論は動かない**。symbol 案は取りこぼすと
等価性そのものが変わる。

親から子のカスタム equals が要るなら、親が自分で書けばよい（親の型は静的に分かっている）。

```ts
const Order = Val.sealer<Order>().impl({
  equals: (a, b) => a.id === b.id && Money.equals(a.total, b.total),
});
```

新しい機構ゼロ、シリアライズに不変、プリミティブな子でも動く。冗長なぶんは §5 の
「正規形で構築する」原則で大半が消える。

#### 却下: プリミティブを独自ラッパーで包む変種

上の理由 1（プリミティブに `defineProperty` できない）を、プリミティブ payload を
`{ raw, [Symbol.equals], [Symbol.val]: true }` のようなオブジェクトで包むことで回避する案。
理由 1 と 4 は確かに消えるが、採らない。

**買えるのは 1 点だけ。** プリミティブ payload の子に対するカスタム equals のディスパッチのみ。
deep copy の削減はこの案では買えない。プリミティブのコピーはもともとコスト 0 なので、
ラッパーが削るコピーは存在しない。オブジェクト/配列の子の共有は §4.1 の所有権追跡が
意味論を変えずに解いており、ラッパーは生成コストだけを足す。構築は確実に遅くなる。

**失うもの。**

1. **JSON 往復の対称性。** `toJSON` で出す側は直せるが、`JSON.parse` は素のプリミティブを
   返す。復元にスキーマ駆動の revive、つまりコーデック層が要る。§7.2 で独自不変型を却下した
   理由がそのまま返ってくる
2. **理由 3（等価性の非対称）は残る。** `Val.of` と JSON 由来の値は素のプリミティブのままなので、
   片側だけがラッパーという組み合わせは普通に起きる
3. **§8.1 の Map / Set 慣用パターンが壊れる。** `Record<UserId, T>` や `Set<UserId>` が動くのは
   Val が実行時に素の string だから。ラッパーは参照同一性で比較されるので、内容の等しい
   2 つの `Email` で `map.get()` が引けない
4. **境界での silent failure。** `.raw` のコストはタイプ数ではなく、境界を越えるたびに要ることと、
   忘れても型エラーにならない経路があること（テンプレートリテラル、`===`、`switch`、React の
   `key`、URL 組み立て、SQL パラメータ）
5. **設計として class に劣位。** 値ごとに symbol キーで equals 参照を持つより、prototype に 1 つ
   置く class のほうが速くメモリも少ない。その class は §7.2 / §7.3 で `structuredClone` を理由に
   却下済みで、ラッパーは同じ壁に、より非効率な形でぶつかる

プレーンなデータであることはこのライブラリの差別化のすべてで、それを捨てると Effect Schema /
Data と同じ土俵に 1/50 の表面積で立つことになる。冗長さの問題は §5 の `Val.eqBy` で、機構を
足さずに削る。

---

## 8. 慣用パターン（README に載せる）

ライブラリ側の追加実装は不要。ドキュメントで示すだけ。

### 8.1 Map / Set

```ts
// Set
type Tags = Val<"Tags", Readonly<Record<string, true>>>;

// Map
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>;
```

`Record<K, null>`（Go の `map[K]struct{}` 風）より `Record<K, true>` を推奨する。`null` だと「値が null」と「キーが存在しない」の区別が型に出ず、`s[key] !== undefined` という回りくどい判定になる。`true` なら `if (s[key])` がそのまま存在判定になる。

Record 表現の利点として、**構造的等価性がそのまま集合の等価性になる**（配列表現だと `[1,2]` と `[2,1]` が別物になり `equals` のオーバーライドが必要）。§5 のデフォルト equals をキー順非依存にしておけば正しく動く。

注意点として README に書くこと:

- **数値キーは JSON 往復で文字列になる。** 数値 ID の集合には `ReadonlyArray<number>` を勧める
- **キーの順序**はオブジェクトの仕様上、数値っぽい文字列が昇順で先に来る。Set 用途なら実害はないが、デフォルト equals がキー順に依存していると壊れる
- **プロトタイプ汚染系のキー**（`"__proto__"` / `"constructor"`）。ユーザー入力をキーにする場合は `Object.hasOwn` で判定する。ヘルパを companion 側に置くのが素直

### 8.2 日付

```ts
export type IsoDate = Val<"IsoDate", string>;

export const IsoDate = Val.companion<IsoDate>()
  .implSeal((s: string, seal) => {
    /* 検証 */
  })
  .impl({
    toTemporal(d) {
      return Temporal.Instant.from(d);
    },
  });
```

ブランド + スマートコンストラクタという中核機能のショーケースになる。README の主要例として使う。

### 8.3 スキーマライブラリとの併用

検証を seal に置けば、更新経路（`with` / `update`）も鋳造経路（`create`）も全部そこを通る
（§6.2 / §6.8）。引数は `unknown` でよい — `SealImpl<V>` はペイロードを**受け取れる**ことしか
要求しない。

```ts
export const User = Val.companion<User>()
  .implSeal((input: unknown, seal): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(seal(r.data)) : err(r.error.message);
  })
  .impl({ greet(u) { … } });
```

**ワイヤ形式のデコードは seal に入れない。** `seal(json: string)` はペイロード関数では
ないので `SealImpl<V>` に落ちる（§6.7）。形式のパースは手前の別関数に分ける:

```ts
export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

値が常に検証済みで届く型（デコーダ、DB 行）は、カスタム seal を登録せず境界で
`Val.of` に持ち上げる（§6.5 のカスタム seal なし companion）。この場合 `with` / `update` は
コピーで再構築し、何も再検証しない。**境界を一度通れば以降は信頼する**という設計を
選んだことになる。

### 8.4 更新経路から外したいフィールド

コンストラクタ内で生成する ID、`createdAt`、バージョン番号。`create` が鋳造し、seal が
封をし、`.unpatchable`（§6.10）が更新経路から外す。

```ts
type Fields = Omit<SeedOf<User>, "id">;

export const User = Val.companion<User>()
  .implCreate((f: Fields): SeedOf<User> => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .unpatchable<"id">();

User.with(user, { name: "sue" }); // OK
User.with(user, { id: "forged" }); // 型エラー
User.update(user, (u) => ({ ...u, id: "forged" })); // 型エラー
```

`update` も塞ぐ必要があるのは、コールバックがペイロード全体を返す経路だから。`with` の
patch だけ絞っても `id` は届いてしまう。両方を 1 つの宣言でまとめて閉じるのが
`.unpatchable` の役目で、以前はここに `with` / `update` の上書きと `NoExtra` の定義が
並んでいた（経緯と freshness の話は §6.10）。

**それでもこれは private ではない。** `user.id` は読めるし、`readonly` は実行時に消えるし、
`Val.of<User>({ id: "forged", … })` で偽造できる。得られるのは「通常の更新経路が
`id` を動かせない」だけ。偽造も防ぎたいなら `id` は値の外に持つ。

---

## 9. 未解決 / 要確認

- [x] ~~`null` と `undefined` の扱い~~ → §3.5 で決定
- [x] ~~`Validate<T>` の自己参照制約~~ → 型エイリアスでは TS2313 になるため条件型に変更。`Invalid<Msg>` はエラーメッセージ中に表示されることを確認済み（§3.5）
- [x] ~~Mutable ↔ DeepReadonly の往復が型推論に素直に効くか~~ → 効く。プロパティの `readonly` は代入互換性に影響せず、可変配列は `ReadonlyArray` に代入できるので、引数型を `DeepReadonly<PayloadOf<V>>`（= `SeedOf<V>`）にすれば可変な入力もそのまま渡せる（§4）
- [ ] 型チェック速度のベンチマーク（§4）
- [ ] コピーの WeakSet 再利用を入れるか（§4.1）。symbol キーで代替する案は実測して却下（§4.1）。意味論を変えないので v1 後でよい。実ワークロードでネストが深いか、小さく平坦かで判断する。`with` / `update` のディープコピーを patch 由来だけに縮める話（§4.1）も同じ判断に乗る — フックは第 2 引数の既定の seal で、`Result` 対応を落とす必要はない
- [ ] **タプル対応（§4.2）→ `Val.eqBy`（§5）の順で進める。** eqBy の spec を `SeedOf<V>` から
      導く以上、タプルが潰れたままだと位置ごとの指定が書けないため、この順序は入れ替えられない。
      タプル対応は `DeepReadonly` と `Validate` の分岐追加で閉じる
- [ ] `eqBy` の `V` が戻り値の文脈から推論されるか（§5）。落ちたらビルダー段（`implEq`）に降ろす
- [ ] valof-lint に「カスタム `equals` を持つ子を構造比較している親」の規則を足す（§5）
- [ ] `eqBy` を `Val` のプロパティにするか独立エクスポートにするか（§5）。前者はバンドラが
      落としにくく、使わない人にサイズを負わせる。README の `Val.*` 表記との一貫性とのトレードオフ
- [ ] **README に性能の一行を足す（§4.1）**: `with` は何も変わらなければ値そのものを返すので、
      **手書きの spread より速くなる場合がある**（spread は必ず新しいオブジェクトを作る）。
      フレームワークの state に置くなら `with` を通したほうが再レンダリングが減る、という形で書く。
      併せて「派生した値は触っていない部分木の参照を保つ」ことも interop の節に載せる
- [ ] **README の更新（§4.1）**: `Reusing a Val` に一行足す。「`PayloadOf` は payload を
      トップレベルで合成するためのもの。フィールドには Val そのものを書く」。フィールド位置に
      置くとブランドが落ち、子の seal・子の `equals`・（追跡を入れるなら）共有を失う
- [ ] valof-lint の規則: `PayloadOf<X>` が Val の payload の**プロパティ位置**に現れたら警告する。
      正当な用法（トップレベルの交差型の基底）とは構文位置で区別できる
- [ ] 所有権追跡の閾値を interior と K=n のどちらにするか（§4.1）。実ワークロードで
      「読むだけの深い値」がどれだけあるかで決まる。ベンチは `pnpm run bench`
- [ ] 追跡を入れるなら `Val.unwrap` は共有する `copy` を再利用できない。可変なコピーを返す契約なので、
      強制コピーの経路が要る（§4）
- [ ] `Temporal` の各ランタイムでの対応状況（外す方針なので優先度は低いが、README で触れるなら要確認）
- [ ] Records & Tuples 提案の現状。2025年春に champion が取り下げて Composites を模索していたはずだが、要確認。**言語側の解決を待つ戦略は取らない**
- [x] ~~パッケージ名~~ → `valof` に決定（§12）
- [ ] **npm で `valof` を予約する**（プレースホルダを publish しておく）
- [x] GitHub リポジトリ名 `valof` の確保
- [ ] npm の既存ライブラリ調査（`brand` / `value-object` / `newtype`）— 競合の現状把握として

---

## 10. v1 のスコープ

**入れる:**

- ブランド付き型 + `Val.sealer` / `Val.companion` + `.impl()`
- 許可型の制限（Primitive / Val / ReadonlyArray / Record）
- 値としての `undefined` の禁止（optional キーは許可）
- DeepReadonly
- デフォルト `equals` とオーバーライド
- コンストラクタの有無を出自で決める（sealer 経由か否か）
- コンストラクタによる引数のディープコピー（§4.1）
- コンストラクタの登録を 2 系統に分ける（`implSeal` = 封をする唯一の関門 / `implCreate` = payload を鋳造して seal に流す、§6.7 / §6.8）
- `.impl` のメソッドは第一引数が Val に固定され、注釈不要（§6.5）
- `with` / `update`（Result 非依存、seal を通る。`.impl` で上書き可能で、そのとき seal は
  第 3 引数で渡される、§6.6）
- `.unpatchable<K>()`（更新経路から外すキーを型引数で宣言、§6.10）
- `Val.of`（既定の seal を型名つきで呼ぶ形、§2.2）
- `Val.unwrap`（可変なコピーを取り出す出口、§4）

**入れない:**

TaggedEnum、Map/Set のラッパー、Result、実行時 freeze、Date/Temporal、親からの equals ディスパッチ、自由関数版 `Val.equals` / `Val.with` / `deepEquals`、コンストラクタのゲート、sealer への `implSeal` / `implCreate`

---

## 11. README の構成案

「何ができるか」より先に「なぜプレーンなのか」を書く。§1 の一行を冒頭に置けば、§7 で切ったものが**なぜ切られているのかがすべてそこから導ける**。

1. 一行の思想
2. 得られるもの（`structuredClone` / JSON / React state / ファントムブランド）
3. 基本の例
4. 許可型の制限とその理由（**離脱防止のため早い位置に**）
5. 推奨 tsconfig（`exactOptionalPropertyTypes: true`）と `null` / `undefined` の方針
6. 正規形で構築する原則（§5）
7. 慣用パターン（Set/Map、日付）
8. 設計上やらないこととその理由

---

## 12. 命名

### 12.1 パッケージ名: `valof`

npm 空き確認済み。

**採用理由:**

- **`valueOf` の連想が正確** — Java/Kotlin の `Integer.valueOf()` は「生の表現から値を構築する」イディオムで、スマートコンストラクタとほぼ同義。名前から用途を推測できる
- **FP の `of` とも整合** — `Array.of` / applicative の `of` は「生の値を型に持ち上げる」操作。`Val.of` そのもの。両方の文化圏で意味が通る
- **パッケージ名が API に登場** — `import { Val } from "valof"` → `Val.of(...)`。覚えやすい
- **発音が一意** — 「ヴァルオブ」以外に読みようがない。`valob` / `valobe` は読み方が確定せず、口頭で伝えにくかった

**既知の弱点:**

- 検索エンジンが `valueOf` に自動変換する。「検索結果を絞りますか？」を押せば回避できる範囲と判断
- `valor`（npm で取得済み）とタイポ隣接。1文字違いなので警告なく別パッケージが入る
- 命名の重心は `Val.companion` にあるが、`valof` は `Val.of` 由来。ただし「value of」という一般概念の表現と解釈すれば整合する（`valcom` は語感で却下）

**商標調査（web 検索ベース、正式なクリアランスではない）:**

- 「VALOF」の完全一致は見つからず
- 近接: **VALOFE Co., Ltd.**（韓国のゲーム開発・パブリッシャー、ソウル、従業員364名、2007年設立。米国で VFUN を2019年に出願・登録、`forums.valofe.com` を運用）。1文字違いかつソフトウェア分野なので区分が接触しうる
- ただし需要者層が全く異なり、**無償 OSS は商業的使用に当たりにくい**ため実務リスクは低いと判断
- その他の近接語（VALOU=宝飾、VALOIE=化粧品、VALO=ゲームコントローラ、VALUT=ウォッカ、VALFLEUR=ワイン）はすべて無関係な区分
- **商用化・法人化する場合は再検討が必要**

**却下した候補:** `valob` / `valobe`（読み方が不定）、`valcase`（分かりやすいが語感が弱い）、`valeur`（おしゃれだがフランス語の一般語で検索性が悪い）、`valcom`（語感）、スコープ付き `@user/val`（発見されにくい）

### 12.2 型名: `Val`

**維持する。** 短く、`Val<"User", {...}>` の型宣言がノイズにならない。型と名前空間を兼ねる設計（`Val` 型 + `Val.of` / `Val.companion`）も TS 的に正しい。

検討段階で「Kotlin/Scala の `val` は束縛の不変性（TS の `const` 相当）であって値の不変性ではないので、アナロジーがずれるのでは」という懸念が出たが、**却下した**。TS プログラマにとって `const` が再代入不可を表すことは常識であり、混同する余地は小さい。仮に混同したとしても「`const` があるのになぜライブラリが必要なのか」で立ち止まるため、誤解は README の冒頭で自己解決する。むしろ注記を書く方が、不要な懸念を読者に植え付ける。

既知の弱点として、`Val` は 3 文字の一般語なのでローカル識別子と衝突しやすい。`_`（lodash）や `z`（zod）ほどの知名度が出るまでは、`import { Val as V }` で回避してもらう場面があり得る。

**却下した候補:** `Value`（正確だが長く、衝突はより深刻）、`Vo`（暗号的）、`Nominal`（値オブジェクト感が薄い）、`Data`（Effect と被る）

---

## 13. API 形状の決定（実装時）

`Val.sealer<V>().impl({...})` / `Val.companion<V>().impl({...})` という形に落ち着くまでの
検討記録。すべて実際にコンパイルして確認した結果に基づく。

（当時のスマートコンストラクタの名前は `from` で、`.impl` のキーとして渡していた。以下の
記録はその時点の綴りのまま残してある。現在は `.implSeal` で登録する `seal`（§6.9）で、
`.impl` に書くと型エラーになる（§6.5）。）

### 13.1 なぜ 2 段呼び出しなのか — 型引数の部分推論

Val 型 `V` は明示する必要があり（値から推論できない）、メソッド群 `M` は推論させたい。
だが **TypeScript は型引数を部分的に推論しない**。ひとつでも明示すると残りは推論されず
デフォルトに落ちる（[microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242)、
`_` プレースホルダ提案、2018 年から未実装）。

したがって `Val.companion<User>({ ... })` は**書けない**。カリー化するしかない。

### 13.2 却下: `M` を第 2 型引数にする

```ts
function companion<V extends AnyVal, M extends CompanionMethods<V> = Record<never, never>>(
  methods: M,
): Companion<V, M>;
```

`M` にデフォルトを付けると**コンパイルは通るが静かに壊れる**。`companion<Age>({ from })` で
`M = Record<never, never>` に落ち、

- ユーザーのメソッドが companion から消える（`A.greet` が存在しない）
- `with` / `update` が `ReturnType<typeof from>` を返さなくなる
- 当時のゲート（§6.1）が無効化され、`A(30)` が**エラーなしで通る**

デフォルトを付けなければ `Expected 2 type arguments, but got 1` になり、
`Val.companion<User, typeof methods>(methods)` と `const` を別に切って `typeof` する必要がある。
空の `()` より冗長。

### 13.3 却下: 値レベルのトークンで `V` を推論させる

```ts
declare const __token: unique symbol;
export type TypeToken<V extends AnyVal> = { readonly [__token]: V };
const TOKEN = {} as TypeToken<never>;
export function type<V extends AnyVal>(): TypeToken<V> {
  return TOKEN as unknown as TypeToken<V>;
}

Val.companion(Val.type<User>(), { greet }); // V も M も推論される
```

1 回の呼び出しで両方推論でき、実際に動く。`[__token]` は optional にすると推論が弱くなるので
非 optional のファントムにし、キャストは `type()` の中 1 箇所に閉じ込める。

却下理由は費用対効果。空の `()` が消える代わりに、公開型 `TypeToken` と関数 `Val.type` と
実行時オブジェクトが増える。カリー化は zustand の `create<T>()(...)` などで TS 利用者に
既知のイディオムなので、見慣れない概念を足すより良いと判断した。

なお `M` にデフォルトを付けないと、メソッドを省略したとき `M` が**制約**
`CompanionMethods<V>`（`from` を optional に持つ）に落ちてしまい、当時のゲートが誤作動する。
`= Record<never, never>` が必要。

### 13.4 却下: sealer を引数に渡して `V` を推論させる

トークンの代わりに sealer 自体を渡す案。sealer は `from` の中でどうせ使う実在の値なので、
ファントムを増やさずに `V` と `M` の両方を推論できる（これも動作確認済み）。

```ts
const seal = Val.sealer<Age>();
export const Age = Val.companion(seal, { from });
```

却下理由は**行数**。`Val.of<Age>(n)` が同じ持ち上げをやるので、private な sealer は本来不要。
この形は `V` を固定するためだけに `const seal = ...` の 1 行を強制する。
空の `()` のほうが安い。

### 13.5 却下: 第 1 呼び出しに引数を渡す

`Val.companion<V>(???)({ ... })` の `???` に何か意味のあるものを置けないか。

置ける引数は**型が `V` から完全に決まるものだけ**。第 1 呼び出しにはすでに明示的な `V` が
あるので、それ自体に推論が必要な引数は §13.1 とまったく同じ壁に当たる。

```ts
declare function companion<V extends AnyVal, R = never>(from: (value: SeedOf<V>) => R): …;

companion<Age>((n: number): Result<Age> => …);
// TS2345: Argument of type '(n: number) => Result<Age>' is not assignable
//         to parameter of type '(value: number) => never'   ← R が default のまま
```

つまり `from` は第 1 呼び出しに移せない。移すと `R` が落ち、`Age.from` の型も `with` の
戻り値型も失われる（§6.3 の「ライブラリは Result の中身を知らずに型だけ通す」が壊れる）。
`from` が第 2 呼び出しのオブジェクトに居るのは、そこには明示的型引数が一切なく、
`M` も `R` も自由に推論できるから。

3 段カリー化 `Val.companion<Age>()(from)({ ... })` なら通るが、`()()` より悪い。

### 13.6 却下: Rust 風のビルダー

```ts
Val.builder<Age>().from(fn).impl({ label }).build();
```

各ステップが独立した呼び出しになるので `from` の返り値型もその場で推論でき、
`build(): "from" extends keyof M ? Companion<V, M> : Sealed<V, M>` で呼べるかどうかも
表現できる。実際にコンパイルも通った。入口が 1 つになり、`from` が魔法のキーでなくなる
という利点もある。

却下理由:

- 全ケースで長くなる（`Val.sealer<Tags>()` → `Val.builder<Tags>().build()`）
- `.build()` が純粋な儀式。しかも省けない。各ステップが companion を兼ねると
  `Age.from(30)` がビルダーのステップと衝突するため終端が要る
- そもそも Rust にビルダーがあるのは名前付き引数・省略可能引数がないから。TS では
  その役割をオブジェクトリテラルが担っており、`.impl({ from, equals, ...fns })` は
  **すでに TS 流のビルダー**になっている

### 13.7 採用: `sealer` / `companion` + `.impl()`

- **`sealer`** — `-er` を付けたのは `Val.of` と読み違えられないため。値ではなく関数を返す
  ことが名前から分かる。「生のデータに封をして型を刻む」という比喩
- **`.impl()`** — 当初は `.companion()`（sealer 側）と `()({...})`（companion 側）で
  付与手段が 2 つに割れており、違いは「呼べるか否か」だけで分かりにくかった。
  `.impl()` に統一したことで、差が `sealer` か `companion` かという**意味のある軸だけ**に寄った。
  `methods` は class を連想させるので不採用（値にメソッドは生えない）。`fns` は中身が
  全部関数なので同語反復。「sealer / companion に関数を実装する」と読めば一般語として
  素直に通り、Rust の `impl` ブロックとも一致する

素の `Val.sealer<V>()` / `Val.companion<V>()` も既定の振る舞い（`equals` / `with` / `update`）
を持つ完全な companion にしてある。メソッドのない Val が `.impl({})` を書かずに済む。

### 13.8 副次的な決定

- **`-0` と `0` を等価とする。** `JSON.stringify(-0)` は `"0"` なので、往復すると区別が
  消える。§3.5 の `undefined` と同じ「2 経路の差異を観測不能にする」論法。実装は
  `a === b` で NaN だけ別扱いすれば済む
- **`exactOptionalPropertyTypes: true` を本リポジトリの `tsconfig.json` で有効化。**
  §3.5 で強く推奨した以上、自分で従う。必須キーへの `undefined` を弾くテストはこれがないと通らない

---

## 14. valof-lint

Investigated 2026-09-03, implemented on the `feat/valof-lint` branch (not merged into
`main` as of 2026-09-06).

A function inside `.impl({...})` is never reported as dead and never dropped from a bundle,
because `attach` puts it on the companion with `Object.defineProperty` at runtime. Static
analysis only sees an object literal passed to a function.

Measured, not assumed:

- **knip 6.34.0** flags a plain unused `export function`, and says nothing about an unused
  companion function beside it. Its `--exports` shortcut and every other issue type miss it.
- **vite/rolldown** drops the unused exported function from the bundle and keeps the
  companion one.

### 14.1 Why it is a standalone script

- **A knip plugin cannot do it.** `IssueType = keyof Issues`, and `Issues` is a fixed record
  in core (files, dependencies, exports, types, enumMembers, namespaceMembers, cycles, ...) —
  there is no member-of-an-exported-object category, and a plugin cannot add one. The plugin
  hooks (`resolveFromAST`, `registerVisitors`, ...) only ever return `Input[]`: they add
  things to treat as used, never report unused ones.
- **Lint cannot do it.** ESLint and oxlint are per-file: a rule sees one file's AST and must
  anchor its report there. Cross-file rules like `import/no-unused-modules` walk the project
  themselves, outside the lint model. oxlint also lints in parallel, so state accumulated
  across files in a custom JS plugin is unreliable. ast-grep's own `sg scan` rules fail for
  the same reason.

Companion members are only ever reached as `Companion.member`, so collecting the top-level
keys of each `.impl({...})` and counting `Name.key` across the project is enough.

### 14.2 Parser: `oxc-parser`, not `@ast-grep/napi`

Both were prototyped and gave identical results. Measured on a 400-file corpus: oxc 3.2 MB
installed and 21 ms, ast-grep 7.2 MB and 76 ms. oxc costs 33 more lines, since ast-grep's
pattern DSL (`const $N = $B.impl($OBJ)`) is replaced by a hand-written ESTree walk;
`oxc-parser` exports `visitorKeys`, so the generic descent is ten lines. It also shares
lineage with oxlint, oxfmt and Rolldown. The deciding argument: the optional peer dependency
is what a user pays to run this at all, so halving it beats the DSL.

The first prototype was text-based and missed `User["greet"]`, renamed imports,
destructuring and nested `.impl`. What is still out of reach is anything name resolution
cannot follow: `export { X as Y }` chains, `import * as ns`, computed keys, and a spread
into `.impl({...base})`.

### 14.3 Shipping it inside valof

Verified by packing and installing a test package on 2026-09-04: a `bin` entry plus
`oxc-parser` as an _optional_ `peerDependencies` entry costs a consumer who does not want it
nothing at all. Measured consumer `node_modules`: 36 KB with valof alone (no parser pulled
in, no install warning, the bin exits 2 with an install message), 7.3 MB once opted in.
`dependencies` stays empty, so the zero-runtime-dependency and sub-1 kB claims hold:
`scripts/size.ts` bundles `./dist/index.mjs` only, and a sibling `dist/lint-cli.mjs` is not
reachable from it.

Preferred over the two alternatives: a README recipe has no tests and no version, and a
separate package is another release surface, while a bin inside valof rides the existing
release workflow and can be tested here.

### 14.4 Rules

Two, both reporting on syntax:

- a companion member nothing reads
- a brand string claimed by more than one **top-level** type alias

Top-level only matters: without that restriction this repo's own tests report 30 collisions
from fixtures scoped inside `describe` and `test` bodies.

This repo's own `src` uses no companions. Running the detector over `src` + `tests` finds 14
companion declarations, 15 members and zero dead ones, so the dead-member rule can never
fire here. Its audience is _consumers_ of valof.

### 14.5 Rejected: ts-morph, 2026-09-04

A full ts-morph port of both checks is 50 non-comment lines against the current 252:
`findReferencesAsNodes()` replaces the whole read-tracking pass, and
`getType().getAliasSymbol()` identifies a companion as `Sealer` / `Sealed` /
`CompanionBuilder` instead of the name-based root check. It costs 15 MB installed against
3.2 MB, and 0.31 s against 0.06 s on two files.

**ts-morph does not use TypeScript 7.** `@ts-morph/common` has no `typescript` dependency;
it bundles its own compiler (12 MB of the 15). So waiting for TS 7.1's API is waiting for a
ts-morph port, not for a TypeScript release. `typescript@7.0.2` exports four symbols total:
`default`, `module.exports`, `version`, `versionMajorMinor`.

Two type-only rules were prototyped to justify the cost, and both were rejected:

- **Refining the duplicate-brand check by payload assignability is wrong.** Structural
  subtyping means "different payloads" does not mean "separated":
  `Val<"Id", {a: string; b: number}>` is assignable to `Val<"Id", {a: string}>`, verified.
  A bidirectional `isAssignableTo` test would downgrade exactly that leak. The library
  exists to enforce nominal typing, so a brand collision is a defect whatever the payloads.
- **Flagging a nested Val whose custom `equals` the parent ignores is too strict to use.**
  It works (verified through a local alias, an array and two files, and it stays quiet for a
  nested Val with no override), but overrides not propagating is the design (§5, §7.6), so
  it fires N×M times with nothing to do about it. If ever revisited, report once at the
  override site listing where it is nested, which points at the "build in normal form"
  recipe instead.

Detecting _who overrides_ `equals` is syntactic either way: `Companion<V, M>` types `equals`
as `(a, b) => boolean` whether or not it was overridden.

### 14.6 Bundle size of the namespace itself

`Val` is a companion, so §14's blindness reaches the library's own surface: a module calling
only `Val.of` bundled at 6,791 B with `sealer`, `companion`, `unwrap`, `attach` and
`deepEquals` all retained, against 1,538 B when `of` was exported by name instead. Using
only `import type` costs nothing at all (226 B, the consumer's own code).

Splitting the namespace into named exports was considered and rejected on 2026-09-03: it
would not help user companions, it duplicates the API, and a library that wants only
branding is a few lines of its own.

---

## 15. v2 candidates

### 15.1 `Val.trait`

Raised 2026-09-03, explicitly for v2.

**The gap.** A companion function is pinned to its own Val, so `User.greet(superUser)` is
rejected even when `SuperUser` was built from `PayloadOf<User>`. Behaviour shared by two
Vals therefore has to become an ordinary exported function over a structural type. That
works, but it is the one thing in valof with no companion-shaped home.

Measured while discussing it: annotating the first parameter widely _does_ type-check inside
`.impl` (`greet(u: Named)` is assignable to `(value: User) => unknown` by parameter
contravariance) and `User.greet(superUser)` then compiles. Rejected as a pattern: it reaches
through one type's companion to operate on another, and loses contextual typing.

**Sketch.** `Val.trait<Shape>().impl({...})`, giving contextual typing for the first
parameter and a namespace to group the functions.

Open questions to settle before building it:

- It must not carry `equals` / `with` / `update`: with no brand and no seal there is nothing
  to rebuild, so `attach` needs a variant that adds no defaults.
- The shape wants `DeepReadonly` applied, or an array field makes a Val fail to match.
- "Trait" implies per-type implementations; this would be one implementation over a
  structural constraint, so the name may promise dispatch it does not have.
- The real bar is §6.7's: `Sealer` has no `.implCreate` because beside a callable
  constructor a `create` "narrows nothing". `Val.trait` has to clear that same test, and
  parameter annotation plus grouping alone may not be a guarantee worth an API.
