# valof 設計メモ

TypeScript 向け値オブジェクトライブラリの設計記録。

- **パッケージ名**: `valof`（npm 空き確認済み）
- **主要エクスポート**: `Val`（型 + 名前空間）

```ts
import { Val } from "valof";
```

## 目次

節ごとに独立して読める。必要な節だけ開く。

- **§1 設計思想** 「値はプレーンなデータであり、振る舞いは外にある」。他の全判断の根拠
- **§2 基本 API** `Val.sealer` / `Val.companion` / `.impl`。2.1 ブランドがファントム文字列である理由、2.2 `Val.of` は逃げ道ではない
- **§3 許可型** Primitive / Val / ReadonlyArray / Record だけ。3.5 `undefined` を値として禁じる理由と、EOPT の壁
- **§4 DeepReadonly**
  - **4.1** コンストラクタが引数をコピーする理由。所有権追跡（WeakSet、全ノード登録）、却下した symbol 印、ダイヤモンドと GC、`unwrap` の摩擦、型チェック速度のベンチ
  - **4.2** タプルを保つ。optional 要素と `Required<T>`、rest 要素の限界
- **§5 等価性** 親から子のカスタム equals は呼べない。正規形で構築する原則と、`implEquals` の spec の設計
- **§6 スマートコンストラクタと更新**
  - **6.1** コンストラクタは出自で決まる / **6.2** `with` / `update`、patch の `undefined`、深さを問わない patch / **6.3** Result 非依存 / **6.4** `update` は値→値
  - **6.5** `.impl` の第一引数を Val に固定する contextual typing / **6.6** `with` の上書きと第 3 引数の seal
  - **6.7** seal（冪等）と create（鋳造）の分離 / **6.8** seal を唯一の関門にする。経路ごとのコピー回数
  - **6.9** 名前が `seal` になるまで / **6.10** `unpatchable` と余剰プロパティ検査
- **§7 見送ったもの** freeze（dev のみ採用）、Map/Set、Date/Temporal、TaggedEnum、Result、equals のディスパッチ、配線対象を `.impl` に置くこと
- **§8 慣用パターン** Record での Set/Map、日付、スキーマライブラリ併用、更新経路から外すフィールド
- **§9 未解決 / 要確認** 次の作業はここ
- **§10 v1 のスコープ** 10.1 サポートする TypeScript（各ラインの最終版以降） / **§11 README の構成案**
- **§12 命名** パッケージ名 `valof`、型名 `Val`、商標調査
- **§13 API 形状の決定** 2 段カリー化に至るまでの却下案 6 つ
- **§14 valof-lint** companion のメンバが静的解析から見えない問題。パーサ選定、同梱の判断、却下した ts-morph
- **§15 v2 候補** `Val.trait`

---

## 1. 設計思想

> **値はプレーンなデータであり、振る舞いは外にある。**

この一行からすべての設計判断が導かれる。

値をプレーンなオブジェクト・配列・プリミティブに限ると、次が保証される。

- `structuredClone` を通る
- `JSON.stringify` / `JSON.parse` を対称に往復する
- React の state や Redux のストアにそのまま置ける
- イミュータブル更新でプロトタイプが落ちない
- ブランドはファントム型なので、実行時にコストも痕跡も残らない

コンストラクタは引数をディープコピーする（§4.1）。ゼロコストではない。「値はデータである」を実行時にも成立させるための最小限の代償として払う。

class ではこのいずれも得られない。この線を守るために諦めたものは §7 にまとめた。

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

`Val.sealer<V>()` がコンストラクタで、`.impl({...})` がそこに振る舞いを付ける。コンストラクタを渡したくない型は `Val.companion<V>().impl({...})` を使う（§6.1）。2 段になっているのは TS に型引数の部分推論がないため（§13.1）。

### 2.1 ブランド

ライブラリ内部に固定のファントム文字列キーを持ち、値は文字列リテラルとする。

```ts
type Val<K extends string, T> = DeepReadonly<T> & {
  readonly __valof_internal_phantom_brand: K;
  readonly __valof_internal_phantom_payload: T;
};
```

`__valof_internal_phantom_payload` はペイロード型 `T` を復元するためだけに存在する。これがないと `Val<"IsoDate", string>` のようなプリミティブを包んだ Val からコンストラクタの引数型を導けない（`Omit` はプリミティブに効かない）。どちらも実行時には存在しない。

- 判別が文字列リテラルなので、型ごとに `declare const XxxBrand: unique symbol` を書かずに済む
- 衝突は同名の文字列同士のみ。`"app/User"` のように名前空間を付ける命名規約を推奨する

symbol / 文字列を利用者に選ばせる案は却下。API 表面が増えるだけで、上のハイブリッドが両方の利点を持つ。

#### なぜ `unique symbol` をやめたか

当初はキーを非公開の `unique symbol` にしていた。**valof を使うライブラリが `declaration: true` でビルドできない**という致命傷があった。

```
error TS4023: Exported variable 'User' has or is using name '__brand'
from external module ".../valof/dist/index" but cannot be named.
```

`export const User = Val.sealer<User>().impl({...})` を再エクスポートするという、まさに想定される使い方で発生する。symbol を `export` しても直らない。TypeScript は宣言を出力するファイルで名前がスコープに入っていることを要求するので、利用者が `import { __brand, __payload }` を書く羽目になる。

ブランドはどのみち実行時に存在しないので、衝突耐性は symbol であること自体ではなく**名前の長さ**で買える。`__valof_internal_phantom_` 接頭辞を実際のプロパティ名に使う者はいない。`phantom` を名前に入れているのは、ホバーやエラーメッセージでこのキーに出くわした人が実行時に探しに行かないようにするため。

代償として文字列キーは `keyof Val<...>` に現れる。ペイロードのキーだけが欲しい場面では `PayloadOf<V>` / `SeedOf<V>` を使う（`with` / `update` は元からこちらを経由する）。

### 型名の規約

`-Of` は「Val から射影して取り出したもの」を意味する。`PayloadOf<V>` / `SeedOf<V>` は Val を受け取る。`Patch<T>` はペイロード型を受け取るので接尾辞を持たない。この違いは意図的で、カスタム `with` がフィールドの部分集合に対する patch を受け取れるのはこのためである（生成された `id` を patch 対象から外す用途）。

`Sealer` / `Sealed` / `Companion` / `CompanionBuilder` も Val を受け取るが、値から取り出したものではなくコンパニオン機構の形なので接尾辞は付かない。

ブランドはファントム型であり、**実行時には存在しない**。この事実が §5・§7.6 の制約の根拠になる。

### 2.2 `Val.of`

**既定の seal を、型を明示して呼ぶ形。** brand してディープコピーする操作は 3 か所に現れる。違うのは型がどこから来るかだけ。

|                               | 型の出どころ                 |
| ----------------------------- | ---------------------------- |
| `Val.sealer<V>()` の callable | sealer が持っている          |
| `implSeal` の第 2 引数        | 登録先の型に束縛済み（§6.8） |
| `Val.of<V>(x)`                | 呼び出し側が型引数で書く     |

```ts
Val.of<User>({ id: "a", name: "alice" });
```

したがって `Val.of` は「seal を迂回する関数」ではない。カスタム seal を持たない型にとっては正規のコンストラクタであり、境界での持ち上げ（§8.3）も設計上の正解。カスタム seal を持つ型に使ったときだけ「その型の seal ではなく既定の seal で封をする」＝検査を飛ばす、という帰結になる。**逃げ道であることは事実だが、逃げ道であることが本質ではない。**

この整理はパッケージ名にも効く。`valof` が指すのは逃げ道ではなく「値を作る操作」そのもの。`Val.lift` などに改名すると §12 が挙げた「パッケージ名が API に現れる」利点が消えるだけなので、改名しない。

---

## 3. 許可型

コンストラクタと `Val.of` が受け取れる型を以下に制限する。

```ts
type Primitive = string | number | boolean | bigint | null;
```

`undefined` は値として許可しない（§3.5）。

**プレーンなネストしたオブジェクトは禁止。ネストは必ず Val にする。**

### なぜこの制限か

1. **型推論コストが下がる。** DeepReadonly の再帰が 1 段で止まる（子は既に readonly な Val）。条件型が浅いので `tsc` が重くならない
2. **構造的等価性が well-defined になる。** プロトタイプ持ちや循環参照を考えなくてよい
3. **シリアライズ境界を必ず通る。** `structuredClone` / JSON が常に安全
4. **設計として正しい方向に寄る。** Val の合成が強制されるので、DDD 的にまともな構造になる

`ReadonlyArray` と `Record` は再帰的に定義する。これがないと `readonly string[][]`（行列・グリッド）や `Readonly<Record<string, Val>>`（ID 索引）が書けない。各ノードは浅いので、再帰があっても破滅的なコストにはならない。

### 移行の摩擦

API レスポンスや既存コードのプレーンなネストオブジェクトは、そのまま渡せない。seal の中で子 Val を組み立てる作業が発生する。

思想としては正しいが、**README の冒頭でこの制限の理由を説明しないと初見で離脱される**。最優先で書く。

### プリミティブを直接包める

```ts
export type IsoDate = Val<"IsoDate", string>;
```

重要なユースケース（§8.2）。

### 3.5 `null` と `undefined`

|                            | 判定                                   |
| -------------------------- | -------------------------------------- |
| `null` を値として持つ      | 許可                                   |
| `?`（キーの不在）          | 許可                                   |
| `undefined` を値として持つ | **禁止**                               |
| patch 内の `undefined`     | **プロパティ削除**の意味に予約（§6.2） |

#### なぜ「undefined 禁止」ではなく「値としての undefined 禁止」なのか

壊れるのは「キーは存在するが値が `undefined`」のときだけ。

```ts
JSON.parse(JSON.stringify({ a: undefined })); // {} キーが消える
structuredClone({ a: undefined }); // { a: undefined } キーが残る
```

2 つのシリアライズ経路が食い違う。これが禁じたい本当の理由。

オプショナルプロパティ自体は無害。キーが存在しなければ `JSON.stringify` は出力せず、`parse` してもキーは存在しない。`structuredClone` も同じで、往復は対称になる。

TS では `?` が圧倒的に慣用的なので、オプショナルプロパティを一律禁止して `nickname: string | null` を強制するのは受け入れられない。線引きは「キーの不在は OK、値としての `undefined` は禁止」とする。

#### 型による検査

optional キーは判定できる。

```ts
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
```

`-?` は、マップ先の値型に `undefined` が混ざらないようにするために必要。

これを使い、optional キーだけ `undefined` を剥がしてから検査する。

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
```

`[T] extends [X]` の非分配形にしているのは、`string | null` のような union をまとめて判定するため。これで `Val<"User", { nickname: string | undefined }>` を弾ける。

#### 自己参照制約は型エイリアスでは書けない

当初は `T extends Validate<T>` という自己参照制約で「型定義の場所でエラーを出す」つもりだった。型エイリアスでは **TS2313「型パラメーター 'T' には循環参照する制約が指定されています」**になる（ジェネリック関数の型パラメーターなら書けるが、`Val` は型エイリアス）。条件型で同じ検査に置き換えた。

```ts
type Val<K extends string, T> = [T] extends [Validate<T>]
  ? DeepReadonly<T> & Brand<K>
  : Validate<T>;
```

違反時は `Invalid<Msg>` を含む `Validate<T>` に解決される。それは `AnyVal` を満たさないので、`Val.of` / `Val.sealer` / `Val.companion` に渡した時点でエラーになる。

```
Property '[__brand]' is missing in type
  '{ nickname: Invalid<"required property cannot be undefined; use null or make it optional"> }'
but required in type 'AnyVal'.
```

**エラー位置は型定義時ではなく最初の使用時に後退する。** メッセージは意図どおり出る。検査は `Val<K, T>` から一度だけ適用されるので、推論コストの利点は保たれる。

#### `exactOptionalPropertyTypes` の壁

EOPT が **off**（TS のデフォルト）のとき、`{ a?: string }` と `{ a?: string | undefined }` は文字通り同じ型で、区別する手段が言語に存在しない。したがって以下は検出できない。

```ts
const raw: { nickname?: string } = { nickname: undefined }; // EOPT:false なら合法
User(raw); // 型検査を通る。キーが存在して値が undefined
```

EOPT を on にすれば `Record<K, undefined> extends Pick<T, K>` で判定できる。有効化すると既存コードで大量にエラーが出ることがあるので**必須要件にはしない**。

freeze を切ったとき（§7.1）の根拠は「破るには `as any` が必要」だった。こちらは**キャストなしで普通のコードから漏れてくる**。保証としては一段弱い。

#### 二段構えで無害化する

1. `Primitive` から `undefined` を外す
2. 上の `Validate` を入れる
3. README で **EOPT: true を強く推奨**する。必須にはしない
4. `with` は patch の `undefined` キーを削除として解釈し、マージ後に落とす（§6.2）
5. **デフォルト deep equals で、値が `undefined` のキーを無視する**（§5）

5 が効く。`{ a: undefined }` と `{}` が等価なら、2 つのシリアライズ経路の食い違いが**観測できなくなる**。実行時コストはほぼゼロで、キー順非依存にする実装のついでに書ける。

型で大半を防ぎ、残りは equals で無害化する。EOPT を必須にして型で完全に閉じるより、導入コストと保証のバランスが良い。

#### interop の摩擦

`undefined` は TS のあちこちから湧く（`Array.prototype.find`、`Map.get`、`noUncheckedIndexedAccess` 有効時の添字アクセス、OpenAPI/GraphQL のコード生成、フォームライブラリ、分割代入のデフォルト値）。seal に渡す前に `?? null` を挟む場面が増える。

そこは**スマートコンストラクタで正規化すべき場所そのもの**であり、§5 の「正規形で構築する」原則と一貫している。「境界で正規化しろ」というメッセージとして README に書く。

#### 副次的な利点

`undefined` が値として存在し得ないため、`with` の patch における `undefined` を**削除の sentinel として使える**（§6.2）。

```ts
User.with(user, { nickname: undefined }); // nickname を削除
```

`null` と `undefined` を両方値として許すと、この sentinel が使えない。「`null` を設定したい」のか「削除したい」のかを区別する専用の sentinel を別途導入する羽目になる。

このライブラリでは値の更新に必ず新しいオブジェクトを作るので、「プロパティに `undefined` を代入する」操作がそもそも存在しない。`undefined` を値の空間から外しても表現力を失わない。

deep equals も同様に、`{ a: undefined }` と `{}` が等しいかという厄介な問いが発生しない。

---

## 4. DeepReadonly

`Val` で定義した型は DeepReadonly になる。§3 の制限により再帰は 1 段で止まるので、コストは低い。

### 4.1 コンストラクタは引数を所有する（コピーする）

DeepReadonly は型の話で、実行時には消える。呼び出し側が引数への可変な参照を持ち続けていると、Val を後から書き換えられる。

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // コピーしなければ "mallory"
```

これは「利用者の責任」で済ませられない。`as` も何も要らず、素直なコードが黙って壊れる。値オブジェクトが背後で変わり得るなら、それは値オブジェクトではない。よって `Val.of` / sealer / `.impl()` のコンストラクタ、および既定の seal を通る `with` / `update` / `create` は引数をディープコピーする。

payload はプリミティブ・配列・プレーンオブジェクト・ネストした Val に限られるので、再帰コピーに特別扱いは要らない。`structuredClone` は使わない（自前の再帰の 5〜6 倍遅い）。

カスタム seal を書く場合、コピーの責任は seal にある。`Val.of` を通すのが正規の方法で、**所有権を取る場所はそこ 1 箇所**（§6.8）。

**コスト実測**（Node 24 / M シリーズ、入力は毎回フレッシュ、ns/op）

|                   | flat 3キー | ネスト ~40ノード | 1000 行 |
| ----------------- | ---------- | ---------------- | ------- |
| そのまま返す      | 2          | 4                | 14      |
| ディープコピー    | 47         | 858              | 99,731  |
| `structuredClone` | 514        | 5,474            | 469,529 |

まともなサイズの値オブジェクトで 1μs 未満。1000 行を 1 つの Val に詰めると 100μs 払うが、それはネスト Val に切るべきという話であり、§4 の「再帰は Val で止まる」方針と一致する。

#### 所有権追跡: 自分が鋳造したノードは作り直さない

`copy` が作ったノードを WeakSet に登録し、次に出会ったらそのまま返す。`src/val.ts` に入っている。

**登録するのは全ノード。** 閾値で絞る案（オブジェクトを持つノードだけ登録する interior、部分木サイズ n 以上の K=n）はコピー時間で閾値を決めていた。目的関数を間違えている。React / Vue / Svelte が比較するのは identity であってコピー時間ではない。interior だと `user.name` を変えただけで `user.wallet`（プリミティブだけの葉の Val）がコピーされて参照が変わり、`React.memo(Wallet)` が**見てもいない変更で再レンダリングする**。

|              | flat 3keys の seal | Val 200 個のリスト構築 | 子の identity |
| ------------ | ------------------ | ---------------------- | ------------- |
| interior     | 57.7 ns (1.25x)    | 11.0us (1.12x)         | 変わる        |
| 全ノード登録 | 145 ns (3.14x)     | **2346 ns (0.24x)**    | 保たれる      |

- 小さく平坦な値の構築で +100 ns。ns オーダーであり、オブジェクトが大きくなるほど相対コストは下がる
- Val のリスト構築が 4.7 倍速い。各行が自分の seal で登録され、親が共有できるため。リストは React の主戦場でもある
- 再レンダリング 1 回は μs〜ms のオーダーで、100 ns とは釣り合わない

**小さく平坦な値では速度で負ける。負けを承知で取る。**

実装の要点。

- `deepCopy(owning)` を owning / 非 owning の 2 形で作り分けるだけで、公開 API は変わらない。`owning` は引数ではなくクロージャに閉じ込める。進行中のコピーの下で値が変わらないようにするため
- `Val.unwrap` は非 owning の copy で走る。可変なコピーを返す契約なので、**ノードを共有してもいけないし、共有されるノードになってもいけない**。後者を忘れると、unwrap した payload を seal し直したときに呼び出し側の可変オブジェクトを値が抱え込む
- 取りこぼしはコピーに縮退するだけなので、レルムをまたいで WeakSet が別インスタンスになっても修復すべきものはない

テストは 7 件。`with` / `update` が触っていない部分木を保つ、patch 由来のノードは採用せず必ずコピーする、`Val.unwrap` は何も共有しない、unwrap した payload は再 seal しても採用されない、`equals` の答えは変わらない。

**バンドルサイズ: 追跡なしの 853 B に対して production gzip 901 B。予算 1 kB に対して残り 123 B。** `implEquals` の spec（§5）はこの予算に収まらず、1.25 kB に引き上げた（実績 1.13 kB）。この予算は妥協の結果で、削る案は §5 で却下した。React 単体が gzip 45 kB である以上、1.25 kB がフロントエンドでの採用をためらわせることはない。

値は freeze していないので、キャストして値を書き換えると**共有先の値にも波及する**。破るのに `as` が要る点は §7.1 と同じだが、影響範囲は広がった。dev 限定の freeze はこれを受けて採った（§7.1）。

#### 却下: 所有権の印を symbol キーで持たせる

WeakSet の代わりに、鋳造したオブジェクト自身に `obj[MARK] = true` を持たせる案。実測（Node 24.19 / M シリーズ、ns/op）。

| 印を付けるコスト                                 | ns/op |
| ------------------------------------------------ | ----- |
| `{a,b,c}` を作るだけ                             | 3.7   |
| + `owned.add(o)`                                 | 81.9  |
| + `Object.defineProperty(o, MARK, {value:true})` | 69.5  |
| + `o[MARK] = true`（enumerable）                 | 6.6   |

判定は symbol が速い（hit/miss とも 3 ns、WeakSet は 7/5 ns）。しかし**構築経路では印を付けるコストが支配的**なので、正味の差は 0〜20% にしかならない。

**唯一の大勝ち（`o[MARK]=true`、印 6.6 ns）は不健全。** enumerable な symbol はスプレッドで複製されるので、`with` の `{...value, ...patch}` に印が乗り、コピーが丸ごとスキップされて patch 由来の外部オブジェクトが値に埋まる。§4.1 が防いでいるエイリアシングそのもの。`with` 側で `delete` しても、利用者が `{...user}` した瞬間に素のオブジェクトへ印が漏れる。non-enumerable 一択で、それは 69.5 ns の経路。

速度以外でも WeakSet が有利。

- **偽造できない。** 内部 `Symbol()` なら symbol も同様だが、デュアルパッケージや複数レルムで印が共有されない。共有したければ `Symbol.for` になり、その瞬間に誰でも `obj[Symbol.for("valof.owned")] = true` と書けて、可変オブジェクトを値に埋め込める
- **値に余分な状態が乗らない。** symbol は `Object.getOwnPropertySymbols` に出る
- 取りこぼしの向きは同じ。どちらも JSON / `structuredClone` を越えると印を失い、コピーに縮退する

内部実装なので、必要になれば後から非破壊で差し替えられる。

#### 何も変わらない `with` は値そのものを返す

共有を入れても、no-op な `with` は新しい root を作るので identity が変わり、再レンダリングが走る。`with` は既に merged payload のキーを 1 周しているので、そのループに identity 比較を相乗りさせた。Immer の `produce` と同じ挙動。

- 拾う: `with(v, { name: 同じ値 })`、`with(v, {})`、値が持たないキーの削除、`update(v, (x) => x)`
- 拾わない: 同値だが新しい子 Val を渡した場合。**コンストラクタを通した以上、新しいインスタンスになるのが JS として自然**なので、これは仕様
- 拾わない: `update` で spread した場合。新しいオブジェクトが同値かの判定は `with` の仕事で、そこでしか走査が既に払われていない
- カスタム seal のときは値を seal に通す。戻り値の形は seal が所有するため。中の `copy` が値を認識して同じノードを返すので、`Result` の中身の identity は保たれる

短絡は既定の seal のときだけ seal を飛ばす。§6.8 の「値になる経路はすべて seal を通る」はカスタム seal については保たれる。

#### 共有が作るのはダイヤモンドであって循環ではない

**保証しているのは deep copy ではなく生成順。** 共有経路ではコピーを飛ばすので、「入口でディープコピーするから循環しない」という説明は成立しない。効いているのは `copy` がボトムアップであること。子を全部コピーし終えてから `out` を作るので、**`out` が参照できるのは自分より前に存在したノードだけ**になる。共有経路で返るのはさらに古い所有ノードなので、所有グラフは生成時刻で順序づけられた DAG になる。deep copy の担当はエイリアシングであって循環ではない。

型でも作れない。親を作るには子が先に要るので、循環は変異でしか作れない。

循環した payload を渡した場合は `RangeError`（スタックオーバーフロー）。`copy` は visited セットを持たない素の再帰なので、共有の前後で失敗の仕方は変わらない。

**新しく起きるようになったのはダイヤモンド。** 同じ子 Val を 2 箇所に置くと、以前は別々にコピーされていたものが同一参照になる。

```
ダイヤモンド: a === b → true   a === m → true
JSON 往復:    {"a":{"amount":1},"b":{"amount":1},"note":"n"}   ← 共有は失われる
structuredClone 後も a === b: true                              ← DAG は保たれる
with 後も a === b: true   元と共有: true
```

値としては等しいので `equals` の答えは変わらない。差が観測できるのは identity を見たときだけ。

失敗の仕方が変わるのは、キャストで不変性を破ったあとの 1 ケースだけ。

|                           | production                                                                     | development                 |
| ------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `(v as any).self = v`     | 書けてしまう                                                                   | **TypeError**（dev freeze） |
| その `v` を他の値に入れる | 所有ノードなので共有され、循環したまま値に入る（以前はスタックオーバーフロー） | 上で止まるので到達しない    |

production では「即座にクラッシュ」から「静かに循環を含んだ値」に変わる。前提が `as` によるキャストと書き換えなので、§7.1 の dev freeze がその一歩手前で捕まえる。

#### GC は妨げない

全ノード登録で増えた WeakSet のエントリが値を保持しないことを `--expose-gc` で確認した。

```
1. WeakSet 登録済みの値:              回収された
   その子（ダイヤモンドの共有ノード): 回収された
2. 子だけ保持したとき親は:            回収された（子は生存）
3. 派生元の root:                     回収された
```

**1. `owned` は WeakSet なので所有ノードを保持しない。** 増えたのは弱参照の数だけ。

**2. 参照は下向きだけなので、子を保持しても親は回収される。** 共有ノードは自分より前に作られたノードしか指さない。`user.wallet` を握っても `user` は生き残らない。Java の旧 `substring` のような「小さな断片が巨大なバッファを掴む」危険はない。**ノード全体を共有していて、切り出しをしていない**ため。

**3. 共有は生存集合をむしろ減らす。** ダイヤモンドは 2 つのオブジェクトが 1 つになったということなので、live なオブジェクト数はコピー方式より少ない。

#### 更新する値だけネスト Val に分解する

生の 106 ノードの木（深さ 3 分岐 4）を、1 個の Val にそのまま持たせる場合と、階層ごとにネスト Val へ分解する場合の比較。

| 方式              | 分解なし 1 回 seal | 分解して構築      | 分解なし + with x10 | 分解 + with x10 |
| ----------------- | ------------------ | ----------------- | ------------------- | --------------- |
| plain（追跡なし） | 3020               | **11.4us (3.8x)** | 30.1us              | 30.0us          |
| interior          | 9308 (3.08x)       | 11.4us (1.00x)    | 3066 (0.10x)        | 2015 (0.07x)    |
| K=8               | 4690 (1.55x)       | 10.8us (0.94x)    | 3062 (0.10x)        | 1831 (0.06x)    |
| K=32              | 3696 (1.22x)       | 13.0us (1.14x)    | 3138 (0.10x)        | 1948 (0.06x)    |

1. **分解のコストは追跡なしでも払っている。** plain で 3.8x。親の seal が子をもう一度コピーするので、階層を切るたびに下の全ノードが再コピーされる。**追跡なしのライブラリは、自分が推奨しているモデリングを構築時に罰していた**
2. **追跡はその罰を消す。** 追跡ありの分解は 0.94〜1.00x
3. **更新が 1 回でも入れば全部ひっくり返る。** 概算の損益分岐は 2 回目の `with`

指針が出る。

> 更新する値はネスト Val に分解する。読むだけの値は 1 つの Val に深い payload のまま持たせる。

利用者は「この値は更新するか」を設計時に知っているので、判断できる線引きになっている。

これは**カスタム seal の推奨ではない**。`SealImpl` が「seal は payload を受け取る、wire format ではない」を型で縛っているので、分解は seal の手前で起き、seal を書き換えてもコピーの位置も回数も変わらない。梃子はモデリングのほう。

#### ネスト Val の seal は型で強制されている（`PayloadOf` の穴を除く）

ファントムブランドがあるので、素の payload からネスト Val は作れない。

```ts
type OrderA = Val<"OrderA", { id: string; total: Money }>;
OrderA({ id: "o", total: { amount: 1, currency: "JPY" } });
// error TS2322: missing __valof_internal_phantom_brand, __valof_internal_phantom_payload
```

「JSON から親を作る」経路でも子は必ず子の seal を通り、追跡下では登録される。抜けられるのは `as` を書いたときと、**`PayloadOf` をフィールド位置に置いたとき**。

```ts
type OrderB = Val<"OrderB", { id: string; total: PayloadOf<Money> }>;
OrderB({ id: "o", total: { amount: 1, currency: "JPY" } }); // 通る
```

ブランドごと落ちるので、子の seal（不変条件・正規化）も、子のカスタム `equals` も、追跡下での共有も失われる。完全に silent ではない（`Money.equals(order.total, x)` を書けば型エラーになる）が、構築の瞬間には気づかない。

README の `Reusing a Val` が見せているのは**トップレベルでの合成**（`PayloadOf<User> & { … }`）で、これは正当な用法。フィールド位置との区別が書かれていないため、実際に読み違いが起きた。

### 既知の摩擦

`readonly T[]` は `T[]` に代入できない。`readonly` を知らないサードパーティ関数に渡すたびに詰まる（`Array.prototype.sort` すら通らない）。`Val.unwrap` で可変なコピーを取り出す。`Val.of` の逆向きで、実装は `copy` の再利用。

`unwrap` の実装を `structuredClone` に差し替えると **gzip が 9 B 減り、テスト 102 件は全部通る**。`copy` の再利用は owning フラグを要求し、`structuredClone` ならフラグごと消せるため。正しさの差も見つからなかった（`__proto__` を own property に持つ payload は own のまま複製され汚染もしない、null プロトタイプは `Object.prototype` になる、frozen な値の複製は frozen ではない）。残る差は速度だけで、そこは大きい（381 vs 2,587 ns/op、6.8 倍）。**9 B のために `unwrap` を 7 倍遅くする取引なので `copy` の再利用を維持する。**

エラーメッセージが `readonly` の入れ子で膨れて読みにくくなる、という摩擦も残る。

`unwrap` は外部に渡すための出口であって、値の派生に使うものではない。`SeedOf<V>` が Val をそのまま受けるので `Val.of` / `with` は 1 回のコピーで済むが、`unwrap` を経由すると 2 回になる（92 → 184 ns/op、ネスト約 8 ノード）。

`unwrap` を単体 export にしなかった理由。単体ならバンドラが落とせる（gzip 1,011 vs 1,023 B）が、44 B のために `unwrap` というありふれた名前をトップレベルに置くと `Result` 系ライブラリと衝突する。`Val.of` の逆操作であることも名前空間側に置く根拠になる。

### ベンチマーク

DeepReadonly・ブランド・コンパニオンのオーバーロード判定はすべて条件型なので、型チェック速度を計測した。フィールド 30 個 × ネスト 3 段 × 200 型（18,000 プロパティ）を `tsc --extendedDiagnostics` で見る。

| 変種                                              | Types  | Instantiations | Check (TS 7.0.2) | Check (TS 5.9.3) |
| ------------------------------------------------- | ------ | -------------- | ---------------- | ---------------- |
| 素の `interface`（ライブラリなし）                | 3,979  | 0              | 0.036s           | 0.09s            |
| `Val<K, T>` 型 + `Val.of` のみ                    | 46,744 | 765,435        | 0.207s           | 0.54s            |
| + `sealer().impl` と `with` / `update` / `equals` | 88,145 | 943,921        | 0.285s           | 0.71s            |

型 1 個あたり約 4,700 instantiations、チェック時間 1.4ms（TS 7）。素の `interface` に対して絶対値では 8 倍だが、200 型を丸ごと 1 ファイルで型付けして 0.3 秒に収まる。

型数に対して線形で、条件型の展開が組合せ爆発する箇所はない（フル変種の Check time は 50 型 0.065s / 100 型 0.137s / 200 型 0.285s / 400 型 0.601s、instantiations も同じ傾きで 237K / 473K / 944K / 1,886K）。

上表の 2.5 倍という差は TS 7 に最も不利な測り方（200 型を 1 ファイル）で出たもので、TS 7 の速さの多くを占めるファイル単位の並列チェックが効かない。同じ 200 型を 1 型 1 ファイルに分けると差は 7 倍以上に開く。

| フル変種の並べ方         | Check (TS 7.0.2) | Check (TS 5.9.3) |
| ------------------------ | ---------------- | ---------------- |
| 1 ファイル（200 型）     | 0.285s           | 0.71s            |
| 200 ファイル（1 型ずつ） | 0.094s           | 0.70s            |

裏を返せば、巨大な 1 ファイルに型を集約すると TS 7 の利点をほぼ捨てることになる。

いずれの並べ方でも **instantiations は両コンパイラでほぼ同一**（943,921 / 943,425）なので、回帰の監視は時間ではなくこちらを見る。

deep patch（§6.2）を入れたあとに測り直した。同じ 200 型 × 30 フィールド × 3 段で、`with` の呼び出しだけを変える。

| 変種                        | Types   | Instantiations | Check (TS 7.0.2) |
| --------------------------- | ------- | -------------- | ---------------- |
| deep patch 前、1 段の patch | 120,172 | 870,532        | 0.29s            |
| deep patch 後、1 段の patch | 120,281 | 870,851        | 0.28s            |
| deep patch 後、3 段の patch | 177,885 | 1,177,941      | 0.40s            |

**再帰する型を置くこと自体はタダ**で、増えるのは実際に深い patch を書いた箇所だけ（+35% instantiations）。呼び出しの深さに比例し、型数に対しては線形のまま（3 段の patch で 50 型 307K / 100 型 577K / 200 型 1,117K / 400 型 2,198K）。

DeepReadonly をオプトインにする案は不要と判断する。コストの大半は `Val` 型の定義側（コンパニオンなしで既に 765K instantiations）にあり、`with` / `update` / `equals` のオーバーロード判定が上乗せするのは 23% にすぎない。

### 4.2 タプルを保つ

かつてタプルの payload は `DeepReadonly` で潰れていた。`ReadonlyArray<infer E>` がタプルも受けて `ReadonlyArray<DeepReadonly<E>>` に均すためで、`SeedOf` もその上に乗るので、そこから導く API（`with` の patch、§5 の `implEquals` の spec）では位置ごとの扱いが書けなかった。

**`number extends T["length"]` で配列とタプルを分ける。** タプル側は同形マップ型なので、位置も長さもラベルも `readonly` も保たれる。`Validate` と `DeepReadonly` の両方に同じ分岐を入れた。

```ts
: [T] extends [ReadonlyArray<infer E>]
  ? number extends T["length"]
    ? ReadonlyArray<DeepReadonly<E>>
    : { readonly [I in keyof T]: DeepReadonly<T[I]> }
```

#### optional な要素と `undefined`

タプルの optional 要素（`readonly [string, number?]`）は、オブジェクトの optional キーと同じ立て付けで許す。要素が無ければ配列が短くなるだけで JSON を往復する。一方 `readonly [string | undefined, number]` は required なキーに `undefined` を置くのと同じで、弾く（§3.5）。配列の `undefined` は `JSON.stringify` で `null` になるので、静かに値が変わる。

マップ型の中でこの 2 つを見分けるのが `Required<T>` である。optional 要素だけが `undefined` を失う。

```ts
[I in keyof T]: undefined extends Required<T>[I]
  ? Invalid<"a tuple element cannot be undefined; use null or make it optional">
  : Validate<Exclude<T[I], undefined>>;
```

#### rest 要素は配列に落ちる

`readonly [string, ...number[]]` は `length` が `number` なので、判定がそのまま配列側に倒れる。位置は失われるが不健全ではない。**判定基準が「長さが固定か」である以上、これは仕様の裏面**であって、直すなら別の判定が要る。要求が出るまで置く。

#### メッセージも直った

以前は要素の union が `Function` 分岐に入らず object 分岐に落ちて、`Invalid<"not a plain value">` になっていた。今は位置ごとに `Validate` を通るので、配列と同じ文言が出る。

```
Val<"InTuple", { t: readonly [string, () => void] }>
  → readonly [string, Invalid<"functions are not allowed">]
```

#### コスト

同じ形の payload を配列とタプルで測ると、200 型 × 3 段で Types +69 / Instantiations +147（0.06%）。同一のタプル型は 1 度しかインスタンス化されないので、効くのは**異なるタプル型の数**である。タプルを含まない payload への影響は +0.01% で、実行時は無変更。

型としては破壊的変更で、0.3.0 に入れる。`readonly [A, B]` の payload を持つ型は、これまで `ReadonlyArray<A | B>` として通っていた代入が通らなくなる。

---

## 5. 等価性

### API

自由関数 `Val.equals` は**提供しない**。ファントムブランドのため実行時に型を特定できず、型ごとのカスタム等価性にディスパッチできない。

代わりに companion がデフォルトで `equals` を持ち、`.implEquals` で差し替える。

```ts
User.equals(a, b); // デフォルトは deep equal
```

デフォルト実装 `deepEquals` も**エクスポートしない**。自由関数として出すと、名前が違うだけで上と同じものになり、型ごとの `equals` を黙って迂回する経路になる（`(a: unknown, b: unknown)` なので異なる型の Val 同士の比較も通る）。

代わりに**オーバーライドの第 3 引数として束縛して渡す**。委譲が意味を持つ場所にだけ、その Val の型が付いた状態で置く。

```ts
const Doc = Val.sealer<Doc>().implEquals((a, b, deepEquals) =>
  a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id,
);

Doc.equals(a, b); // 呼ぶ側は 2 引数のまま。第 3 引数は束縛済み
```

渡すのは構造比較そのものであって「オーバーライド前の equals」ではない。下の「親から子のカスタム equals は呼べない」制約はこの引数にもそのまま当てはまる。

プリミティブ payload でも第 3 引数は渡す。`deepEquals` は `===` ではなく、NaN を NaN と等しいとする（下の要件）。`Val<"Temp", number>` の上書きが `a === b` を書くと既定と挙動が割れるので、委譲先は残す。

### デフォルト実装の要件

- 構造的な深い比較
- **キー順に依存しない**（キーをソートしてから比較）。§8.1 の Set 表現のために必須であり、そもそも正しい挙動
- **値が `undefined` のキーを無視する**。`{ a: undefined }` と `{}` を等価とする。EOPT off の環境で漏れてきた `undefined` による 2 経路のシリアライズ差異を観測不能にする（§3.5）

### 制約: 親から子のカスタム equals は呼べない

```ts
const Money = Val.sealer<Money>().implEquals(
  (a, b) => a.currency === b.currency && normalize(a) === normalize(b),
);

const Order = Val.sealer<Order>(); // デフォルトの deep equals

Order.equals(o1, o2); // ← 中の Money は Money.equals ではなく汎用比較される
```

デフォルトの deep equals は、子の値を見てもそれが `Money` だと分からない。

実装の工夫で回避できる問題ではない。実行時に値から型を引く方法は原理的に 3 つしかない。

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

`Email` の `implEquals` は不要になり、親から構造比較されても正しい。スマートコンストラクタで不変条件を確立するのは値オブジェクトの定石なので、この制約は正しい設計へ誘導している。

**README にはこれを「制限」ではなく「原則」として書く。**

> Val は正規形で構築してください。等価性は構造的に定義されます。`Email` を case-insensitive に扱いたいなら、`equals` をオーバーライドするのではなく seal で小文字化してください。この原則に従う限り、ネストした Val の等価性は自動的に正しくなります。

`implEquals` 自体は残すが、「トップレベルの比較にのみ効き、親から呼ばれる際には適用されない」と明記する。逃げ道はあるが推奨経路ではない、という位置づけ。

### `implEquals` の spec

正規化で表現できない等価性は残る（id だけで比べる、キャッシュ列を無視する、`updatedAt` を等価性から外す）。そのとき親が手で書く `equals` は、関係のないキーまで自分で並べることになって冗長。`implEquals` は関数の代わりに**子ごとの指定**を受け取り、書かなかったキーは既定の `deepEquals` に落ちる。

```ts
export const Order = Val.sealer<Order>().implEquals({
  total: Money, // companion をそのまま渡す。Money.equals が使われる
  email: Email, // プリミティブ payload の子でも動く（ここが要点）
  lines: [OrderLine], // 配列は要素ごと
  shipping: { zip: Zip }, // Val ではない素のネストは、中の指定だけ書く
  span: [undefined, Money], // タプルは位置ごと
  updatedAt: () => true, // 等価性から外す
});
```

`id` や `note` を列挙する必要はない。

**spec が受け付ける形**

| 子の型           | 書き方                          | 意味                     |
| ---------------- | ------------------------------- | ------------------------ |
| Val              | companion / `(a, b) => boolean` | 値そのものを比べる       |
| プリミティブ     | `(a, b) => boolean`             | 同上                     |
| 長さ不定の配列   | `[spec]`                        | 要素ごと                 |
| 長さ不定の配列   | `(a, b) => boolean`             | 配列全体（順序無視など） |
| タプル           | `[spec, spec, ...]`             | 位置ごと。全位置を書く   |
| 素のオブジェクト | `{ k: spec, ... }`              | 中に降りる               |

トップレベル（`implEquals` の引数そのもの）だけは、裸の関数が `equals` の上書きになる。それ以外の形は同じ。

```ts
Val.sealer<Tags>().implEquals([Email]); // 要素ごとに Email.equals
Val.sealer<Tags>().implEquals((a, b) => setEq(a, b)); // 配列全体の上書き
```

タプルは**全位置を書く**。`undefined` はその位置を既定に落とす。

#### 却下: 配列の指定を裸の companion / 関数にする

「配列は関数、タプルは位置指定」と読めて、タプルの位置省略も使えるようになる形（`lines: OrderLine` が要素ごと）。**実装中に実行時で破れた。**

`toEq` は spec しか見ない。そこに payload が配列の Val（`Val<"Tags", readonly string[]>`）が子として現れると、区別がつかなくなる。

```ts
// 親の payload: { tags: Tags; raw: readonly Email[] }
implEquals({ tags: Tags, raw: Email });
```

`tags` は `Tags.equals` を配列全体に、`raw` は `Email.equals` を要素ごとに適用しなければならない。spec はどちらも `{ equals }` を持つオブジェクトで、値はどちらも実行時に配列。**型では `[T] extends [AnyVal]` を先に見て分けられるが、実行時にはその情報が残っていない。** 静かに間違った等価性になる。

角括弧が「要素ごと」の目印である限り、この曖昧さは起きない。`Array.isArray(spec)` が要素ごとか位置ごとかを決め、それ以外は必ず値そのもの。

代償はタプルの位置省略。`[eq]` が「配列の全要素に `eq`」と「3 タプルの位置 0 だけ `eq`」の 2 通りに読めてしまうので、タプルは全位置を書く。曖昧なのは長さ 1 の spec だけで、そのとき 2 つの解釈は同じ結果になる。

rest タプル（`readonly [string, ...number[]]`）は `number extends T["length"]` で配列側に落ち、要素型が `string | number` になる。位置は失われる（§4.2 の rest の限界）。

**companion と「`equals` というキーを持つネスト spec」の曖昧さ**は、`typeof spec.equals === "function"` を先に見れば解ける。payload に関数は入れられない（§3 の `Validate`）ので、`equals` が関数であるオブジェクトは companion 以外にあり得ない。

**この検査は裸の関数の検査より先に置く。** sealer は呼び出し可能なので、`typeof spec === "function"` を先に見ると companion がコンストラクタとして比較に使われ、返ってきた値が truthy なので常に等しくなる。実装中に踏んだ。

**再帰はネストした Val で止まる。** `{ total: { amount: eq } }` と手で降りることはできない。`DeepReadonly` と `Patch` が同じ位置で止まるのと同じ規則で、これが `Money.equals` を黙って迂回する経路を閉じる。

**spec は比較器に事前コンパイルする。** `toEq` は companion の構築時に 1 度走り、spec のノードごとに比較器のクロージャを作る。比較時にはもう spec を見ない。

#### 却下: spec を `deepEquals` に畳む（サイズ削減）

`toEq` を別に置くと、配列とオブジェクトの走査が `deepEquals` と二重になる。spec を第 3 引数に取る 1 本の再帰にすれば重複が消えて、`deepEquals(a, b)` は `eq(a, b, undefined)` になる。**production gzip 1.13 → 1.02 kB。実装して測って戻した。**

実測（Node 24.19 / M シリーズ、production、ns/op）。

|                                                           | 事前コンパイル | 1 本の再帰 |
| --------------------------------------------------------- | -------------- | ---------- |
| 既定の `deepEquals`（20 行の注文）                        | 2530           | 2535       |
| spec 付き `equals`（`{ total: Money, lines: [Line] }`）   | **232**        | **511**    |
| spec 付き `equals`（`{ total: Money }` だけの小さい集約） | 112            | 139        |
| 同一参照                                                  | 4.6            | 7.0        |
| companion の構築                                          | 4300           | 3950       |

既定の経路は変わらない。**遅くなるのは要素ごとの配列 spec（`[Line]`）で、要素数に比例する。**

走査だけ共有して事前コンパイルは残す中間案も測ったが 489 ns で、ほとんど戻らなかった。**つまり効いているのは「ノードごとの `typeof` 2 回」ではない。** 事前コンパイルは spec のノードごとに別のクロージャを作るので、呼び出し側が単相になって V8 がインラインキャッシュを効かせられる。1 本の再帰は全 spec 形状が同じ関数を通るので特殊化できない。共有した走査に `child(k)` を渡す形でも、間接呼び出しが 1 段増えた時点で同じだけ失う。（速度差は実測、説明は推論。）

サイズは 116 B、予算残は 9% → 19%。予算はもともと逼迫していない。

#### 却下: with / update の seal 束縛を 1 つのヘルパにまとめる

`attach` の `impl ? (v, a) => impl(v, a, seal) : 既定` が 2 か所あるので `bind` に括る案。**実測で gzip +6 B。** 三項が繰り返しでよく縮むぶん、ヘルパの名前と呼び出しのほうが高い。

**型**

```ts
type EqSpec<T> = [T] extends [AnyVal]
  ? Eq<T> | { equals: Eq<T> }
  : [T] extends [Primitive]
    ? Eq<T>
    : [T] extends [readonly unknown[]]
      ? Eq<T> | EqElements<T>
      : [T] extends [object]
        ? Eq<T> | { [K in keyof T]?: EqSpec<T[K]> }
        : never;

type EqElements<T> = T extends readonly unknown[]
  ? number extends T["length"]
    ? readonly [EqSpec<T[number]>]
    : { readonly [I in keyof T]: EqSpec<T[I]> | undefined }
  : never;

// トップレベルは裸の関数が上書きなので、spec 側から関数を落とす。
type EqImpl<V extends AnyVal> = ((a: V, b: V, deepEquals: Eq<V>) => boolean) | EqPayload<SeedOf<V>>;

type EqPayload<T> = [T] extends [AnyVal]
  ? { equals: Eq<T> }
  : [T] extends [Primitive]
    ? never
    : [T] extends [readonly unknown[]]
      ? EqElements<T>
      : [T] extends [object]
        ? { [K in keyof T]?: EqSpec<T[K]> }
        : never;
```

プリミティブ payload では `EqPayload` が `never` になり、引数が上書き関数 1 本に潰れる。専用の分岐は要らない。

#### 却下: 自由関数 `Val.eqBy`

`.impl({ equals: Val.eqBy({ ... }) })` の形。3 つの理由で採らない。

1. **推論が賭けになる。** `V` を戻り値の文脈から引くことになり、「文脈の戻り値型からの推論 + マップ型の制約」は TypeScript の弱いところ。ビルダーの段なら `V` は固定済みで、この問いが消える
2. **`Val` に生やすと落とせない。** バンドラは `const Val = {...}` のプロパティを落とせないので、使わない人が gzip で 181 B 払う（`toEq` を既存バンドルに足して実測）。独立エクスポートなら落とせるが、「eqBy はどっちから import するんだっけ」が永久に残る
3. **`equals` の書き方が 3 通りになる**（手書き / eqBy / 既定）

#### 却下: 配線対象を `.impl` に置いたままにする

→ §7.7

#### 省略を許すか（許す）

spec のキーを必須にすればカスタム equals の指定忘れを型で防げる、という発想は成立しない。選択肢は 3 つあり、型で解ける範囲に上限がある。

1. **全キー省略可。** 簡潔だが指定忘れは検出されない
2. **子が Val であるキーだけ必須にする。** `HasVal<T>` を書けば型で計算できる。ただしカスタム equals を持たない子まで必ず書かされる。ネストした Val の大半は既定の `deepEquals` のままで、その場合は構造比較でも答えが同じ。機械的に埋める作業になり、その状態の「忘れ検出」はほぼ機能しない
3. **子が `equals` を上書きしたキーだけ必須にする。** 理想だが型からは見えない。`Val<"Money", ...>` から companion の値の型への参照が存在しないため。宣言マージのレジストリを用意すれば書けるが、問題が「レジストリへの登録忘れ」にずれるだけ

全キー必須（1 の逆）も取らない。`id` や `note` まで並べることになり、それは `deepEquals` を手で書き写す作業。

決定打は、**型で守れるのは `implEquals` を呼んだ人だけ**だということ。指定忘れが本当に危ないのは `implEquals` を書いていない親、つまり何も書いていない親であり、そこに型の付け入る隙はない。一番忘れやすい人が一番守られない。

したがって **spec は全キー省略可にし、忘れ検出は valof-lint に置く。**

- リンタは `.implEquals(` の存在をソースから直接見られるので、レジストリも型の仕掛けも要らない。専用の段にしたぶん、`.impl({ ... })` のオブジェクトリテラルからキーを探す必要がなくなった
- 必要な解析は既存実装と同じ形。import / namespace import / renaming re-export の追跡と、チェーンの根での companion 同定は既に入っている
- 規則: ある companion が `implEquals` を呼んでいて、その Val を payload に埋めている別の Val がある場合、親の companion は `implEquals` を呼ぶか、その spec でそのキーを指定していること
- 直し方が一意なので提案（fix）まで出せる

型は「spec に書いた比較が型に合っているか」を守り、リンタは「書き忘れていないか」を守る。

#### 却下: 素の payload へのカスタム比較を禁じる

spec を「どの子が自分の等価性を使い、どれを外すか」だけに絞る案。Val の位置には companion のみ、ブランドのない位置には除外指定（`Val.ignore`）のみ、というもの。等価性が型に属して 1 箇所で宣言される、という §5 の原則をそのまま型にした形になる。

採らない。原則の残り半分が型で担保できないから。「ネストした子がカスタム equals を持つときだけ `implEquals` を必須にする」型が書けない以上（上の 3）、Val の位置だけ締めても不変条件は成立せず、表現力が減るだけになる。`Val.ignore` というセンチネルを 1 つ増やす価値もそこで消える。`updatedAt: () => true` のまま置く。

---

## 6. スマートコンストラクタと更新

### 6.1 コンストラクタは作らなければ迂回できない

コンストラクタ生成を `Val.sealer` に分離し、`companion` からは切り離す。

```ts
Val.sealer<Tags>(); // コンストラクタ（+ 既定の振る舞い）
Val.sealer<User>().impl({ greet }); // コンストラクタ + 振る舞い
Val.companion<Age>().implSeal(check); // 振る舞いのみ。呼べない
```

呼べるかどうかは**検出の結果ではなく出自**で決まる。sealer はコンストラクタなので、そこから作ったものはコンストラクタのままであり、sealer を通さずに作った companion はそもそも関数ではない。

```ts
export const Age = Val.companion<Age>().implSeal((n: number, seal) =>
  n >= 0 ? ok(seal(n)) : err("negative"),
);

Age(30); // この式は呼び出し可能ではありません
Age.seal(30); // ← 唯一の入口
```

**却下: ゲート方式。** 当初の案は「`from` または `new` が companion に渡されていたらコンストラクタを返さない」だった。`HasSmartCtor<M>` でキーの有無を検出し、呼び出しシグネチャを差し替える。

```ts
(...args: ["User has a smart constructor. Use User.from() instead."]): never
```

実装して動いたが、出自で決めれば検出そのものが要らない。`HasSmartCtor<M>` / `SmartCtorGuard` / ゲート専用の `new` / `CompanionMethods` の返り値制約がすべて消えた。保証も強くなる。ゲート方式では**型エラーは出るが関数は実在し、実行時は throw していた**。今はコンストラクタが存在しないので、迂回する対象がない。

2 つの入口の差は「頭」だけに寄せてある。付与手段は `.impl()` ひとつで、選ぶのは「コンストラクタが要るか」という意味のある軸だけ。2 段呼び出しの理由は §13.1。

### 6.2 `with` / `update`

**自由関数版 `Val.with` は提供しない。** 実行時に型を特定できず、その型の seal にディスパッチできない。companion のメソッドとして提供する。

```ts
User.with(user, patch);
// 内部的には seal({ ...user, ...patch }) をそのまま返す
```

- カスタム seal が未定義 → 既定の seal（コピー）を通るので戻り値は `User`
- カスタム seal が定義済み → 戻り値は `ReturnType<typeof seal>`

これで「`with` がスマートコンストラクタを迂回する」穴が塞がる。値を作る経路はすべて seal を通る、という §6.8 の不変条件の一部である。

#### プリミティブ・配列の Val には `with` を生やさない

`Patch<T>` はオブジェクト以外に対して `never` を返す。当初はそれをそのまま流していたので、`Val<"IsoDate", string>` の companion にも `with` が生え、**引数が `never` で呼べないのに補完に出る**状態だった。実行時にも `TypeError` を投げるだけで、型が先に止められるはずのものを実行時に持ち越していた。

`with` を条件付きのプロパティにして、パッチする対象がないときは型から丸ごと消す。

```ts
type WithMethod<V, M> = [Patch<SeedOf<V>>] extends [never]
  ? Record<never, never>
  : { with: ... };
```

`[...] extends [never]` と裸でない形にするのは、`never` に対する条件型の分配を止めるため（分配すると条件全体が `never` に潰れる）。

- `update` は残す。プリミティブでも値→値の変換は意味を持つ（`IsoDate.update(d, addDay)`）
- 実行時の `TypeError` ガードも残す。型を通らない JS からの呼び出しには依然として必要で、役割が「主たる防御」から「最後の網」に下がっただけ
- 配列 Val も同じ扱い。要素単位の patch は `Patch` が表現できないので、`update` で丸ごと作り直すのが正しい経路

#### patch 内の `undefined` は「削除」

| patch の書き方     | 意味       |
| ------------------ | ---------- |
| キーを省略         | 変更しない |
| `{ k: undefined }` | **削除**   |
| `{ k: value }`     | 設定       |

patch は `Partial` なので、キーを省略すれば既に「変更しない」を表現できる。`undefined` にも同じ意味を持たせると**同じ操作に 2 通りの書き方ができる一方で、削除を表現する手段がなくなる**。

`undefined` は §3.5 で値の空間から除外した結果、**sentinel として使える唯一の値**になっている。その希少な枠は、他に表現手段のない「削除」に割り当てる。

実装も素直になる。`{ ...user, ...patch }` はスプレッド時点で「キーが存在して値が `undefined`」になるので、**マージ後に `undefined` のキーを落とせばそのまま削除**。マージ前に patch を掃除する必要がない。

参考: JSON Merge Patch（RFC 7386）は `null` を削除の意味に使う。本ライブラリは `null` を正当な値として許すため同じ手は使えないが、「値空間から外れた値を削除の sentinel にする」という発想は共通。

#### 誤削除への防御

`with(u, { nickname: form.nickname })` で `form.nickname` がたまたま `undefined` だったときの意図しない削除を、多層で防ぐ。

**1. 必須キーへの `undefined` は型エラーにする。** patch の型を optional / required で分ける。

```ts
type Patch<T> = { [K in Exclude<keyof T, OptionalKeys<T>>]?: T[K] } & {
  [K in OptionalKeys<T>]?: T[K] | undefined;
};
```

**2. optional キーの削除は正当な操作。** 「あってもなくてもいい」と宣言した項目なので、消せて当然。

**3. EOPT off でも seal が拾う。** EOPT が off なら required キーへの `undefined` は型で止まらない。その結果は不変条件を満たさないのでカスタム seal が `Err` を返す。**静かに壊れず、大きな音で失敗する**。

穴が残るのは「EOPT off かつカスタム seal 未定義」の組み合わせのみ。§3.5 と同じ立て付けで、README の EOPT 推奨がここでも効く。

#### patch は深さを問わず届く

`Patch` が shallow optional だと、深い更新のたびに深さの分だけ spread を書かされる。

```ts
User.with(u, { profile: { name: "x" } }); // 型エラー: age が無い
User.with(u, { profile: { ...u.profile, name: "x" } }); // これを毎回書く
```

React の state 更新はこれが日常なので、interop の看板を掲げる以上ここは塞ぐ。`Patch` を再帰させ、`with` を deep merge にした。

```ts
type PatchValue<T> = [Patch<T>] extends [never] ? T : Patch<T>;
```

**patch できる対象がない型（Val・配列・プリミティブ）は丸ごと差し替え。** optional / required の分岐は再帰でそのまま各段に効くので、誤削除への防御も余剰プロパティ検査も深い位置で同じように働く。追加の細工は要らなかった。

**Val で再帰を止めるのは §6.8 の帰結。** patch がネストした値の中まで届くと、その値の seal が一度も見ていない payload ができる。外側の `with` は外側しか seal しない。

書く側が失うものはない。ネストした値はその型自身の `with` で導出すればよく、そちらは自分の seal を通り、触っていない部分木の参照も保つ。

```ts
Shop.with(shop, { city: City.with(shop.city, { name: "Osaka" }) });
```

外側から見ると「コンストラクタが作ったノード」なので、§6.2 の owned 規則で差し替えになる。深い patch と同じ結果に、seal を 1 つも飛ばさずに着く。

#### 実行時の境界は `owned`

ブランドはファントムなので、実行時に「これは Val だ」とは読めない。読めるのはノードの出自だけで、それは §4.1 のコピーで既に記録している。

**owned なノードは patch ではなく値なので、merge せず差し替える。** 型側の「Val で止める」の実行時対応物であり、`{ owner: other.owner }` のように既存の部分木を渡す場合も同じ規則で差し替えになる。意図と一致する。

記録を失った payload（`structuredClone` や JSON 往復を越えたもの）では、ネストした値が merge に落ちる。壊れ方は「差し替えたつもりが optional キーの消し残りが出る」だけで、正しさの他の部分は保たれる。渡す前に seal し直すのが正しい対処。

#### 代償: ネストしたオブジェクトを縮められない

merge が既定になると、キーの少ないオブジェクトで置き換えられなくなる。§8 の Record-as-Map が一番刺さる。

```ts
Shop.with(shop, { staff: computed }); // 古いエントリが残る
Shop.update(shop, (s) => ({ ...s, staff: computed })); // 置換はこちら
```

新しい API は足さない。既存の 2 経路が意味で割れるだけである。

- `with` = patch。プレーンなオブジェクトを下まで merge、`undefined` で削除
- `update` = 置換。payload 丸ごとを返す

`{ staff: { u1: undefined } }` で 1 エントリだけ消せるので、Map 用途は以前より書きやすくなった。

#### 却下した案

- **patch の値に updater 関数を許す**（`{ profile: (p) => ... }`）。1 段しか砂糖が効かず、同じ操作に 2 通りの書き方ができる
- **パス指定 API**（`with(u, "profile.name", x)`）。template literal 型が型チェック速度と d.ts 予算を食い、API も増える。v2 候補
- **現状維持**。`update` と spread で書けるが、それなら `with` が存在する意味が薄い

#### コスト

production gzip 901 → 944 B（予算 1 kB、残り 80 B）。d.ts は 15.03 → 15.55 kB。`with` の既存ループがそのまま再帰関数 `patched` になるので、純増が小さい。

`patched` は各段で「何も変わらなければ元のノードを返す」ので、参照同一性は以前より細かく保たれる。

### 6.3 Result 型は提供しない

すでに neverthrow / Effect / fp-ts があるため、このライブラリでは提供しない。

**提供しなくても `with` は実装できる。** `with` は seal の戻り値を unwrap する必要がない（古い値は既に妥当なので、マージして seal に流すだけ）。戻り値の型を `ReturnType<typeof seal>` として推論すればよく、ライブラリは `Result` の中身を一切知らずに済む。どの Result 実装でも自作でも動く。

### 6.4 `update` は「値 → 値」に限定する

関数で変換する `update` は、チェーンすると `Result<Result<...>>` になりかねない。失敗し得る変換は `with` + 利用者側の `andThen` に任せる。

### 6.5 メソッドの第一引数を Val に固定する（`impl` / `implSeal`）

`greet(u: User)` の `: User` は、全 companion の全メソッドに書く定型だった。`impl` の index signature を Val 始まりの**単一の関数型**にすると contextual typing が効き、注釈が不要になる。

```ts
export type CompanionMethods<V extends AnyVal> = {
  equals?: never;
  with?: never;
  update?: never;
  seal?: never;
  create?: never;
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonMethod;
};
```

`...rest` を `never[]` ではなく `any[]` にしているのは、注釈のない第二引数以降が `never` に推論されるのを避けるため。代入互換性はどちらでも通る。

#### 「単一の関数型」でなければ効かない

contextual typing が生きる形は 1 つしかない。実測で全滅した代替案。

| 形                                                  | 結果                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| union に `AnyFn` を足して `from` を逃がす           | 候補シグネチャが 2 つになり contextual typing が消える                                    |
| F-bounded な mapped 制約 `M extends Table<V, M>`    | 検証は効くが contextual typing は消える                                                   |
| intersection `{ from?: AnyFn } & Record<string, …>` | `Record` 側が全プロパティを見るので例外にならない                                         |
| overload（strict → loose の 2 本）                  | `from` を含むと他のメソッドまで implicit any になり、loose 側が何でも通すので検証も消える |

さらに、**`M` にデフォルト型引数を与えるだけで contextual typing が死ぬ**。`impl: <M extends CompanionMethods<V> = Record<never, never>>(methods?: M) => …` だと TS は制約を contextual type に使わなくなり、全メソッドの第一引数が implicit any に落ちる。引数なしの `.impl()` はオーバーロードで残した。

```ts
impl: {
  (): Sealed<V, Record<never, never>>;
  <M extends CompanionMethods<V>>(methods: M): Sealed<V, M>;
};
```

#### コンストラクタは `.implSeal` / `.implCreate` に出す

第一引数が Val でない関数はこの制約を通らない。スマートコンストラクタの第一引数は「封をする対象」であって Val ではないので、メソッド表には置けない。builder の一段に出す。

```ts
export const Age = Val.companion<Age>()
  .implSeal((n: number): Result<Age> => …)
  .impl({
    next(a) { … }, // a は Age
  });
```

オプション引数（`Val.companion<Age>({ seal })`）は取れない。TS は型引数の部分推論ができないので、`V` を明示した時点で関数の型は推論されずデフォルトに落ちる。

**名前は `implSeal`。** `.seal(fn)`（登録する）と `Age.seal(x)`（呼ぶ）が同名になる駄洒落を避けた。`smart` / `ctor` は短いが「生えるメソッドが何であるか」を名前が示さない。`impl` の第 2 スロットにする案は名前の問題は消えるが、意味が位置でしか決まらず、一番重要なコンストラクタが従属物に見える。`seal` に落ち着くまでの経緯は §6.9。

#### 配線対象を `.impl` に書いたら型エラーにする

プリミティブ payload では `V` が第一引数の型に代入可能になることがある（`Val<"Age", number>` に対する `seal(n: number)`）。すると**関数が制約を通り、ただのメソッドとして生えて、`with` / `update` が配線されない**（`create` なら**seal を通らない鋳造経路ができる**）という無言の事故になる。移行中に実際に踏んだ。`seal?: never` / `create?: never` を宣言して弾く。

メッセージを型に乗せる案（`seal?: "use .implSeal() …"`）も試したが、`never` を採った。エラー文の見た目は落ちる。optional 修飾子のせいで `never | undefined` になるため、TS は次のように言う。

```
Type '(n: number) => Age' is not assignable to type 'undefined'.
```

引数の型としてしか情報を置けない場所ならメッセージ埋め込みが要る。ここは `seal` というキー名自体が何をしようとしたかを示していて、`implSeal` は API のすぐ隣にある。型の意図（「ここに `seal` は置けない」）をそのまま書けるほうを取る。

`equals` / `with` / `update` も同じ理由で `never` にした。事故の形は違って、こちらは**生えはするが配線が外れる**（`equals` の第 3 引数が来ない、`with` の戻りが seal を通らない）。専用の段に出した経緯は §7.7。

#### sealer に `implSeal` は生やさない

**sealer は既定の seal そのもの**であり、その隣に検査つきの seal を並べれば、最初の seal が「迂回する穴」になる（§6.1）。`implSeal` は companion 専用。

#### `implSeal` は必須にしない

`Val.companion<V>().impl({…})` をカスタム seal なしで許すか。**許す。**

1. **必須にしても閉じる穴がない。** `Val.of` は公開 API で、seal の有無に関わらず `Val.of<Age>(-1)` は通る
2. **一貫性が取れない。** `Val.companion<V>()` は素の状態で既に使える Companion（`equals` / `with` / `update` を持つ）。`.impl` だけ seal 必須にしても手前が空いている
3. **偽の seal を書かせる。** `(v) => Val.of<V>(v)` という素通しのラバースタンプが生える。検証しているように読めて何もしていない seal は、seal がないことより悪い

カスタム seal なし companion は意味のある形でもある。値が境界（デコーダ、DB 行、外部 API）から来る型では、コンストラクタを持たず振る舞いだけ束ね、構築は `Val.of` で行うのが正しい。

#### 失うもの

第一引数が Val でない補助ファクトリ（`Money.fromCents(n)` / `IsoDate.parse(s)`）は companion に置けない。これらは「値に対する振る舞い」ではないので、素の export 関数に分離されるほうが筋が通る。多引数のコンストラクタ（`Point.create(x, y)`）は `implCreate` が引き受けるので影響なし。

### 6.6 `with` / `update` は上書き可能にする（強制はしない）

カスタム seal があるとき `with` / `update` の手動定義を必須にするか。**必須にはしない。ただし書けるようにする。**

必須にすべきでない理由は `implSeal` 必須化と同じで、**ラバースタンプを書かせる**から。自前の `with` は `seal({ ...v, ...patch })` というライブラリの既定そのものになる。

一方で**逆向きの穴**が空いていた。既定の `with` が「自分で updater を書け」と言うのに、**書く場所が型に存在しなかった**。`.impl` に自前の `with` を書くと `attach` が既定の後にユーザーのメソッドを定義するので**実行時には正しく上書きされる**が、型は `Omit<M, "with" | "update">` で捨てていたため既定のシグネチャのまま。呼び出し側は相変わらずエラーになる。

`implWith` / `implUpdate` を足した。型は登録された上書きをビルダーの型引数で運ぶ（`implSeal` の `F` と同じ形）。

```ts
type WithMethod<V, W, F, P> = [W] extends [undefined]
  ? [Patch<Patchable<V, P>>] extends [never]
    ? Record<never, never>
    : { with: Derive<V, F, Patch<Patchable<V, P>>> }
  : { with: WithoutSeal<W> };
```

副次的に、既定では `with` を持たないプリミティブ Val（§6.2）にも、明示的に定義すれば `with` を生やせる。既定を消すことと、書くことを禁じることは別。

#### 上書きには seal を第 3 引数で渡す

自前の `with` は「新しいペイロードを型の seal に通す」だけのことが多いが、**その seal を参照する手段がなかった**。`YourVal.seal(...)` は companion 自身の初期化中なので書けず、`Val.of` を直に呼ぶと型の seal を迂回する。名前付きの関数に括り出して両方から呼ぶ、という定型をドキュメントに書いていたが、定型は API の不足の兆候だった。

`equals` が `deepEquals` を第 3 引数で受け取るのと同じ形にした。理由も同じで、**自由関数として公開すると型の seal を迂回する経路になる**ので、必要な場所にだけ手渡す。

```ts
.implWith((u, patch: Patch<Fields>, seal) => seal({ ...u, ...patch }));
```

公開側は 2 引数に潰す（`WithoutSeal<T>`）。パラメータの数で分岐するので、seal を取らない 2 引数の上書きはそのまま公開される。

```ts
type WithoutSeal<T> = T extends (...args: infer A) => infer R
  ? A extends [infer Value, infer Arg, unknown]
    ? (value: Value, arg: Arg) => R
    : T
  : T;
```

第 3 引数の型を与えるために `CompanionMethods<V, F>` に `with?` / `update?` を宣言した。patch の型は利用者が決めるものなので `any` にしてある。`never` にすると index signature（`(value: V, ...rest: any[]) => unknown`）に代入できず TS2411 になる。`any` は `never` に代入できないため。

### 6.7 seal と create を分ける

既定の `with` には型で塞げない穴が残っていた。「コンストラクタがペイロードを受け取れる」は**必要条件であって十分条件ではない**。

```ts
.implSeal((input: Fields): User => make({ id: crypto.randomUUID(), ...input }))
```

`SeedOf<User>`（`{id, name, email}`）は `Fields`（`{name, email}`）に代入可能なので `with` は型検査を通る。しかし実際に走るのは `seal({ id, name, email })` で、この関数は渡された `id` を捨てて新しい `id` を振る。**型エラーなしに ID が毎回変わる。**

構造的にこれを弾くことはできない。「引数がペイロードそのもの」を要求すると `seal(input: object)` という zod の正当な形が消える。`object` も `Fields` も同じく `SeedOf<V>` の真の supertype で、区別がつかない。

#### 規約: seal は冪等（鋳造は `create` へ）

seal は「ペイロードに封をする」操作であり、**`seal(v のペイロード)` は `v` を返さなければならない**。ID 生成・時刻・連番のような鋳造はこの法則を破るので `create` に出す。登録も別ステップ。

| ステップ        | 制約                                                                            | 生えるもの |
| --------------- | ------------------------------------------------------------------------------- | ---------- |
| `implSeal(f)`   | `f: SealImpl<V>`（`(value: SeedOf<V>, ...rest: never[]) => unknown`）           | `seal`     |
| `implCreate(f)` | `f: Minter<V>`（`(...args: never[]) => SeedOf<V>`。引数は自由、戻りは payload） | `create`   |

1. **エラーが間違えた場所で出る。** 多引数コンストラクタは `implSeal` の**登録時**に落ちる。以前は 10 行下の `Point.with(...)` で怒られていた。「自前の with を書け」と説明する分岐は不要になり、削除した
2. **`create` と seal が共存できる。** DDD の create / reconstitute の分離そのもの。`create` がペイロードを鋳造し、seal がそれに封をし、`with` は seal を通るので `create` が再実行されない。§6.6 で「自前の `with` を書くしかない」と言った ID の例が、既定のまま正しく動く
3. **`create` だけでも `with` / `update` は生える。** 既定の seal（コピー）もペイロード関数だからで、`create` が振った `id` はコピーされて保存される。`Rebuild` は分岐を失った

```ts
type Rebuild<V, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;
```

サブセット形（`seal(f: { name: string })`）は今も `SealImpl<V>` の制約を通る。`seal?: never` と同じで、型では閉じない。冪等性も型では書けない。`create` という別ステップを用意し、そこに鋳造の置き場を作ることで、**規約を守る側が楽になる**という形で担保する。

**名前は `create`。** `new` はプロパティ名としては合法（`User.new(...)` は動く）だが、型リテラルで `{ new(x: number): Y }` と書くと構築シグネチャとして解析される罠があり、予約語でもある。

#### seal の引数の上限: `string` を受け取れてはいけない

`SealImpl<V>` が決めるのは下限（`SeedOf<V>` を受け取れること）だけ。上限は `CheckedSeal<V, G>` が別に見て、**引数が `string` を受け取れたら型エラー**にする。

```ts
.implSeal((json: string, seal) => seal(JSON.parse(json))); // 型エラー
.implSeal((input: unknown, seal) => seal(schema.parse(input))); // 型エラー
.implSeal((input: object, seal) => seal(schema.parse(input))); // OK
```

`with` / `update` はペイロードを seal に返す（§6.8）ので、ワイヤ形式のデコーダを seal に置くと、値から値を派生した瞬間に壊れる。落ちるのは `unknown` と `{}` で、スキーマライブラリに要る広さは `object` と `Record<string, unknown>` で足りる。

ペイロード自体が `string` の Val（`Val<"Email", string>`）は除外する。ペイロードとワイヤ形式を型で区別する手段がない。

#### sealer には `create` を生やさない

sealer は callable なので `create` を足しても構築経路は 1 本も絞られず、**得られるのは名前空間だけ**である。問題は、**名前が果たせない約束をする**こと。

```ts
const Task = Val.sealer<Task>().implCreate((t: Fields) => ({ id: uuid(), ...t }));

Task.create({ title: "x" }); // id が振られる
Task({ id: "forged", … });   // ← 隣で素通り
```

companion の `create` は「鋳造は `create`、封は seal、それ以外に値になる経路は無い」（§6.7 / §6.8）の一部として意味を持つ。sealer に同じ名前を置くと、同じ `create` が型によって強さの違うものになり、守っているように読めて何も守らない。`.unpatchable`（§6.10）も companion builder のステップなので、道具立てとしても中途半端になる。

多引数の別名コンストラクタ（`Point.create(x, y)`）が欲しいだけなら素の export 関数で足りる。そして **「sealer に `create` が欲しい」はたいてい companion が欲しい合図**で、鋳造したいフィールドがあるなら素の payload を誰でも渡せてはいけない。無いことがその方向に押す。

後方互換に追加できるステップなので、実例が積み上がったら再考すればよい。

### 6.8 seal を唯一の関門にする

**`create` の戻り値を seal に流す。** `create` の戻り型を `SeedOf<V>` に固定し、公開される `create` は `seal(create(...args))` になる。

```ts
.implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f })) // payload を組むだけ
.implSeal((u: SeedOf<User>): Result<User> => check(u)) // 封をするのはここだけ
User.create(fields); // → Result<User>
```

- **値になる経路が 1 本になる。** 「payload が Val になるのは seal を通るときだけ」がライブラリの不変条件になり、`create` は「引数から payload を組む」だけの存在に痩せる
- **戻り型が揃う。** 以前は `create` が `User`、`from` が `Result<User>` を返す不揃いがありえた。今はどちらも `Constructed<V, F>`
- **ユーザーコードから `Val.of` が 1 つ減る**
- **カスタム seal がないときは既定の seal（コピー）に落ちる。** `implCreate` の制約を `F` の有無で変えると登録順で `create` の型が変わるので、常に `SeedOf<V>` を要求して実行時にどちらの seal を使うかを決める

失うのは **`create` 自身が失敗できること**。`Result<SeedOf<V>>` を返されるとライブラリが bind しなければならず、「ライブラリは `Result` を知らない」（§6.3）に反する。壊れうる入力の検査は seal 側に寄せる（`seal(v: object)` は制約を通るので zod 形はそのまま書ける）。どうしてもペイロードを組む段階で失敗するものは素の export 関数に分ける。

#### seal の引数は不変のまま、コピーは `Val.of` の 1 回だけ

seal の引数を可変（`PayloadOf<V>`）にして、公開 `seal` が入口でディープコピーを取る案を一度実装した。正規化のために配列を `sort` できる、可変型を要求する他人の関数に渡せる、が理由だったが捨てた。

1. **immer 風の可変ドラフトになる。** 「値 → 値」に限定した `update`（§6.4）と書き味が矛盾する
2. **ES2023 で不要になった。** `toSorted` / `toSpliced` / `with` / `toReversed` があるので、正規化は「書き換える」ではなく「導出する」で足りる
3. **コピーが 2 回になる。** 入口のディープコピーは、末尾の `Val.of` のディープコピーに上乗せされる

引数を `SeedOf<V>` に戻せば、**入口のコピーはそもそも要らない**。readonly の引数を受けた seal は（キャストしない限り）呼び出し側のオブジェクトに触れず、所有権は `Val.of` が取る。カスタム seal が無い場合は既定の seal（`copy`）がその 1 回を担う。

失うのは、可変ペイロードを要求する他人の関数に payload をそのまま渡せないこと。`Val.unwrap` か spread を挟む（§4）。

公開される `seal` の型は登録された関数そのもの。zod 形（`seal(u: object)`）が広い入力を受け取れる性質もそのまま残る。

#### 経路とコピー回数

`copy` はペイロード全体を 1 回なめるディープコピー。浅いコピー（トップレベルのスプレッド）は別カウント。ネストした子 Val もディープコピーの対象に含まれるが、**子の seal は再実行されない**（§5 のディスパッチ不可）。

| 呼び出し                                   | カスタム seal を通るか        | 浅いコピー                | ディープコピー                      |
| ------------------------------------------ | ----------------------------- | ------------------------- | ----------------------------------- |
| `Val.of<V>(x)` / sealer の callable `V(x)` | 通らない（これが既定の seal） | 0                         | 1                                   |
| `V.seal(x)`（カスタム seal）               | 通る                          | seal が導出した分だけ     | 1（最後に通す既定の seal）          |
| 同上・検証に失敗して `Err` を返す          | 通る                          | 同上                      | **0**（既定の seal を通さない）     |
| `V.with(v, patch)`（カスタム seal なし）   | なし                          | 1（マージ）               | 1                                   |
| `V.with(v, patch)`（カスタム seal あり）   | 通る                          | 1 + seal の導出分         | 1                                   |
| `V.update(v, fn)`                          | 上と同じ                      | `fn` が作る分（通常 1）   | 1                                   |
| `V.update(v, fn)`（`.unpatchable` あり）   | 上と同じ                      | `fn` の分 + マージ 1      | 1                                   |
| `V.create(args)`                           | 通る                          | create が組む分（通常 1） | 1                                   |
| `.impl` の自前 `with` → 第 3 引数の seal   | 通る                          | 自前実装しだい            | 1                                   |
| `.impl` の自前 `with` → `Val.of`           | **通らない**                  | 同上                      | 1                                   |
| `Val.unwrap(v)` → 加工 → `V.seal(...)`     | 通る                          | 加工分                    | **2**（unwrap と seal で 1 回ずつ） |

- **どの正規経路もディープコピーは 1 回**で、位置は常に「値になる瞬間」＝既定の seal
- 失敗経路はコピーしない。検証が落ちる入力に対してコピー代を払わない
- 浅いコピーは経路の構造そのもの（マージ、`fn` の戻り、正規化の導出）
- `Val.unwrap` 経由の派生だけが 2 回になる。§4 が「派生に `unwrap` を使うな」と言っているのはこのため

**「ディープコピー 1」はなめる回数であって、なめる量ではない。** コピーは owned なノードで止まる（§4.1）ので、実際に払うのは新しく作った部分だけである。値の大きさではない。

101 ノードの payload、production ビルドでの実測。

| 呼び出し                                     | µs/op  |
| -------------------------------------------- | ------ |
| `City({ ...fresh, name })`                   | 11.087 |
| `City({ ...city, name })`                    | 0.151  |
| `City.update(city, (c) => ({ ...c, name }))` | 0.163  |
| `City.with(city, { name })`                  | 0.229  |
| `City.with(city, { geo: { lat: 36 } })`      | 0.439  |

70 倍の差は経路ではなく**渡したノードの出自**で決まる。`update` が特別なのではなく、値をスプレッドして直にコンストラクタへ渡しても同じになる。逆に、外から来たオブジェクトを組み立てて渡せば全部コピーする。

deep patch（§6.2）はこの性質を細かくした。patch が触った path のノードだけが新しく、兄弟はすべて owned のまま素通りする。

#### 既定の seal を第 2 引数で渡す

custom seal の中で値を作るには `Val.of<Age>(n)` と型引数を書く必要があった。既定の seal（brand + copy = その型に束縛された `Val.of`）を第 2 引数で渡せば、それが消える。

```ts
.implSeal((n, seal) => (n >= 0 ? ok(seal(n)) : err("negative")))
```

`equals` の `deepEquals`、上書き `with` / `update` の seal（§6.6）と同じ立て付け。渡すのは**既定の** seal であって自分自身ではないので、再帰にはならない。1 引数で書かれた seal はそのまま登録される。公開側は `WithoutDefaultSeal<F>` で第 2 引数を落とす。

**それでも `Val.of` は公開したままにする。** 消せば `.impl` のメソッドが自分の型の値を作れなくなり、seal なし companion（§6.5）も成立しなくなり、検証済みの値の再持ち上げ（JSON 往復、テストのフィクスチャ）も seal 経由の再検証を強制される。そもそも `payload as Age` は残るので**閉じられる穴ではない**。`Val.of<Age>(x)` は型引数を明示するぶん grep できる逃げ道である、という位置づけ。

| 値を作る場所                          | 手段                     |
| ------------------------------------- | ------------------------ |
| custom seal の中                      | 第 2 引数の seal         |
| `with` / `update` の上書き            | 第 3 引数の seal（§6.6） |
| `.impl` のメソッド / 境界での持ち上げ | `Val.of`                 |

### 6.9 名前が `seal` になるまで

登録は `implFrom`、生えるメソッドは `from` だった。順に落とした。

- **`from`**: `implFrom` が Rust の `impl From<T> for U`（＝任意の型からの変換）に読める。それは今の `create` の意味であり、**名前が指すものが実際と逆**だった
- **`validate`**: 検査は seal がやることの一つにすぎない。正規化（§5 の Email）も `Result` 包みも「検証」ではないし、`validate(x)` が引数をコピーするのは奇妙。boolean を返す述語だと誤読させる語でもある
- **`parse`**: コピーも失敗も自然に読める。しかし parse は「緩い入力を解いて型にする」語なので、**引数がペイロードに固定されている理由を名前が説明しない**。その制約は `with` / `update` がここを通せるために本質的なもので、恣意的に見えては困る
- **`seal`**: 封をする対象は中身そのものなので、引数がペイロードであることが名前から出る。すでにライブラリの語彙（`Val.sealer`）で、三分割が一列に並ぶ。「鋳造してはいけない」という §6.7 の規約も動詞から読み取れる

|                   | 引数    | 制約                         |
| ----------------- | ------- | ---------------------------- |
| `Val.sealer<V>()` | payload | なし（brand + コピーだけ）   |
| `.implSeal(f)`    | payload | あり                         |
| `.implCreate(f)`  | 自由    | payload を組んで seal に流す |

**残るリスクは `Object.seal` / `sealed class` との混線。** JS の `Object.seal` は実行時にプロパティ追加を禁じる操作だが、valof は凍結しない（§7.1）。Rust / Scala / Kotlin の `sealed` は型宣言に付く形容詞（閉じた継承階層）だが、こちらは値を作る動詞。valof には subtyping も variant もないので誤読の材料は薄いが、README と doc に一行で潰しておく。

### 6.10 `unpatchable`: 更新経路から外すキー

`create` が鋳造した `id` を `with` / `update` から触らせない、という §8.4 のパターンは、**`with` / `update` を両方とも上書きする**ことでしか書けなかった。上書きの中身は既定と 1 文字も違わず、**唯一の内容は patch の型**である。§6.5 / §6.6 で「ラバースタンプを書かせない」と決めておきながら、最も頻出するパターンでそれを強制していた。

宣言のステップを足す。

```ts
Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal(seal)
  .unpatchable<"id">();
```

#### キーは型引数で渡す（実行時には存在しない）

`unpatchable("id")` と文字列で渡せば実行時にもキーが分かるが、型引数だけにした。ブランドがファントムであることと揃うし、得られる保証も §8.4 が既に認めている水準（「通常の更新経路では触れない。`Val.of` では偽造できる」）と同じ。型を迂回したケース（`any` 経由など）で実行時に旧値を復元する挙動は、バグを隠す側にも働く。

**キー名が無くても `update` は成立する。** `unpatchable` を呼んだという事実（boolean 1 つ）だけ実行時に残せば、`update` は `seal({ ...value, ...fn(value) })` とマージすればよい。コールバックが返すのは残りのキーだけなので、触れないキーは古い値から生き残る。

|                         | 既定                        | `unpatchable<K>()` あり              |
| ----------------------- | --------------------------- | ------------------------------------ |
| `with` の patch         | `Patch<SeedOf<V>>`          | `Patch<Omit<SeedOf<V>, K>>`          |
| `update` のコールバック | `(v) => SeedOf<V>` を素通し | `(v) => Omit<SeedOf<V>, K>` をマージ |

既定側でマージしないのは、**optional キーの削除**を残すため。マージする側ではそれができなくなるので、削除は `with(v, { k: undefined })` を使う。

#### `NoExtra` はライブラリの内側へ

コールバックの戻り型を狭めるだけでは `(v) => ({ ...v, id: "forged" })` が通る。原因は `Omit` でも `update` でもなく、**余剰プロパティ検査（freshness）のルール**。

| 書き方                                              | 結果      |
| --------------------------------------------------- | --------- |
| `const x: Plain = { owner, id }`                    | ❌ エラー |
| `i({ owner, id })`（直接の引数）                    | ❌ エラー |
| `h((): Plain => ({ owner, id }))`（返り値型を注釈） | ❌ エラー |
| `h(() => ({ owner, id }))`（返り値型は推論）        | ✅ 通る   |
| `h(() => { return { owner, id }; })`                | ✅ 通る   |
| `const lit = {…}; h(() => lit)`                     | ✅ 通る   |

余剰プロパティ検査はリテラルが**目標の型と直接突き合わされたとき**にしか働かない。コールバックに返り値注釈がないと、TS はまず本体から戻り型を推論し、そのあと関数の代入互換性を検査する。この時点でリテラルの freshness は失われている。

**回避策は freshness に頼らないこと。** 余分なキーを構造的なエラーにする。

```ts
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

update: <T extends Patchable<V, P>>(value: V, fn: (value: V) => NoExtra<T, Patchable<V, P>>) => …
```

`T` はコールバックが実際に返した型から推論されるので、`Patchable` にないキーは `never` に写されてエラーになる。`T extends NoExtra<T, S>` と制約側に書くほうが見た目はきれいだが **TS2313（circular constraint）**。§3.5 で `Val<K, T>` の自己参照制約を条件型に逃がしたのと同じ制限で、ここでは引数の型に置く。

この技が**利用者のコードからライブラリの実装に移った**のがこの節の実利で、§8.4 は 4 行になった。

#### 名前

`implProtect` / `implFinal` / `implMinted` を経て `unpatchable` にした。

- `impl` 接頭辞は付けない。`impl*` は「X の実装を与える」に揃えたが、これは関数を 1 つも渡さず型について宣言するだけのステップ。**実装を与える手順と、性質を宣言する手順が名前で区別される**ほうが良い
- `final` は JVM の語彙（`final val` / `sealed abstract class`）を持ち込み、`seal` を `sealed trait` の意味に誤読させる。`finalize` は GC のファイナライザ（`FinalizationRegistry`）と、ビルダーの終端（`.build()`）の両方に読める
- `minted` は §6.7 の鋳造の比喩と最も整合するが、`create` を持たない型では意味が曖昧になり、英語圏外の読み手には通じにくい
- `unpatchable` は既に公開している `Patch<T>` からしか意味を取らない。新しい比喩も、やっていること（patch の面からキーを外す）以上の約束も持ち込まない

---

## 7. 見送ったもの（と、その理由）

すべて §1 の一本の線から落ちている。

### 7.0 コンストラクタのゲート

→ §6.1。`Val.sealer` にコンストラクタ生成を分離した結果、検出も差し替えも不要になった。作らなければ迂回できない。

### 7.1 実行時 freeze

**常時 freeze はしない。development でのみ freeze する。**

不変性の実効的な穴はエイリアシングのほうで、それは §4.1 のコピーで閉じた。freeze が追加で防ぐのは「`readonly` を意図的に破る書き込み」だけ。`as` が必須というわけではなく、`Object.assign(v, {...})` や `const r: Record<string, unknown> = v; r.k = 1` はキャストなしで型チェックを通る。それでも「値に書き込む」という意図的な行為であることに変わりはない。

|                          | 入力が新品 | 子が既に Val | flat 3キー |
| ------------------------ | ---------- | ------------ | ---------- |
| コピーのみ               | 853        | 833          | 44         |
| コピー + freeze          | 1,216      | 1,182        | 63         |
| コピー + WeakSet 再利用  | 1,055      | 220          | 142        |
| コピー + freeze + 再利用 | 1,387      | 258          | 162        |

freeze は一律 25〜30% の上乗せ（ns/op）。読み出し側でも、オブジェクトのプロパティ読みは影響なし（3.54 vs 3.99 ns）だが、**配列の要素アクセスが 1.7x 遅くなる**（5.42 vs 3.11 ns、V8 が `PACKED_FROZEN_ELEMENTS` に落とすため）。

dev 限定で採る理由は、§4.1 のノード共有が**不変性違反の影響範囲を広げた**こと。キャストで値を書き換えたとき、以前はその値 1 つが壊れるだけだったが、共有しているすべての値に波及する。

- 判定は `assertPlainObject` と同じ `process.env.NODE_ENV`。モジュール定数 `development` にまとめたので、production ビルドでは分岐ごと畳まれる
- **production の gzip は変わらない**（development ビルドだけ 1.02 → 1.04 kB に増える）
- `Val.unwrap` は `sealing = false` で走る。このフラグが「共有しない / 登録しない / freeze しない」の 3 つを同時に決める。可変なコピーを返す契約なので 3 つとも必要

**freeze は保証ではなく開発時の検出**であり、production では `Object.isFrozen` は `false`。

### 7.2 Map / Set

`ReadonlyMap` / `ReadonlySet` は型レベルの飾りで、実行時は素の Map。`Object.freeze` も効かず JSON も通らない。

独自の不変型で包む案も却下。

- `JSON.stringify` が独自形になる。`toJSON` を書いても復元は自動で戻らないので、「境界を越えられる」が「専用シリアライザを通せば越えられる」に格下げされる
- メソッドを持たせるなら実質 class で、`structuredClone` でプロトタイプが落ちる。class を避けた元の動機を自分で壊す

さらに `structuredClone` は**キーの参照同一性を壊す**。

```ts
const key = { id: 1 };
const m = new Map([[key, "v"]]);
structuredClone(m).get(key); // undefined
```

オブジェクトをキーにした Map は構築した瞬間に引けなくなる。キーはプリミティブに限定するしかなく、それなら `Readonly<Record<string, T>>` でほぼ足りる（§8.1）。

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

「型で ISO 文字列を保証したい」というニーズは、ライブラリの中核機能でそのまま解ける（§8.2）。

### 7.4 TaggedEnum（Effect.ts 相当）

ADT は判別子が**実データとして**必要で、「ブランドはファントム」という前提から外れる。

また ADT の価値のほぼ全てはパターンマッチの品質にあり、そこは ts-pattern が既に強い。競合するより interop を考える方が筋がいい。

v1 では見送る。やるなら別エントリポイント。

### 7.5 Result 型

→ §6.3

### 7.6 親から子のカスタム equals へのディスパッチ

→ §5。親が要るなら自分で書けばよい（親の型は静的に分かっている）。

```ts
const Order = Val.sealer<Order>().implEquals(
  (a, b) => a.id === b.id && Money.equals(a.total, b.total),
);
```

新しい機構ゼロ、シリアライズに不変、プリミティブな子でも動く。冗長なぶんは §5 の「正規形で構築する」原則と `implEquals` の spec で消える。

**却下: 値に symbol キーで equals への参照を持たせる。** §5 で挙げた 3 経路のうち「値がタグを持つ」の変種。実行時に検証した結果、以下の理由で採らない。

1. **プリミティブ payload に付けられない。** `Val<"Email", string>` に `defineProperty` は TypeError。カスタム equals が一番欲しいのは case-insensitive な Email のような型で、欲しい場所でだけ使えない
2. **`structuredClone` と JSON 往復で黙って消える**（symbol キーは両方とも脱落する。spread は enumerable なら保持される）。`deepEquals(o, structuredClone(o))` が `false` になり得る。例外は出ないので、worker 境界や localStorage 経由でだけ壊れる
3. **等価性が対称でなくなる。** 片方だけが symbol を持つ組み合わせが普通に起き、`equals(a,b) !== equals(b,a)` になる。同値関係が壊れると Set 表現（§8.1）が崩れる
4. **コンストラクタが呼び出し側のオブジェクトを書き換えることになる**（frozen な入力は TypeError）

§4.1 の WeakSet と対比すると差が明確になる。WeakSet も「値の外に置いた出自の印」だが、取りこぼしたときに変わるのは**速度だけで意味論は動かない**。symbol 案は取りこぼすと等価性そのものが変わる。

#### 却下: プリミティブを独自ラッパーで包む変種

理由 1 を、プリミティブ payload を `{ raw, [Symbol.equals], [Symbol.val]: true }` のようなオブジェクトで包むことで回避する案。理由 1 と 4 は消えるが、採らない。

**買えるのは 1 点だけ。** プリミティブ payload の子に対するカスタム equals のディスパッチのみ。deep copy の削減は買えない。プリミティブのコピーはもともとコスト 0 なので、ラッパーが削るコピーは存在しない。オブジェクト/配列の子の共有は §4.1 の所有権追跡が意味論を変えずに解いており、ラッパーは生成コストだけを足す。

**失うもの。**

1. **JSON 往復の対称性。** `toJSON` で出す側は直せるが、`JSON.parse` は素のプリミティブを返す。復元にスキーマ駆動の revive、つまりコーデック層が要る。§7.2 で独自不変型を却下した理由がそのまま返ってくる
2. **理由 3（等価性の非対称）は残る。** `Val.of` と JSON 由来の値は素のプリミティブのままなので、片側だけがラッパーという組み合わせは普通に起きる
3. **§8.1 の Map / Set 慣用パターンが壊れる。** `Record<UserId, T>` や `Set<UserId>` が動くのは Val が実行時に素の string だから。ラッパーは参照同一性で比較されるので、内容の等しい 2 つの `Email` で `map.get()` が引けない
4. **境界での silent failure。** `.raw` のコストはタイプ数ではなく、境界を越えるたびに要ることと、忘れても型エラーにならない経路があること（テンプレートリテラル、`===`、`switch`、React の `key`、URL 組み立て、SQL パラメータ）
5. **設計として class に劣位。** 値ごとに symbol キーで equals 参照を持つより、prototype に 1 つ置く class のほうが速くメモリも少ない。その class は §7.2 / §7.3 で `structuredClone` を理由に却下済みで、ラッパーは同じ壁に、より非効率な形でぶつかる

プレーンなデータであることはこのライブラリの差別化のすべてで、それを捨てると Effect Schema / Data と同じ土俵に 1/50 の表面積で立つことになる。

### 7.7 `equals` / `with` / `update` を `.impl` に置いたままにする

**却下。専用の段（`implEquals` / `implWith` / `implUpdate`）に出す。**

`.impl` は「そのまま生やすもの」の置き場で、そこに置かれた関数は名前どおりに companion に付く。この 3 つだけは違う。ライブラリが配線する。

- 戻り値の型が決まっている（`equals` は `boolean`、`with` / `update` は seal の戻り）
- 第 3 引数が束縛されて公開側から消える（`deepEquals`、既定の seal）
- companion の型で `Omit<M, "equals" | "with" | "update">` されて、`M` から取り除かれる

実行時にもそれは出ていて、`attach` の `for` ループがこの 3 つを `continue` で特別扱いしている。「`.impl` は素通し」という建前が既に破れていた。

`seal` と `create` は最初から専用の段にあり、`.impl` 側では `never` で弾いている（§6.5）。規則を 1 本に揃えると全部そこに乗る。

> **ライブラリが配線するものは専用の段。`.impl` はそのまま生やすものだけ。**

型の側も既存の形に乗る。`WithMethod<V, M, F, P>` の `"with" extends keyof M` は、ビルダーの型引数に対する `[W] extends [undefined]` になるだけで、これは `implSeal` の `F` が `SealMethod<F>` / `Derive<V, F, _>` / `Constructed<V, F>` でやっていることの写し。

代償は 2 つ。**`Companion` の型引数が 5 から 8 に増える**（人は書かないが宣言に名前として出る）。**`Sealer` が段を持つ**ので `build()` と統合が要る。後者は `Val.sealer` が持っていた専用の実装が消えるぶん、実装は減った。`Sealer` に `implSeal` / `implCreate` を生やさない判断（§6.5）はそのまま。

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

README に書く注意点。

- **数値キーは JSON 往復で文字列になる。** 数値 ID の集合には `ReadonlyArray<number>` を勧める
- **キーの順序**はオブジェクトの仕様上、数値っぽい文字列が昇順で先に来る。Set 用途なら実害はないが、デフォルト equals がキー順に依存していると壊れる
- **プロトタイプ汚染系のキー**（`"__proto__"` / `"constructor"`）。ユーザー入力をキーにする場合は `Object.hasOwn` で判定する。ヘルパを companion 側に置くのが素直
- **`Object.entries` にファントムキーが混ざる。** Val はブランドとの交差型なので、`Object.entries(table)` の値型が `"PriceTable" | Record<...> | Money` の union になる。実行時にそのキーは存在しないので、型だけの問題。`Object.entries<Money>(table)` と値型を書けば消える（`Object.keys` は `string[]` なので無害）

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

検証を seal に置けば、更新経路（`with` / `update`）も鋳造経路（`create`）も全部そこを通る（§6.2 / §6.8）。引数は `object` まで広げてよい。`SealImpl<V>` はペイロードを**受け取れる**ことしか要求しない。`unknown` は `string` も受けるので落ちる（§6.7）。

```ts
export const User = Val.companion<User>()
  .implSeal((input: object, seal): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(seal(r.data)) : err(r.error.message);
  })
  .impl({ greet(u) { … } });
```

zod の `.brand()` との違いはここに出る。あちらの検査はパースの一度きりで、結果から派生した `{ ...user, name: "" }` はブランド付きの型のまま再検査されない。valof の `with` / `update` は seal を通り直す。**README にはこの対比を書かない。** 詳細に寄りすぎるので、一行（「派生のたびにスキーマが走る」）だけ置き、対比は宣伝記事に回す。

**ワイヤ形式のデコードは seal に入れない。** `seal(json: string)` は `CheckedSeal` に落ちる（§6.7）。形式のパースは手前の別関数に分ける。

```ts
export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

値が常に検証済みで届く型（デコーダ、DB 行）は、カスタム seal を登録せず境界で `Val.of` に持ち上げる（§6.5）。この場合 `with` / `update` はコピーで再構築し、何も再検証しない。**境界を一度通れば以降は信頼する**という設計を選んだことになる。

### 8.4 更新経路から外したいフィールド

コンストラクタ内で生成する ID、`createdAt`、バージョン番号。`create` が鋳造し、seal が封をし、`.unpatchable`（§6.10）が更新経路から外す。

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

`update` も塞ぐ必要があるのは、コールバックがペイロード全体を返す経路だから。`with` の patch だけ絞っても `id` は届く。

**それでもこれは private ではない。** `user.id` は読めるし、`readonly` は実行時に消えるし、`Val.of<User>({ id: "forged", … })` で偽造できる。得られるのは「通常の更新経路が `id` を動かせない」だけ。偽造も防ぎたいなら `id` は値の外に持つ。

---

## 9. 未解決 / 要確認

- [x] ~~タプル対応（§4.2）~~ → 入れた。0.3.0 で出す（型だけの破壊的変更）
- [x] ~~`Val.eqBy`（§5）~~ → `implEquals` の spec として入れた。自由関数は却下（§5）
- [x] ~~`eqBy` の `V` が戻り値の文脈から推論されるか~~ → ビルダーの段にしたので問いが消えた
- [x] ~~`eqBy` を `Val` のプロパティにするか独立エクスポートにするか~~ → どちらでもない。`implEquals` の引数。gzip 予算は 1.25 kB に引き上げ、実績 1.13 kB（残り 119 B）
- [ ] valof-lint に「カスタム `equals` を持つ子を構造比較している親」の規則を足す（§5）。§14.5 で ts-morph 版を試して却下しているので、報告の粒度から設計し直す
- [ ] valof-lint の規則: `PayloadOf<X>` が Val の payload の**プロパティ位置**に現れたら警告する。正当な用法（トップレベルの交差型の基底）とは構文位置で区別できる
- [x] ~~README に性能の一行を足す（§4.1）~~ → `Constructors copy their argument` に、コピーが owned ノードで止まることと、変化のない patch が値をそのまま返すことを追記
- [x] ~~README の `Reusing a Val` に一行足す（§4.1）~~ → フィールド位置の警告を追記
- [x] ~~README の validation 節を zod で書き直す（§8.3）~~ → `With a schema library`。`seal(input: unknown)` は §6.7 の制約に落ちるので `object` で widen する
- [ ] `unpatchable` はトップレベルのキーしか外せない（§6.10）。deep patch が入ったので、深い位置のキーを外したい要求が出るか様子見。パスを型引数で受ける形になるが、`Patch` の再帰と噛み合うかは未検証
- [x] ~~`owned` の記録を失った payload の挙動を README に載せるか（§6.2）~~ → 載せない。`structuredClone` を通れば別のオブジェクトになる、は JS を書く人には自明で、そこから派生のコピーも merge も導ける。記録は §6.2 に残す
- [x] ~~README のコード例を型検査するか~~ → やらない。twoslash が Rust の doctest に当たるが、前置きを隠す `// ---cut---` が効くのは twoslash のレンダラだけで、**README を読む GitHub と npm では前置きがそのまま見える**。隠すにはドキュメント専用サイトが要り、この規模のプロジェクトには重い。フェンスに id を振って前置きを別ファイルに置く自前の仕組みも書けるが、保守対象が 1 つ増える
- [ ] Record payload を回す糖衣（`Val.entries` など）を足すか（§8.1）。`Object.entries<Money>(t)` で回避できるので優先度は低い。バンドル予算の残りは 80 B
- [ ] `Temporal` の各ランタイムでの対応状況（外す方針なので優先度は低いが、README で触れるなら要確認）
- [ ] Records & Tuples 提案の現状。2025 年春に champion が取り下げて Composites を模索していたはずだが、要確認。**言語側の解決を待つ戦略は取らない**
- [ ] **npm で `valof` を予約する**（プレースホルダを publish しておく）
- [ ] npm の既存ライブラリ調査（`brand` / `value-object` / `newtype`）
- [x] ~~`null` と `undefined` の扱い~~ → §3.5
- [x] ~~`Validate<T>` の自己参照制約~~ → 型エイリアスでは TS2313。条件型に変更（§3.5）
- [x] ~~Mutable ↔ DeepReadonly の往復が型推論に素直に効くか~~ → 効く。プロパティの `readonly` は代入互換性に影響せず、可変配列は `ReadonlyArray` に代入できるので、引数型を `SeedOf<V>` にすれば可変な入力もそのまま渡せる
- [x] ~~型チェック速度のベンチマーク~~ → §4 のベンチマーク（deep patch 後に再測、同節）
- [x] ~~コピーの WeakSet 再利用を入れるか~~ → 入れた。全ノード登録（§4.1）。symbol キー案と閾値案は実測して却下
- [x] ~~パッケージ名~~ → `valof`（§12）
- [x] ~~GitHub リポジトリ名 `valof` の確保~~

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
- `with` / `update`（Result 非依存、seal を通る。`.impl` で上書き可能で、そのとき seal は第 3 引数で渡される、§6.6）
- `.unpatchable<K>()`（更新経路から外すキーを型引数で宣言、§6.10）
- `Val.of`（既定の seal を型名つきで呼ぶ形、§2.2）
- `Val.unwrap`（可変なコピーを取り出す出口、§4）

**入れない:**

TaggedEnum、Map/Set のラッパー、Result、実行時 freeze（dev を除く）、Date/Temporal、親からの equals ディスパッチ、自由関数版 `Val.equals` / `Val.with` / `deepEquals`、コンストラクタのゲート、sealer への `implSeal` / `implCreate`

### 10.1 サポートする TypeScript

**各メジャーラインの最終リリース以降を支える。** 現在の下限は 5.9.3 で、README は `TypeScript 5.9 or later` と書く。

下限は「動く最古のバージョン」ではない。実測では **4 系も 5.0.4 も通る**。それでも切り上げるのは、ラインの途中のバージョンが持ち込むエッジケース（半端に入ったフラグ、まだ効いていない非推奨）を支える相手がいないからで、ラインの最終リリースはその系列の意味が固まった点である。TS 7 が最新の今、2 つ前のラインの最後が 5.9.3 に当たる。

CI は `vp run ts-compatibility`（`scripts/ts-compatibility/`）で、**公開する `dist/index.d.mts` に対して** 各ラインの最終版を回す。src ではなく宣言ファイルを見るのは、tsgo の出力が古いコンパイラで読めない可能性がそこにあるため。

**固定するのは下限だけで、その上のラインはレジストリから読む。** ラインの一覧も番号も書かない。書き下した瞬間に古くなり（6.1 が出ても 6.0 を見続ける）、新しいメジャーは誰かが気づくまで CI に入らないため。人間の判断として残るのは下限をどこに置くかだけになる。

代償は CI が外部の状態に依存すること。TS が新しいリリースを出した日に、こちらの変更なしで赤くなりうるが、それはまさに知りたい情報である。プレリリースは除外するので beta / rc では動かない。

7 系も回す。`vp check` の tsgo と同じラインだが、npm の `typescript@7` は別物として配られるので、利用者が踏む経路をそのまま踏む。Go 実装で速いので追加コストはほぼない。

fixture は `scripts/ts-compatibility/public-api.ts` の 1 本。`valof` を隣の tsconfig が `dist/index.d.mts` に向けるので、**利用者と同じ経路で公開面だけを見る**。

この 1 本はリポジトリ本体の型検査からは外す（`lint.ignorePatterns`）。oxlint は tsconfig の include / exclude に関わらず全ファイルを見に行き、そこでは `valof` が解決できないため。壊れれば `vp run ts-compatibility` が赤くなるので、検査されない状態にはならない。

`@ts-expect-error` は未使用ならエラーになるので、否定ケースもそのまま検証になる。vitest の glob（`*.test.ts`）に当たらないため、テストとしては走らない。

この規則を入れた時点で、6.0.3 だけが落ちた。ライブラリではなく fixture の `baseUrl` が TS 6 で非推奨（TS5101）になっていたためで、**ラインごとに回さなければ気づかない類のもの**だった。

---

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

- **`valueOf` の連想が正確。** Java/Kotlin の `Integer.valueOf()` は「生の表現から値を構築する」イディオムで、スマートコンストラクタとほぼ同義
- **FP の `of` とも整合。** `Array.of` / applicative の `of` は「生の値を型に持ち上げる」操作。`Val.of` そのもの
- **パッケージ名が API に登場。** `import { Val } from "valof"` → `Val.of(...)`
- **発音が一意。** 「ヴァルオブ」以外に読みようがない。`valob` / `valobe` は読み方が確定せず、口頭で伝えにくかった

**既知の弱点:**

- 検索エンジンが `valueOf` に自動変換する。「検索結果を絞りますか？」を押せば回避できる範囲と判断
- `valor`（npm で取得済み）とタイポ隣接。1 文字違いなので警告なく別パッケージが入る
- 命名の重心は `Val.companion` にあるが、`valof` は `Val.of` 由来。「value of」という一般概念の表現と解釈すれば整合する

**商標調査**（web 検索ベース、正式なクリアランスではない）:

- 「VALOF」の完全一致は見つからず
- 近接: **VALOFE Co., Ltd.**（韓国のゲーム開発・パブリッシャー、ソウル、従業員 364 名、2007 年設立。米国で VFUN を 2019 年に出願・登録、`forums.valofe.com` を運用）。1 文字違いかつソフトウェア分野なので区分が接触しうる
- 需要者層が全く異なり、**無償 OSS は商業的使用に当たりにくい**ため実務リスクは低いと判断
- その他の近接語（VALOU=宝飾、VALOIE=化粧品、VALO=ゲームコントローラ、VALUT=ウォッカ、VALFLEUR=ワイン）はすべて無関係な区分
- **商用化・法人化する場合は再検討が必要**

**却下した候補:** `valob` / `valobe`（読み方が不定）、`valcase`（分かりやすいが語感が弱い）、`valeur`（フランス語の一般語で検索性が悪い）、`valcom`（語感）、スコープ付き `@user/val`（発見されにくい）

### 12.2 型名: `Val`

**維持する。** 短く、`Val<"User", {...}>` の型宣言がノイズにならない。型と名前空間を兼ねる設計（`Val` 型 + `Val.of` / `Val.companion`）も TS 的に正しい。

「Kotlin/Scala の `val` は束縛の不変性（TS の `const` 相当）であって値の不変性ではないので、アナロジーがずれる」という懸念は却下した。TS プログラマにとって `const` が再代入不可を表すことは常識であり、混同する余地は小さい。仮に混同しても「`const` があるのになぜライブラリが必要なのか」で立ち止まるため、誤解は README の冒頭で自己解決する。注記を書く方が、不要な懸念を読者に植え付ける。

既知の弱点として、`Val` は 3 文字の一般語なのでローカル識別子と衝突しやすい。`_`（lodash）や `z`（zod）ほどの知名度が出るまでは、`import { Val as V }` で回避してもらう場面があり得る。

**却下した候補:** `Value`（正確だが長く、衝突はより深刻）、`Vo`（暗号的）、`Nominal`（値オブジェクト感が薄い）、`Data`（Effect と被る）

---

## 13. API 形状の決定（実装時）

`Val.sealer<V>().impl({...})` / `Val.companion<V>().impl({...})` に落ち着くまでの検討記録。すべて実際にコンパイルして確認した。

当時のスマートコンストラクタの名前は `from` で、`.impl` のキーとして渡していた。以下はその時点の綴りのまま残してある。現在は `.implSeal` で登録する `seal`（§6.9）で、`.impl` に書くと型エラーになる（§6.5）。

### 13.1 なぜ 2 段呼び出しなのか: 型引数の部分推論

Val 型 `V` は明示する必要があり（値から推論できない）、メソッド群 `M` は推論させたい。だが **TypeScript は型引数を部分的に推論しない**。ひとつでも明示すると残りは推論されずデフォルトに落ちる（[microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242)、`_` プレースホルダ提案、2018 年から未実装）。

したがって `Val.companion<User>({ ... })` は**書けない**。カリー化するしかない。

### 13.2 却下: `M` を第 2 型引数にする

```ts
function companion<V extends AnyVal, M extends CompanionMethods<V> = Record<never, never>>(
  methods: M,
): Companion<V, M>;
```

`M` にデフォルトを付けると**コンパイルは通るが静かに壊れる**。`companion<Age>({ from })` で `M = Record<never, never>` に落ち、

- ユーザーのメソッドが companion から消える（`A.greet` が存在しない）
- `with` / `update` が `ReturnType<typeof from>` を返さなくなる
- 当時のゲート（§6.1）が無効化され、`A(30)` が**エラーなしで通る**

デフォルトを付けなければ `Expected 2 type arguments, but got 1` になり、`Val.companion<User, typeof methods>(methods)` と `const` を別に切って `typeof` する必要がある。空の `()` より冗長。

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

1 回の呼び出しで両方推論でき、実際に動く。`[__token]` は optional にすると推論が弱くなるので非 optional のファントムにし、キャストは `type()` の中 1 箇所に閉じ込める。

却下理由は費用対効果。空の `()` が消える代わりに、公開型 `TypeToken` と関数 `Val.type` と実行時オブジェクトが増える。カリー化は zustand の `create<T>()(...)` などで TS 利用者に既知のイディオムなので、見慣れない概念を足すより良い。

### 13.4 却下: sealer を引数に渡して `V` を推論させる

トークンの代わりに sealer 自体を渡す案。sealer は `from` の中でどうせ使う実在の値なので、ファントムを増やさずに `V` と `M` の両方を推論できる（動作確認済み）。

```ts
const seal = Val.sealer<Age>();
export const Age = Val.companion(seal, { from });
```

却下理由は**行数**。`Val.of<Age>(n)` が同じ持ち上げをやるので、private な sealer は本来不要。この形は `V` を固定するためだけに `const seal = ...` の 1 行を強制する。空の `()` のほうが安い。

### 13.5 却下: 第 1 呼び出しに引数を渡す

`Val.companion<V>(???)({ ... })` の `???` に置ける引数は**型が `V` から完全に決まるものだけ**。第 1 呼び出しにはすでに明示的な `V` があるので、それ自体に推論が必要な引数は §13.1 とまったく同じ壁に当たる。

```ts
declare function companion<V extends AnyVal, R = never>(from: (value: SeedOf<V>) => R): …;

companion<Age>((n: number): Result<Age> => …);
// TS2345: Argument of type '(n: number) => Result<Age>' is not assignable
//         to parameter of type '(value: number) => never'   ← R が default のまま
```

`from` を移すと `R` が落ち、`Age.from` の型も `with` の戻り値型も失われる（§6.3 の「ライブラリは Result の中身を知らずに型だけ通す」が壊れる）。`from` が第 2 呼び出しのオブジェクトに居るのは、そこには明示的型引数が一切なく、`M` も `R` も自由に推論できるから。

3 段カリー化 `Val.companion<Age>()(from)({ ... })` なら通るが、`()()` より悪い。

### 13.6 却下: Rust 風のビルダー

```ts
Val.builder<Age>().from(fn).impl({ label }).build();
```

各ステップが独立した呼び出しになるので `from` の返り値型もその場で推論でき、`build(): "from" extends keyof M ? Companion<V, M> : Sealed<V, M>` で呼べるかどうかも表現できる。コンパイルも通った。

却下理由:

- 全ケースで長くなる（`Val.sealer<Tags>()` → `Val.builder<Tags>().build()`）
- `.build()` が純粋な儀式。しかも省けない。各ステップが companion を兼ねると `Age.from(30)` がビルダーのステップと衝突するため終端が要る
- そもそも Rust にビルダーがあるのは名前付き引数・省略可能引数がないから。TS ではその役割をオブジェクトリテラルが担っており、`.impl({ from, equals, ...fns })` は**すでに TS 流のビルダー**になっている

### 13.7 採用: `sealer` / `companion` + `.impl()`

- **`sealer`**: `-er` を付けたのは `Val.of` と読み違えられないため。値ではなく関数を返すことが名前から分かる
- **`.impl()`**: 当初は `.companion()`（sealer 側）と `()({...})`（companion 側）で付与手段が 2 つに割れており、違いは「呼べるか否か」だけで分かりにくかった。`.impl()` に統一したことで、差が `sealer` か `companion` かという**意味のある軸だけ**に寄った。`methods` は class を連想させるので不採用（値にメソッドは生えない）。`fns` は中身が全部関数なので同語反復。Rust の `impl` ブロックとも一致する

素の `Val.sealer<V>()` / `Val.companion<V>()` も既定の振る舞い（`equals` / `with` / `update`）を持つ完全な companion にしてある。メソッドのない Val が `.impl({})` を書かずに済む。

### 13.8 副次的な決定

- **`-0` と `0` を等価とする。** `JSON.stringify(-0)` は `"0"` なので、往復すると区別が消える。§3.5 の `undefined` と同じ「2 経路の差異を観測不能にする」論法。実装は `a === b` で NaN だけ別扱いすれば済む
- **`exactOptionalPropertyTypes: true` を本リポジトリの `tsconfig.json` で有効化。** §3.5 で強く推奨した以上、自分で従う。必須キーへの `undefined` を弾くテストはこれがないと通らない

---

## 14. valof-lint

2026-09-03 に調査、`feat/valof-lint` ブランチで実装。2026-09-06 時点で `main` 未マージ。

`.impl({...})` の中の関数は、dead と報告されることもバンドルから落ちることもない。`attach` が実行時に `Object.defineProperty` で companion に載せるので、静的解析からは「関数に渡されたオブジェクトリテラル」にしか見えない。

推測ではなく実測:

- **knip 6.34.0** は素の未使用 `export function` を報告するが、その隣にある未使用の companion 関数には何も言わない。`--exports` ショートカットも、他のどの issue type も検出しない
- **vite/rolldown** は未使用の export された関数をバンドルから落とし、companion のほうは残す

### 14.1 なぜ独立したスクリプトなのか

- **knip プラグインでは書けない。** `IssueType = keyof Issues` であり、`Issues` は core 側の固定レコード（files, dependencies, exports, types, enumMembers, namespaceMembers, cycles, ...）。「export されたオブジェクトのメンバ」というカテゴリは存在せず、プラグインから追加もできない。プラグインのフック（`resolveFromAST`, `registerVisitors`, ...）が返せるのは `Input[]` だけで、使用済みとして足すことはできても未使用を報告することはできない
- **lint でも書けない。** ESLint も oxlint もファイル単位で、ルールは 1 ファイルの AST を見てその中に報告を紐付ける。`import/no-unused-modules` のようなクロスファイルのルールは自前でプロジェクトを走査しており、lint のモデルの外にいる。oxlint は並列に走るので、カスタム JS プラグインでファイルをまたいで状態を貯めても信用できない。ast-grep の `sg scan` ルールも同じ理由で不可

companion のメンバは `Companion.member` の形でしか到達されない。各 `.impl({...})` のトップレベルキーを集めて、プロジェクト全体で `Name.key` を数えれば足りる。

### 14.2 パーサ: `@ast-grep/napi` ではなく `oxc-parser`

両方プロトタイプを作り、結果は一致した。400 ファイルのコーパスで、oxc はインストール 3.2 MB で 21 ms、ast-grep は 7.2 MB で 76 ms。oxc のほうが 33 行多い。ast-grep のパターン DSL（`const $N = $B.impl($OBJ)`）を手書きの ESTree walk で置き換えるためだが、`oxc-parser` は `visitorKeys` を export しているので汎用の降下は 10 行で済む。oxlint / oxfmt / Rolldown と系譜も共通する。決め手は、optional な peer dependency がこれを動かすために利用者が払う唯一のコストだということ。DSL より、それを半分にするほうが勝つ。

最初のプロトタイプはテキストベースで、`User["greet"]`、リネームした import、分割代入、ネストした `.impl` を取りこぼした。今も届かないのは名前解決が追えないもの: `export { X as Y }` の連鎖、`import * as ns`、computed key、`.impl({...base})` へのスプレッド。

### 14.3 valof に同梱する

2026-09-04 にテスト用パッケージを pack してインストールし検証した。`bin` エントリと、_optional_ な `peerDependencies` としての `oxc-parser` は、欲しくない利用者に何のコストも課さない。利用者側の `node_modules` を実測すると、valof だけなら 36 KB（パーサは引かれず、インストール警告も出ず、bin はインストールを促して exit 2）、opt-in すると 7.3 MB。`dependencies` は空のままなので、実行時依存ゼロと 1 kB 未満の主張は保たれる。`scripts/size.ts` がバンドルするのは `./dist/index.mjs` だけで、隣にある `dist/lint-cli.mjs` はそこから到達できない。

他の 2 案より優れている。README のレシピにはテストもバージョンもなく、別パッケージはリリース面が増える。valof 内の bin なら既存のリリースワークフローに乗り、ここでテストできる。

### 14.4 ルール

2 つ。どちらも構文で判定する。

- 誰も読まない companion のメンバ
- 複数の**トップレベル**型エイリアスが主張しているブランド文字列

トップレベル限定であることが効く。この制限がないと、このリポジトリ自身のテストで `describe` や `test` の中にスコープされたフィクスチャから 30 件の衝突が報告される。

このリポジトリの `src` は companion を使っていない。`src` + `tests` に検出器をかけると companion 宣言 14、メンバ 15、dead はゼロで、dead メンバのルールはここでは絶対に発火しない。対象は valof の_利用者_である。

### 14.5 却下: ts-morph、2026-09-04

両方のチェックを ts-morph で書き直すと、現在の 252 行に対してコメントを除いて 50 行になる。`findReferencesAsNodes()` が読み取り追跡のパス全体を置き換え、`getType().getAliasSymbol()` が名前ベースのルート判定の代わりに companion を `Sealer` / `Sealed` / `CompanionBuilder` として識別する。コストはインストール 3.2 MB に対して 15 MB、2 ファイルで 0.06 秒に対して 0.31 秒。

**ts-morph は TypeScript 7 を使っていない。** `@ts-morph/common` に `typescript` への依存はなく、自前のコンパイラを同梱している（15 MB のうち 12 MB）。つまり TS 7.1 の API を待つことは、TypeScript のリリースではなく ts-morph の移植を待つことになる。`typescript@7.0.2` が export するのは `default`、`module.exports`、`version`、`versionMajorMinor` の 4 つだけ。

コストを正当化するために型ベースのルールを 2 つ試作し、どちらも却下した。

- **ブランド重複の判定を payload の代入可能性で絞るのは誤り。** 構造的部分型があるので「payload が違う」は「分離されている」を意味しない。`Val<"Id", {a: string; b: number}>` は `Val<"Id", {a: string}>` に代入できる（検証済み）。双方向の `isAssignableTo` 判定は、まさにその漏れを見逃す方向に働く。このライブラリは公称型を強制するために存在するので、ブランドの衝突は payload が何であれ欠陥である
- **カスタム `equals` を持つ子を親が構造比較していることの検出は、厳しすぎて使えない。** 動作はする（ローカルの型エイリアス、配列、2 ファイルにまたがる場合で検証し、オーバーライドのない子では黙る）。だがオーバーライドが伝播しないのは設計そのもの（§5、§7.6）なので、対処のしようがないまま N×M 回発火する。再検討するならオーバーライドの定義箇所で一度だけ報告し、どこにネストされているかを列挙する形にする。それは「正規形で構築する」レシピを指すことになる

`equals` を_誰がオーバーライドしたか_の検出は、どちらの方式でも構文の話になる。`Companion<V, M>` はオーバーライドの有無にかかわらず `equals` を `(a, b) => boolean` と型付けするため。

### 14.6 名前空間自身のバンドルサイズ

`Val` 自身が companion なので、§14 の盲点はこのライブラリの表面にも及ぶ。`Val.of` だけを呼ぶモジュールは 6,791 B になり、`sealer`、`companion`、`unwrap`、`attach`、`deepEquals` がすべて残る。`of` を名前付き export にした場合は 1,538 B。`import type` だけなら 226 B。

名前空間を名前付き export に分割する案は 2026-09-03 に検討して却下した。利用者の companion には効かず、API が二重化し、ブランドだけが欲しいライブラリなら数行で自作できる。

---

## 15. v2 候補

### 15.1 `Val.trait`

2026-09-03 に提起。v1 ではなく v2 向け。

**欠けているもの。** companion の関数は自分の Val に固定されるので、`SuperUser` が `PayloadOf<User>` から作られていても `User.greet(superUser)` は弾かれる。2 つの Val が共有する振る舞いは、構造的な型に対する普通の export 関数にするしかない。それで動くが、valof の中で companion の形の居場所を持たない唯一のものになる。

実測: 第 1 引数を広く注釈すると `.impl` の中でも型チェックは_通る_（`greet(u: Named)` はパラメータの反変性により `(value: User) => unknown` に代入できる）。`User.greet(superUser)` もコンパイルできる。ただしパターンとしては却下した。ある型の companion を通して別の型を操作することになり、文脈型付けも失われる。

**スケッチ。** `Val.trait<Shape>().impl({...})`。第 1 引数に文脈型付けを与え、関数をまとめる名前空間になる。

作る前に決めること:

- `equals` / `with` / `update` を持たせてはならない。ブランドも seal もない以上、作り直す対象が存在しない。既定を足さない `attach` の変種が要る
- Shape には `DeepReadonly` を適用する必要がある。さもないと配列フィールドを持つ Val が一致しなくなる
- 「trait」は型ごとの実装を含意するが、これは構造的制約に対する単一の実装になる。名前がディスパッチを約束してしまう可能性がある
- 本当の基準は §6.7 のもの。`Sealer` に `.implCreate` がないのは、callable なコンストラクタの隣では `create` が「何も絞らない」から。`Val.trait` も同じ試験を通らなければならず、引数の注釈とグルーピングだけでは API に値する保証にならないかもしれない
