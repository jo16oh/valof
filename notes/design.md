# valof 設計メモ

TypeScript 向け値オブジェクトライブラリの設計記録。

- **パッケージ名**: `valof`
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
  - **6.1** コンストラクタは出自で決まる / **6.2** `patch` / `update`、patch の `undefined`、深さを問わない patch / **6.3** Result 非依存 / **6.4** `update` は値→値
  - **6.5** `.impl` の第一引数を Val に固定する contextual typing / **6.6** `patch` / `update` を上書きさせない
  - **6.7** seal（冪等）と create（鋳造）の分離 / **6.8** seal を唯一の関門にする。経路ごとのコピー回数
  - **6.9** 名前が `seal` になるまで / **6.10** `fixed` と余剰プロパティ検査
- **§7 見送ったもの** freeze（dev のみ採用）、Map/Set、Date/Temporal、TaggedEnum、Result、equals のディスパッチ、配線対象を `.impl` に置くこと
- **§8 慣用パターン** Record での Set/Map、日付、スキーマライブラリ併用、更新経路から外すフィールド
- **§9 未解決 / 要確認** 次の作業はここ
- **§10 v1 のスコープ** 10.1 サポートする TypeScript（各ラインの最終版以降）
- **§12 命名** パッケージ名 `valof`、型名 `Val`、商標調査
- **§13 API 形状の決定** 2 段カリー化に至るまでの却下案 6 つ
- **§14 valof-lint** companion のメンバが静的解析から見えない問題。パーサ選定、同梱の判断、却下した ts-morph（§14.5）、カスタム equals を持つ子の規則（§14.7）、ルールの表現と構成（§14.8）、エディタ統合（§14.9、overlay まで実装）、テストの穴（§14.10）、テストの置き場所（§14.11）、型名と一致しないブランド（§14.12）、`Val` の綴り（§14.13）、欠けている disable コメント（§14.14）、効いていない disable コメント（§14.15）、ファイル全体の disable（§14.16）、`--no-` を受けない規則（§14.17）、指示についての規則の見せ方（§14.18）、oxlint の版と設定の正本（§14.19）
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
- 衝突は同名の文字列同士のみ。**ブランドは型名と同じにする**（valof-lint が検査する、§14.12）。同じ名前が二か所に要るとき、monorepo の `Id` のような場合だけ `"billing/Id"` と名前空間を付ける

symbol / 文字列を利用者に選ばせる案は却下。API 表面が増えるだけで、上のハイブリッドが両方の利点を持つ。

#### なぜ `unique symbol` をやめたか

当初はキーを非公開の `unique symbol` にしていた。**valof を使うライブラリが `declaration: true` でビルドできない**という致命傷があった。

```
error TS4023: Exported variable 'User' has or is using name '__brand'
from external module ".../valof/dist/index" but cannot be named.
```

`export const User = Val.sealer<User>().impl({...})` を再エクスポートするという、まさに想定される使い方で発生する。symbol を `export` しても直らない。TypeScript は宣言を出力するファイルで名前がスコープに入っていることを要求するので、利用者が `import { __brand, __payload }` を書く羽目になる。

ブランドはどのみち実行時に存在しないので、衝突耐性は symbol であること自体ではなく**名前の長さ**で買える。`__valof_internal_phantom_` 接頭辞を実際のプロパティ名に使う者はいない。`phantom` を名前に入れているのは、ホバーやエラーメッセージでこのキーに出くわした人が実行時に探しに行かないようにするため。

代償として文字列キーは `keyof Val<...>` に現れる。ペイロードのキーだけが欲しい場面では `PayloadOf<V>` / `SeedOf<V>` を使う（`patch` / `update` は元からこちらを経由する）。

### 型名の規約

`-Of` は「Val から射影して取り出したもの」を意味する。`PayloadOf<V>` / `SeedOf<V>` は Val を受け取る。`Patch<T>` はペイロード型を受け取るので接尾辞を持たない。この違いは意図的で、カスタム `patch` がフィールドの部分集合に対する patch を受け取れるのはこのためである（生成された `id` を patch 対象から外す用途）。

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
4. `patch` は patch の `undefined` キーを削除として解釈し、マージ後に落とす（§6.2）
5. **デフォルト deep equals で、値が `undefined` のキーを無視する**（§5）

5 が効く。`{ a: undefined }` と `{}` が等価なら、2 つのシリアライズ経路の食い違いが**観測できなくなる**。実行時コストはほぼゼロで、キー順非依存にする実装のついでに書ける。

型で大半を防ぎ、残りは equals で無害化する。EOPT を必須にして型で完全に閉じるより、導入コストと保証のバランスが良い。

#### interop の摩擦

`undefined` は TS のあちこちから湧く（`Array.prototype.find`、`Map.get`、`noUncheckedIndexedAccess` 有効時の添字アクセス、OpenAPI/GraphQL のコード生成、フォームライブラリ、分割代入のデフォルト値）。seal に渡す前に `?? null` を挟む場面が増える。

そこは**スマートコンストラクタで正規化すべき場所そのもの**であり、§5 の「正規形で構築する」原則と一貫している。「境界で正規化しろ」というメッセージとして README に書く。

#### 副次的な利点

`undefined` が値として存在し得ないため、`patch` の patch における `undefined` を**削除の sentinel として使える**（§6.2）。

```ts
User.patch(user, { nickname: undefined }); // nickname を削除
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

これは「利用者の責任」で済ませられない。`as` も何も要らず、素直なコードが黙って壊れる。値オブジェクトが背後で変わり得るなら、それは値オブジェクトではない。よって `Val.of` / sealer / `.impl()` のコンストラクタ、および既定の seal を通る `patch` / `update` / `create` は引数をディープコピーする。

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

テストは 7 件。`patch` / `update` が触っていない部分木を保つ、patch 由来のノードは採用せず必ずコピーする、`Val.unwrap` は何も共有しない、unwrap した payload は再 seal しても採用されない、`equals` の答えは変わらない。

**バンドルサイズ: 所有権追跡は production gzip で +48 B。** `implEquals` の spec（§5）は当時の 1 kB 予算に収まらず、1.25 kB に引き上げた。この予算は妥協の結果で、削る案は §5 で却下した。React 単体が gzip 45 kB である以上、1.25 kB がフロントエンドでの採用をためらわせることはない。

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

**唯一の大勝ち（`o[MARK]=true`、印 6.6 ns）は不健全。** enumerable な symbol はスプレッドで複製されるので、`patch` の `{...value, ...patch}` に印が乗り、コピーが丸ごとスキップされて patch 由来の外部オブジェクトが値に埋まる。§4.1 が防いでいるエイリアシングそのもの。`patch` 側で `delete` しても、利用者が `{...user}` した瞬間に素のオブジェクトへ印が漏れる。non-enumerable 一択で、それは 69.5 ns の経路。

速度以外でも WeakSet が有利。

- **偽造できない。** 内部 `Symbol()` なら symbol も同様だが、デュアルパッケージや複数レルムで印が共有されない。共有したければ `Symbol.for` になり、その瞬間に誰でも `obj[Symbol.for("valof.owned")] = true` と書けて、可変オブジェクトを値に埋め込める
- **値に余分な状態が乗らない。** symbol は `Object.getOwnPropertySymbols` に出る
- 取りこぼしの向きは同じ。どちらも JSON / `structuredClone` を越えると印を失い、コピーに縮退する

内部実装なので、必要になれば後から非破壊で差し替えられる。

#### 何も変わらない `patch` は値そのものを返す

共有を入れても、no-op な `patch` は新しい root を作るので identity が変わり、再レンダリングが走る。`patch` は既に merged payload のキーを 1 周しているので、そのループに identity 比較を相乗りさせた。Immer の `produce` と同じ挙動。

- 拾う: `patch(v, { name: 同じ値 })`、`patch(v, {})`、値が持たないキーの削除、`update(v, (x) => x)`
- 拾わない: 同値だが新しい子 Val を渡した場合。**コンストラクタを通した以上、新しいインスタンスになるのが JS として自然**なので、これは仕様
- 拾わない: `update` で spread した場合。新しいオブジェクトが同値かの判定は `patch` の仕事で、そこでしか走査が既に払われていない
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
3. **更新が 1 回でも入れば全部ひっくり返る。** 概算の損益分岐は 2 回目の `patch`

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

`unwrap` は外部に渡すための出口であって、値の派生に使うものではない。`SeedOf<V>` が Val をそのまま受けるので `Val.of` / `patch` は 1 回のコピーで済むが、`unwrap` を経由すると 2 回になる（92 → 184 ns/op、ネスト約 8 ノード）。

`unwrap` を単体 export にしなかった理由。単体ならバンドラが落とせるが、その 44 B のために `unwrap` というありふれた名前をトップレベルに置くと `Result` 系ライブラリと衝突する。`Val.of` の逆操作であることも名前空間側に置く根拠になる。

### ベンチマーク

DeepReadonly・ブランド・コンパニオンのオーバーロード判定はすべて条件型なので、型チェック速度を計測した。フィールド 30 個 × ネスト 3 段 × 200 型（18,000 プロパティ）を `tsc --extendedDiagnostics` で見る。

| 変種                                               | Types  | Instantiations | Check (TS 7.0.2) | Check (TS 5.9.3) |
| -------------------------------------------------- | ------ | -------------- | ---------------- | ---------------- |
| 素の `interface`（ライブラリなし）                 | 3,979  | 0              | 0.036s           | 0.09s            |
| `Val<K, T>` 型 + `Val.of` のみ                     | 46,744 | 765,435        | 0.207s           | 0.54s            |
| + `sealer().impl` と `patch` / `update` / `equals` | 88,145 | 943,921        | 0.285s           | 0.71s            |

型 1 個あたり約 4,700 instantiations、チェック時間 1.4ms（TS 7）。素の `interface` に対して絶対値では 8 倍だが、200 型を丸ごと 1 ファイルで型付けして 0.3 秒に収まる。

型数に対して線形で、条件型の展開が組合せ爆発する箇所はない（フル変種の Check time は 50 型 0.065s / 100 型 0.137s / 200 型 0.285s / 400 型 0.601s、instantiations も同じ傾きで 237K / 473K / 944K / 1,886K）。

上表の 2.5 倍という差は TS 7 に最も不利な測り方（200 型を 1 ファイル）で出たもので、TS 7 の速さの多くを占めるファイル単位の並列チェックが効かない。同じ 200 型を 1 型 1 ファイルに分けると差は 7 倍以上に開く。

| フル変種の並べ方         | Check (TS 7.0.2) | Check (TS 5.9.3) |
| ------------------------ | ---------------- | ---------------- |
| 1 ファイル（200 型）     | 0.285s           | 0.71s            |
| 200 ファイル（1 型ずつ） | 0.094s           | 0.70s            |

裏を返せば、巨大な 1 ファイルに型を集約すると TS 7 の利点をほぼ捨てることになる。

いずれの並べ方でも **instantiations は両コンパイラでほぼ同一**（943,921 / 943,425）なので、回帰の監視は時間ではなくこちらを見る。

deep patch（§6.2）を入れたあとに測り直した。同じ 200 型 × 30 フィールド × 3 段で、`patch` の呼び出しだけを変える。

| 変種                        | Types   | Instantiations | Check (TS 7.0.2) |
| --------------------------- | ------- | -------------- | ---------------- |
| deep patch 前、1 段の patch | 120,172 | 870,532        | 0.29s            |
| deep patch 後、1 段の patch | 120,281 | 870,851        | 0.28s            |
| deep patch 後、3 段の patch | 177,885 | 1,177,941      | 0.40s            |

**再帰する型を置くこと自体はタダ**で、増えるのは実際に深い patch を書いた箇所だけ（+35% instantiations）。呼び出しの深さに比例し、型数に対しては線形のまま（3 段の patch で 50 型 307K / 100 型 577K / 200 型 1,117K / 400 型 2,198K）。

DeepReadonly をオプトインにする案は不要と判断する。コストの大半は `Val` 型の定義側（コンパニオンなしで既に 765K instantiations）にあり、`patch` / `update` / `equals` のオーバーロード判定が上乗せするのは 23% にすぎない。

### 4.2 タプルを保つ

かつてタプルの payload は `DeepReadonly` で潰れていた。`ReadonlyArray<infer E>` がタプルも受けて `ReadonlyArray<DeepReadonly<E>>` に均すためで、`SeedOf` もその上に乗るので、そこから導く API（`patch` の patch、§5 の `implEquals` の spec）では位置ごとの扱いが書けなかった。

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

`toEq` を別に置くと、配列とオブジェクトの走査が `deepEquals` と二重になる。spec を第 3 引数に取る 1 本の再帰にすれば重複が消えて、`deepEquals(a, b)` は `eq(a, b, undefined)` になる。**production gzip -116 B。実装して測って戻した。**

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

予算はもともと逼迫していないので、この 116 B に急ぐ理由がない。

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

### 6.2 `patch` / `update`

**自由関数版 `Val.patch` は提供しない。** 実行時に型を特定できず、その型の seal にディスパッチできない。companion のメソッドとして提供する。

```ts
User.patch(user, patch);
// 内部的には seal({ ...user, ...patch }) をそのまま返す
```

- カスタム seal が未定義 → 既定の seal（コピー）を通るので戻り値は `User`
- カスタム seal が定義済み → 戻り値は `ReturnType<typeof seal>`

これで「`patch` がスマートコンストラクタを迂回する」穴が塞がる。値を作る経路はすべて seal を通る、という §6.8 の不変条件の一部である。

#### プリミティブ・配列の Val には `patch` を生やさない

`Patch<T>` はオブジェクト以外に対して `never` を返す。当初はそれをそのまま流していたので、`Val<"IsoDate", string>` の companion にも `patch` が生え、**引数が `never` で呼べないのに補完に出る**状態だった。実行時にも `TypeError` を投げるだけで、型が先に止められるはずのものを実行時に持ち越していた。

`patch` を条件付きのプロパティにして、パッチする対象がないときは型から丸ごと消す。

```ts
type PatchMethod<V, M> = [Patch<SeedOf<V>>] extends [never]
  ? Record<never, never>
  : { patch: ... };
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

`patch(u, { nickname: form.nickname })` で `form.nickname` がたまたま `undefined` だったときの意図しない削除を、多層で防ぐ。

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
User.patch(u, { profile: { name: "x" } }); // 型エラー: age が無い
User.patch(u, { profile: { ...u.profile, name: "x" } }); // これを毎回書く
```

React の state 更新はこれが日常なので、interop の看板を掲げる以上ここは塞ぐ。`Patch` を再帰させ、`patch` を deep merge にした。

```ts
type PatchValue<T> = [Patch<T>] extends [never] ? T : Patch<T>;
```

**patch できる対象がない型（Val・配列・プリミティブ）は丸ごと差し替え。** optional / required の分岐は再帰でそのまま各段に効くので、誤削除への防御も余剰プロパティ検査も深い位置で同じように働く。追加の細工は要らなかった。

**Val で再帰を止めるのは §6.8 の帰結。** patch がネストした値の中まで届くと、その値の seal が一度も見ていない payload ができる。外側の `patch` は外側しか seal しない。

書く側が失うものはない。ネストした値はその型自身の `patch` で導出すればよく、そちらは自分の seal を通り、触っていない部分木の参照も保つ。

```ts
Shop.patch(shop, { city: City.patch(shop.city, { name: "Osaka" }) });
```

外側から見ると「コンストラクタが作ったノード」なので、§6.2 の owned 規則で差し替えになる。深い patch と同じ結果に、seal を 1 つも飛ばさずに着く。

#### 実行時の境界は `owned`

ブランドはファントムなので、実行時に「これは Val だ」とは読めない。読めるのはノードの出自だけで、それは §4.1 のコピーで既に記録している。

**owned なノードは patch ではなく値なので、merge せず差し替える。** 型側の「Val で止める」の実行時対応物であり、`{ owner: other.owner }` のように既存の部分木を渡す場合も同じ規則で差し替えになる。意図と一致する。

記録を失った payload（`structuredClone` や JSON 往復を越えたもの）では、ネストした値が merge に落ちる。壊れ方は「差し替えたつもりが optional キーの消し残りが出る」だけで、正しさの他の部分は保たれる。渡す前に seal し直すのが正しい対処。

#### 代償: ネストしたオブジェクトを縮められない

merge が既定になると、キーの少ないオブジェクトで置き換えられなくなる。§8 の Record-as-Map が一番刺さる。

```ts
Shop.patch(shop, { staff: computed }); // 古いエントリが残る
Shop.update(shop, (s) => ({ ...s, staff: computed })); // 置換はこちら
```

新しい API は足さない。既存の 2 経路が意味で割れるだけである。

- `patch` = patch。プレーンなオブジェクトを下まで merge、`undefined` で削除
- `update` = 置換。payload 丸ごとを返す

`{ staff: { u1: undefined } }` で 1 エントリだけ消せるので、Map 用途は以前より書きやすくなった。

#### 名前が `patch` になるまで

`with` から改名した。0.4.0 の破壊的変更。

`Array.prototype.with`（ES2023）と Records & Tuples 提案が同じ意味で `with` を使うので、JS の語彙としては `with` が正解に見えた。**それが読めるのはレシーバがあるときだけだった。**

```ts
arr.with(0, 9); // 「arr の、0 番目を 9 にしたもの」
Order.with(order, {}); // 前置詞の主語が引数に落ちて宙に浮く
```

§1 で振る舞いを値の外に置くと決めた以上、companion の第一引数は値になる。メソッド形式の語をそのまま持ってこられない。

`patch` は命令形なので `equals` / `create` / `seal` / `of` / `unwrap` と register が揃い、引数の型 `Patch<T>` と名前が一致する。関数が `with` で引数の型が `Patch` というずれが消えた。

**語が部分更新を意味するのも上乗せ。** HTTP `PATCH` / JSON Merge Patch（RFC 7386）/ `git patch` はどれも「全体を送らず差分を当てる」で、深い merge という実装とも一致する。`with` は部分か全体かを何も言わなかった。ずれるのは削除の sentinel だけで、merge patch は `null`、valof は `undefined`（§3.5）。

`update` は据え置き。Immutable.js の `update` / `updateIn` と同じ語で、変換関数を取る側にはこれ以上の候補がない。

#### 却下: 過去形にする（`patched` / `updated`）

不変であることを名前で示す案。`update` に可変の響きがある、というのが動機だった。

- **可変の響きは companion 形式では出ない。** `user.update(...)` ならレシーバが変わって見えるが、`User.update(user, fn)` の `user` は引数で、変わり得る対象が文面にない。`Object.keys(x)` が `x` を変えると読む者はいない
- **過去形が効くのは可変の双子がいるときだけ。** Python / Swift の `sorted()` は `sort()` と並ぶから意味を持つ。valof に双子はいないので、「どこかに可変版があるのか」と読ませるだけになる。Scala の case class も過去形ではなく `copy()`
- **「`patched` = 部分更新 / `updated` = 置き換え」という対比が成立しない。** 過去形は部分か全体かを何も言わない。実際の軸は「patch オブジェクトを取るか、変換関数を取るか」で、しかも `fixed`（§6.10）を使う型では `update` も merge する。「置き換え」は事実としても正しくない
- 8 個のメンバのうち 2 個だけ過去分詞になり、register が崩れる

命令形にする（`patch`）だけで、動機だった読みにくさは消える。

#### 却下した案

- **patch の値に updater 関数を許す**（`{ profile: (p) => ... }`）。1 段しか砂糖が効かず、同じ操作に 2 通りの書き方ができる
- **パス指定 API**（`patch(u, "profile.name", x)`）。template literal 型が型チェック速度と d.ts 予算を食い、API も増える。v2 候補
- **現状維持**。`update` と spread で書けるが、それなら `patch` が存在する意味が薄い

#### コスト

production gzip +43 B、d.ts +0.52 kB。`patch` の既存ループがそのまま再帰関数 `patched` になるので、純増が小さい。

`patched` は各段で「何も変わらなければ元のノードを返す」ので、参照同一性は以前より細かく保たれる。

### 6.3 Result 型は提供しない

すでに neverthrow / Effect / fp-ts があるため、このライブラリでは提供しない。

**提供しなくても `patch` は実装できる。** `patch` は seal の戻り値を unwrap する必要がない（古い値は既に妥当なので、マージして seal に流すだけ）。戻り値の型を `ReturnType<typeof seal>` として推論すればよく、ライブラリは `Result` の中身を一切知らずに済む。どの Result 実装でも自作でも動く。

### 6.4 `update` は「値 → 値」に限定する

関数で変換する `update` は、チェーンすると `Result<Result<...>>` になりかねない。失敗し得る変換は `patch` + 利用者側の `andThen` に任せる。

### 6.5 メソッドの第一引数を Val に固定する（`impl` / `implSeal`）

`greet(u: User)` の `: User` は、全 companion の全メソッドに書く定型だった。`impl` の index signature を Val 始まりの**単一の関数型**にすると contextual typing が効き、注釈が不要になる。

```ts
type CompanionFns<V extends AnyVal> = {
  equals?: never;
  patch?: never;
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

さらに、**`M` にデフォルト型引数を与えるだけで contextual typing が死ぬ**。`impl: <M extends CompanionFns<V> = Record<never, never>>(fns?: M) => …` だと TS は制約を contextual type に使わなくなり、全メソッドの第一引数が implicit any に落ちる。引数なしの `.impl()` はオーバーロードで残した。

```ts
impl: {
  (): Sealed<V, Record<never, never>>;
  <M extends CompanionFns<V>>(fns: M): Sealed<V, M>;
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

プリミティブ payload では `V` が第一引数の型に代入可能になることがある（`Val<"Age", number>` に対する `seal(n: number)`）。すると**関数が制約を通り、ただのメソッドとして生えて、`patch` / `update` が配線されない**（`create` なら**seal を通らない鋳造経路ができる**）という無言の事故になる。移行中に実際に踏んだ。`seal?: never` / `create?: never` を宣言して弾く。

メッセージを型に乗せる案（`seal?: "use .implSeal() …"`）も試したが、`never` を採った。エラー文の見た目は落ちる。optional 修飾子のせいで `never | undefined` になるため、TS は次のように言う。

```
Type '(n: number) => Age' is not assignable to type 'undefined'.
```

引数の型としてしか情報を置けない場所ならメッセージ埋め込みが要る。ここは `seal` というキー名自体が何をしようとしたかを示していて、`implSeal` は API のすぐ隣にある。型の意図（「ここに `seal` は置けない」）をそのまま書けるほうを取る。

`equals` / `patch` / `update` も同じ理由で `never` にした。事故の形は違って、こちらは**生えはするが配線が外れる**（`equals` の第 3 引数が来ない、`patch` の戻りが seal を通らない）。専用の段に出した経緯は §7.7。

#### sealer に `implSeal` は生やさない

**sealer は既定の seal そのもの**であり、その隣に検査つきの seal を並べれば、最初の seal が「迂回する穴」になる（§6.1）。`implSeal` は companion 専用。

#### `implSeal` は必須にしない

`Val.companion<V>().impl({…})` をカスタム seal なしで許すか。**許す。**

1. **必須にしても閉じる穴がない。** `Val.of` は公開 API で、seal の有無に関わらず `Val.of<Age>(-1)` は通る
2. **一貫性が取れない。** `Val.companion<V>()` は素の状態で既に使える Companion（`equals` / `patch` / `update` を持つ）。`.impl` だけ seal 必須にしても手前が空いている
3. **偽の seal を書かせる。** `(v) => Val.of<V>(v)` という素通しのラバースタンプが生える。検証しているように読めて何もしていない seal は、seal がないことより悪い

カスタム seal なし companion は意味のある形でもある。値が境界（デコーダ、DB 行、外部 API）から来る型では、コンストラクタを持たず振る舞いだけ束ね、構築は `Val.of` で行うのが正しい。

#### 失うもの

第一引数が Val でない補助ファクトリ（`Money.fromCents(n)` / `IsoDate.parse(s)`）は companion に置けない。これらは「値に対する振る舞い」ではないので、素の export 関数に分離されるほうが筋が通る。多引数のコンストラクタ（`Point.create(x, y)`）は `implCreate` が引き受けるので影響なし。

### 6.6 `patch` / `update` は上書きさせない

**語彙は契約である。** どの型でも `Foo.patch(v, p)` は「深く merge、`undefined` で削除、seal を通る」、`Foo.update(v, f)` は「変換の結果を seal に通す」。上書きできる限りこれは約束にならず、読み手は型ごとに定義を確かめることになる。固定した小さな面から得られるものが、そこで消える。

規則の違う派生は**自分の名前を持つ**。`.impl` に書き、中で自分の seal を呼ぶ。

```ts
const Money = Val.companion<Money>()
  .implSeal((m, seal) => seal({ ...m, amount: Math.round(m.amount) }))
  .impl({
    scale: (m, by: number): Money => Money.seal({ ...m, amount: m.amount * by }),
  });
```

戻り型の注釈が要る。`Money` を自身の初期化子の中で参照するので、無いと TS7022 / TS7023（implicitly has type 'any'）になる。TypeScript の一般的な事実であって valof の事情ではないので、README にも JSDoc にも書かない。

#### 却下: `implPatch` / `implUpdate`（一度入れて外した）

上書きの段を足したことがある。動機は 3 つあり、**すべて他の場所で解決していた**。

| 当時の動機                           | 現在                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 生成した `id` を更新経路から外す     | `.fixed`（§6.10）                                                                                          |
| seal の引数が payload より狭い       | `CheckedSeal` が `implSeal` の登録時に落とす（§6.10）                                                      |
| プリミティブ Val に `patch` を生やす | 患部が無い。merge するものを持たない型に `patch` は嘘。配列も §6.2 が「`update` が正しい経路」と書いている |

**「自前の派生から seal に届かない」も解決していた。** 当時は「`YourVal.seal(...)` は companion 自身の初期化中なので書けない」と判断して seal を第 3 引数で手渡したが、実際には**戻り型を注釈すれば `.impl` の中から呼べる**。実行時は関数の本体が走るのは初期化後なので元から動いていて、止めていたのは型推論の循環だけだった。カスタム seal が `Result` を返す型でも同じ。

README に載っていた `Point` の例（`implSeal` で切り捨て、`implPatch` で `seal({ ...p, ...patch })`）は**ラバースタンプだった**。落として実行すると既定の `patch` / `update` が同じ答えを返す。

```
default patch:  {"x":3,"y":2}   // 3.7 が seal で切り捨てられている
default update: {"x":1,"y":9}
```

§6.6 は「ラバースタンプを書かせない」ために足した段なのに、唯一の用例がそれだった。

外して消えたもの: 型引数 `W` / `U`（`Companion` / `Sealed` / `Sealer` / `CompanionBuilder` の 4 つを貫いていた）、`WithoutSeal<T>`、`DeriveImpl<V, F>`、`Ctors` の 2 フィールドと `attach` の 2 分岐。

**production gzip -40 B、d.ts -1.90 kB。** 型引数を 2 つ抜いた効果が d.ts に大きく出る。

`patch` / `update` は `CompanionFns` で `never` のまま。上書きできないことと、同名の関数を素通しで生やせることは別で、後者は既定を実行時に踏み潰す。

### 6.7 seal と create を分ける

既定の `patch` には型で塞げない穴が残っていた。「コンストラクタがペイロードを受け取れる」は**必要条件であって十分条件ではない**。

```ts
.implSeal((input: Fields): User => make({ id: crypto.randomUUID(), ...input }))
```

`SeedOf<User>`（`{id, name, email}`）は `Fields`（`{name, email}`）に代入可能なので `patch` は型検査を通る。しかし実際に走るのは `seal({ id, name, email })` で、この関数は渡された `id` を捨てて新しい `id` を振る。**型エラーなしに ID が毎回変わる。**

構造的にこれを弾くことはできない。「引数がペイロードそのもの」を要求すると `seal(input: object)` という zod の正当な形が消える。`object` も `Fields` も同じく `SeedOf<V>` の真の supertype で、区別がつかない。

#### 規約: seal は冪等（鋳造は `create` へ）

seal は「ペイロードに封をする」操作であり、**`seal(v のペイロード)` は `v` を返さなければならない**。ID 生成・時刻・連番のような鋳造はこの法則を破るので `create` に出す。登録も別ステップ。

| ステップ        | 制約                                                                            | 生えるもの |
| --------------- | ------------------------------------------------------------------------------- | ---------- |
| `implSeal(f)`   | `f: SealImpl<V>`（`(value: SeedOf<V>, ...rest: never[]) => unknown`）           | `seal`     |
| `implCreate(f)` | `f: Minter<V>`（`(...args: never[]) => SeedOf<V>`。引数は自由、戻りは payload） | `create`   |

1. **エラーが間違えた場所で出る。** 多引数コンストラクタは `implSeal` の**登録時**に落ちる。以前は 10 行下の `Point.patch(...)` で怒られていた。「自前の patch を書け」と説明する分岐は不要になり、削除した
2. **`create` と seal が共存できる。** DDD の create / reconstitute の分離そのもの。`create` がペイロードを鋳造し、seal がそれに封をし、`patch` は seal を通るので `create` が再実行されない。§6.6 で「自前の `patch` を書くしかない」と言った ID の例が、既定のまま正しく動く
3. **`create` だけでも `patch` / `update` は生える。** 既定の seal（コピー）もペイロード関数だからで、`create` が振った `id` はコピーされて保存される。`Rebuild` は分岐を失った

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

`patch` / `update` はペイロードを seal に返す（§6.8）ので、ワイヤ形式のデコーダを seal に置くと、値から値を派生した瞬間に壊れる。落ちるのは `unknown` と `{}` で、スキーマライブラリに要る広さは `object` と `Record<string, unknown>` で足りる。

ペイロード自体が `string` の Val（`Val<"Email", string>`）は除外する。ペイロードとワイヤ形式を型で区別する手段がない。

#### sealer には `create` を生やさない

sealer は callable なので `create` を足しても構築経路は 1 本も絞られず、**得られるのは名前空間だけ**である。問題は、**名前が果たせない約束をする**こと。

```ts
const Task = Val.sealer<Task>().implCreate((t: Fields) => ({ id: uuid(), ...t }));

Task.create({ title: "x" }); // id が振られる
Task({ id: "forged", … });   // ← 隣で素通り
```

companion の `create` は「鋳造は `create`、封は seal、それ以外に値になる経路は無い」（§6.7 / §6.8）の一部として意味を持つ。sealer に同じ名前を置くと、同じ `create` が型によって強さの違うものになり、守っているように読めて何も守らない。`.fixed`（§6.10）も companion builder のステップなので、道具立てとしても中途半端になる。

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
2. **ES2023 で不要になった。** `toSorted` / `toSpliced` / `patch` / `toReversed` があるので、正規化は「書き換える」ではなく「導出する」で足りる
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
| `V.patch(v, patch)`（カスタム seal なし）  | なし                          | 1（マージ）               | 1                                   |
| `V.patch(v, patch)`（カスタム seal あり）  | 通る                          | 1 + seal の導出分         | 1                                   |
| `V.update(v, fn)`                          | 上と同じ                      | `fn` が作る分（通常 1）   | 1                                   |
| `V.update(v, fn)`（`.fixed` あり）         | 上と同じ                      | `fn` の分 + マージ 1      | 1                                   |
| `V.create(args)`                           | 通る                          | create が組む分（通常 1） | 1                                   |
| `.impl` の自前 `patch` → 第 3 引数の seal  | 通る                          | 自前実装しだい            | 1                                   |
| `.impl` の自前 `patch` → `Val.of`          | **通らない**                  | 同上                      | 1                                   |
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
| `City.patch(city, { name })`                 | 0.229  |
| `City.patch(city, { geo: { lat: 36 } })`     | 0.439  |

70 倍の差は経路ではなく**渡したノードの出自**で決まる。`update` が特別なのではなく、値をスプレッドして直にコンストラクタへ渡しても同じになる。逆に、外から来たオブジェクトを組み立てて渡せば全部コピーする。

deep patch（§6.2）はこの性質を細かくした。patch が触った path のノードだけが新しく、兄弟はすべて owned のまま素通りする。

#### 既定の seal を第 2 引数で渡す

custom seal の中で値を作るには `Val.of<Age>(n)` と型引数を書く必要があった。既定の seal（brand + copy = その型に束縛された `Val.of`）を第 2 引数で渡せば、それが消える。

```ts
.implSeal((n, seal) => (n >= 0 ? ok(seal(n)) : err("negative")))
```

`equals` の `deepEquals`、上書き `patch` / `update` の seal（§6.6）と同じ立て付け。渡すのは**既定の** seal であって自分自身ではないので、再帰にはならない。1 引数で書かれた seal はそのまま登録される。公開側は `WithoutDefaultSeal<F>` で第 2 引数を落とす。

**それでも `Val.of` は公開したままにする。** 消せば `.impl` のメソッドが自分の型の値を作れなくなり、seal なし companion（§6.5）も成立しなくなり、検証済みの値の再持ち上げ（JSON 往復、テストのフィクスチャ）も seal 経由の再検証を強制される。そもそも `payload as Age` は残るので**閉じられる穴ではない**。`Val.of<Age>(x)` は型引数を明示するぶん grep できる逃げ道である、という位置づけ。

| 値を作る場所                          | 手段                     |
| ------------------------------------- | ------------------------ |
| custom seal の中                      | 第 2 引数の seal         |
| `patch` / `update` の上書き           | 第 3 引数の seal（§6.6） |
| `.impl` のメソッド / 境界での持ち上げ | `Val.of`                 |

### 6.9 名前が `seal` になるまで

登録は `implFrom`、生えるメソッドは `from` だった。順に落とした。

- **`from`**: `implFrom` が Rust の `impl From<T> for U`（＝任意の型からの変換）に読める。それは今の `create` の意味であり、**名前が指すものが実際と逆**だった
- **`validate`**: 検査は seal がやることの一つにすぎない。正規化（§5 の Email）も `Result` 包みも「検証」ではないし、`validate(x)` が引数をコピーするのは奇妙。boolean を返す述語だと誤読させる語でもある
- **`parse`**: コピーも失敗も自然に読める。しかし parse は「緩い入力を解いて型にする」語なので、**引数がペイロードに固定されている理由を名前が説明しない**。その制約は `patch` / `update` がここを通せるために本質的なもので、恣意的に見えては困る
- **`seal`**: 封をする対象は中身そのものなので、引数がペイロードであることが名前から出る。すでにライブラリの語彙（`Val.sealer`）で、三分割が一列に並ぶ。「鋳造してはいけない」という §6.7 の規約も動詞から読み取れる

|                   | 引数    | 制約                         |
| ----------------- | ------- | ---------------------------- |
| `Val.sealer<V>()` | payload | なし（brand + コピーだけ）   |
| `.implSeal(f)`    | payload | あり                         |
| `.implCreate(f)`  | 自由    | payload を組んで seal に流す |

**残るリスクは `Object.seal` / `sealed class` との混線。** JS の `Object.seal` は実行時にプロパティ追加を禁じる操作だが、valof は凍結しない（§7.1）。Rust / Scala / Kotlin の `sealed` は型宣言に付く形容詞（閉じた継承階層）だが、こちらは値を作る動詞。valof には subtyping も variant もないので誤読の材料は薄いが、README と doc に一行で潰しておく。

### 6.10 `fixed`: 派生経路から外すキー

`create` が鋳造した `id` を `patch` / `update` から触らせない、という §8.4 のパターンは、**`patch` / `update` を両方とも上書きする**ことでしか書けなかった。上書きの中身は既定と 1 文字も違わず、**唯一の内容は patch の型**である。§6.5 / §6.6 で「ラバースタンプを書かせない」と決めておきながら、最も頻出するパターンでそれを強制していた。

宣言のステップを足す。

```ts
Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal(seal)
  .fixed<"id">();
```

#### キーは型引数で渡す（実行時には存在しない）

`fixed("id")` と文字列で渡せば実行時にもキーが分かるが、型引数だけにした。ブランドがファントムであることと揃うし、得られる保証も §8.4 が既に認めている水準（「通常の更新経路では触れない。`Val.of` では偽造できる」）と同じ。型を迂回したケース（`any` 経由など）で実行時に旧値を復元する挙動は、バグを隠す側にも働く。

**キー名が無くても `update` は成立する。** `fixed` を呼んだという事実（boolean 1 つ）だけ実行時に残せば、`update` は `seal({ ...value, ...fn(value) })` とマージすればよい。コールバックが返すのは残りのキーだけなので、触れないキーは古い値から生き残る。

|                         | 既定                        | `fixed<K>()` あり                    |
| ----------------------- | --------------------------- | ------------------------------------ |
| `patch` の patch        | `Patch<SeedOf<V>>`          | `Patch<Omit<SeedOf<V>, K>>`          |
| `update` のコールバック | `(v) => SeedOf<V>` を素通し | `(v) => Omit<SeedOf<V>, K>` をマージ |

既定側でマージしないのは、**optional キーの削除**を残すため。マージする側ではそれができなくなるので、削除は `patch(v, { k: undefined })` を使う。

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

update: <T extends Derivable<V, P>>(value: V, fn: (value: V) => NoExtra<T, Derivable<V, P>>) => …
```

`T` はコールバックが実際に返した型から推論されるので、`Derivable` にないキーは `never` に写されてエラーになる。`T extends NoExtra<T, S>` と制約側に書くほうが見た目はきれいだが **TS2313（circular constraint）**。§3.5 で `Val<K, T>` の自己参照制約を条件型に逃がしたのと同じ制限で、ここでは引数の型に置く。

この技が**利用者のコードからライブラリの実装に移った**のがこの節の実利で、§8.4 は 4 行になった。

#### 名前

`implProtect` / `implFinal` / `implMinted` を経て `unpatchable` にし、そこから `fixed` に改名した。

- `impl` 接頭辞は付けない。`impl*` は「X の実装を与える」に揃えたが、これは関数を 1 つも渡さず型について宣言するだけのステップ。**実装を与える手順と、性質を宣言する手順が名前で区別される**ほうが良い
- `final` は JVM の語彙（`final val` / `sealed abstract class`）を持ち込み、`seal` を `sealed trait` の意味に誤読させる。`finalize` は GC のファイナライザ（`FinalizationRegistry`）と、ビルダーの終端（`.build()`）の両方に読める
- `minted` は §6.7 の鋳造の比喩と最も整合するが、`create` を持たない型では意味が曖昧になり、英語圏外の読み手には通じにくい
- `unpatchable` は既に公開している `Patch<T>` からしか意味を取らない。新しい比喩も、やっていること以上の約束も持ち込まない

#### `unpatchable` → `fixed`

`with` を `patch` に改名した時点（§6.2）で語幹が衝突した。`unpatchable` は前から `patch` と `update` の両方を縛っていたが、旧名では見えなかった。メンバに `patch` ができると「`patch` だけ塞ぐ」と読める。**`Account.update(a, (x) => ({ ...x, id: "forged" }))` は通る、と読む者が出る。** それは `unpatchable` が防ぎたかった偽造そのものである。

`fixed` は `patch` とも `update` とも語幹を共有せず、`create` の有無にも依存しない。fixed-point / fixed rate の系列なので、継承も可視性も連想させない。

**形容詞のままにする。** これは関数を 1 つも渡さず性質を宣言するだけのステップで、実装を与える `impl*` と名前で区別される、という上の判断は変わらない。`fix` にすると命令形になってその区別が消えるうえ、鎖の中の `.fix()` は「直す」と読まれる。

- **`final`**: 上で却下したまま。JVM の語彙が `seal` を `sealed trait` に誤読させる件は §6.9 が `seal` の残存リスクとして挙げたもので、`final` はそれを増幅する
- **`lock`**: 命令形で誤読も無いが、実行時には boolean 1 つしか残らないのに lock と言うのは約束が過大
- 内部型 `Patchable<V, P>` は `Derivable<V, P>` に改名。`patch` と `update` の両方が通る面なので、片方の語幹を持たせない

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
- **production の gzip は変わらない**（development ビルドだけ +20 B ほど増える）
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

### 7.7 `equals` / `patch` / `update` を `.impl` に置いたままにする

**却下。`.impl` はそのまま生やすものだけの置き場にする。**

`.impl` に置かれた関数は名前どおりに companion に付く。この 3 つだけは違う。ライブラリが配線する。

- 戻り値の型が決まっている（`equals` は `boolean`、`patch` / `update` は seal の戻り）
- `equals` は第 3 引数（`deepEquals`）が束縛されて公開側から消える
- companion の型で `Omit<M, "equals" | "patch" | "update">` されて、`M` から取り除かれる

実行時にもそれは出ていて、`attach` の `for` ループがこの 3 つを `continue` で特別扱いしていた。「`.impl` は素通し」という建前が既に破れていた。

`seal` と `create` は最初から専用の段にあり、`.impl` 側では `never` で弾いている（§6.5）。規則を 1 本に揃えると全部そこに乗る。

> **ライブラリが配線するものは専用の段。`.impl` はそのまま生やすものだけ。**

行き先は 3 つで同じではない。`equals` は `implEquals` に出た。`patch` / `update` は**どこにも出さず、上書きの手段ごと閉じた**（§6.6）。`.impl` から弾く `never` は 3 つとも残る。上書きさせないことと、同名の関数を素通しで生やせることは別で、後者は既定を実行時に踏み潰す。

---

## 8. 慣用パターン

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

検証を seal に置けば、更新経路（`patch` / `update`）も鋳造経路（`create`）も全部そこを通る（§6.2 / §6.8）。引数は `object` まで広げてよい。`SealImpl<V>` はペイロードを**受け取れる**ことしか要求しない。`unknown` は `string` も受けるので落ちる（§6.7）。

```ts
export const User = Val.companion<User>()
  .implSeal((input: object, seal): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(seal(r.data)) : err(r.error.message);
  })
  .impl({ greet(u) { … } });
```

zod の `.brand()` との違いはここに出る。あちらの検査はパースの一度きりで、結果から派生した `{ ...user, name: "" }` はブランド付きの型のまま再検査されない。valof の `patch` / `update` は seal を通り直す。**README にはこの対比を書かない。** 詳細に寄りすぎるので、一行（「派生のたびにスキーマが走る」）だけ置き、対比は宣伝記事に回す。

**ワイヤ形式のデコードは seal に入れない。** `seal(json: string)` は `CheckedSeal` に落ちる（§6.7）。形式のパースは手前の別関数に分ける。

```ts
export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

値が常に検証済みで届く型（デコーダ、DB 行）は、カスタム seal を登録せず境界で `Val.of` に持ち上げる（§6.5）。この場合 `patch` / `update` はコピーで再構築し、何も再検証しない。**境界を一度通れば以降は信頼する**という設計を選んだことになる。

### 8.4 更新経路から外したいフィールド

コンストラクタ内で生成する ID、`createdAt`、バージョン番号。`create` が鋳造し、seal が封をし、`.fixed`（§6.10）が更新経路から外す。

```ts
type Fields = Omit<SeedOf<User>, "id">;

export const User = Val.companion<User>()
  .implCreate((f: Fields): SeedOf<User> => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .fixed<"id">();

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // 型エラー
User.update(user, (u) => ({ ...u, id: "forged" })); // 型エラー
```

`update` も塞ぐ必要があるのは、コールバックがペイロード全体を返す経路だから。`patch` の patch だけ絞っても `id` は届く。

**それでもこれは private ではない。** `user.id` は読めるし、`readonly` は実行時に消えるし、`Val.of<User>({ id: "forged", … })` で偽造できる。得られるのは「通常の更新経路が `id` を動かせない」だけ。偽造も防ぎたいなら `id` は値の外に持つ。

---

## 9. 未解決 / 要確認

- [ ] TS 7.1（ベータ 2026-10-06、安定版 2026-11-24）が in-process の LS API を出すか（§14.5）。出れば 7.x の LSP クライアントをそれに寄せて、5.x / 6.x と同じ経路に畳める。**急がない。**`tsc --lsp` で 7.0 から動くので、これは簡素化の機会であって前提条件ではない
- [ ] エディタ統合（§14.9）。実装は入った（`Options.overlay`、`valof/lint`、`valof/eslint-plugin`）。残りは README のレシピと、実際のエディタでの確認
- [ ] valof-lint の規則: `PayloadOf<X>` が Val の payload の**プロパティ位置**に現れたら警告する。正当な用法（トップレベルの交差型の基底）とは構文位置で区別できる
- [ ] `fixed` はトップレベルのキーしか外せない（§6.10）。deep patch が入ったので、深い位置のキーを外したい要求が出るか様子見。パスを型引数で受ける形になるが、`Patch` の再帰と噛み合うかは未検証
- [x] ~~`owned` の記録を失った payload の挙動を README に載せるか（§6.2）~~ → 載せない。`structuredClone` を通れば別のオブジェクトになる、は JS を書く人には自明で、そこから派生のコピーも merge も導ける。記録は §6.2 に残す
- [x] ~~README のコード例を型検査するか~~ → やらない。twoslash が Rust の doctest に当たるが、前置きを隠す `// ---cut---` が効くのは twoslash のレンダラだけで、**README を読む GitHub と npm では前置きがそのまま見える**。隠すにはドキュメント専用サイトが要り、この規模のプロジェクトには重い。フェンスに id を振って前置きを別ファイルに置く自前の仕組みも書けるが、保守対象が 1 つ増える
- [ ] `Temporal` の各ランタイムでの対応状況（外す方針なので優先度は低いが、README で触れるなら要確認）
- [ ] Records & Tuples 提案の現状。2025 年春に champion が取り下げて Composites を模索していたはずだが、要確認。**言語側の解決を待つ戦略は取らない**
- [ ] valof-lint のテストの穴を塞ぐ（§14.10）。2 巡目まで完了。残りは `declaredName` の連鎖、`directives.ts` の `widen` と `joins`、`rules/equals/index.ts` の「最初が勝つ」
- [ ] fixture を型検査するか（§14.10）。`rules/structural-equals/` サブツリーだけ `tsconfig.json` を置く案が有力。TS1361 を直したので 0 error。他は除外のまま
- [x] ~~valof-lint の規則 `brand-mismatch` を実装する（§14.12）~~ → 実装した。`incomplete-disable`（§14.14）と `unused-disable`（§14.15）も入れて規則は 6 つ
- [ ] npm の既存ライブラリ調査（`brand` / `value-object` / `newtype`）
- [x] ~~Mutable ↔ DeepReadonly の往復が型推論に素直に効くか~~ → 効く。プロパティの `readonly` は代入互換性に影響せず、可変配列は `ReadonlyArray` に代入できるので、引数型を `SeedOf<V>` にすれば可変な入力もそのまま渡せる

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
- `patch` / `update`（Result 非依存、seal を通る。`.impl` で上書き可能で、そのとき seal は第 3 引数で渡される、§6.6）
- `.fixed<K>()`（更新経路から外すキーを型引数で宣言、§6.10）
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

## 11. 欠番

README の構成案があったが、README を書いたので落とした。README 自身が記録である。番号は §12 以降の参照を動かさないために空けてある。

---

## 12. 命名

### 12.1 パッケージ名: `valof`

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
- `patch` / `update` が `ReturnType<typeof from>` を返さなくなる
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

`from` を移すと `R` が落ち、`Age.from` の型も `patch` の戻り値型も失われる（§6.3 の「ライブラリは Result の中身を知らずに型だけ通す」が壊れる）。`from` が第 2 呼び出しのオブジェクトに居るのは、そこには明示的型引数が一切なく、`M` も `R` も自由に推論できるから。

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

素の `Val.sealer<V>()` / `Val.companion<V>()` も既定の振る舞い（`equals` / `patch` / `update`）を持つ完全な companion にしてある。メソッドのない Val が `.impl({})` を書かずに済む。

### 13.8 副次的な決定

- **`-0` と `0` を等価とする。** `JSON.stringify(-0)` は `"0"` なので、往復すると区別が消える。§3.5 の `undefined` と同じ「2 経路の差異を観測不能にする」論法。実装は `a === b` で NaN だけ別扱いすれば済む
- **`exactOptionalPropertyTypes: true` を本リポジトリの `tsconfig.json` で有効化。** §3.5 で強く推奨した以上、自分で従う。必須キーへの `undefined` を弾くテストはこれがないと通らない

---

## 14. valof-lint

2026-09-03 に調査、`feat/valof-lint` ブランチで実装。2026-09-07 時点で `main` 未マージ。規則は 6 つ（§14.4、§14.7、§14.12、§14.14、§14.15）、構成は §14.8。

`.impl({...})` の中の関数は、dead と報告されることもバンドルから落ちることもない。`attach` が実行時に `Object.defineProperty` で companion に載せるので、静的解析からは「関数に渡されたオブジェクトリテラル」にしか見えない。

推測ではなく実測:

- **knip 6.34.0** は素の未使用 `export function` を報告するが、その隣にある未使用の companion 関数には何も言わない。`--exports` ショートカットも、他のどの issue type も検出しない
- **vite/rolldown** は未使用の export された関数をバンドルから落とし、companion のほうは残す

### 14.1 なぜ独立したスクリプトなのか

- **knip プラグインでは書けない。** `IssueType = keyof Issues` であり、`Issues` は core 側の固定レコード（files, dependencies, exports, types, enumMembers, namespaceMembers, cycles, ...）。「export されたオブジェクトのメンバ」というカテゴリは存在せず、プラグインから追加もできない。プラグインのフック（`resolveFromAST`, `registerVisitors`, ...）が返せるのは `Input[]` だけで、使用済みとして足すことはできても未使用を報告することはできない
- **lint でも書けない。** ESLint も oxlint もファイル単位で、ルールは 1 ファイルの AST を見てその中に報告を紐付ける。`import/no-unused-modules` のようなクロスファイルのルールは自前でプロジェクトを走査しており、lint のモデルの外にいる。ast-grep の `sg scan` ルールも同じ理由で不可

**2026-09-07 訂正。** 上は当初「oxlint は並列に走るので状態を貯めても信用できない」と書いていた。`@oxlint/plugins` の型定義を読むと `createOnce` があり、ルールを 1 度だけ作って使い回すので**状態を貯めること自体はできる**。

```ts
interface CreateOnceRule {
  createOnce: (context: Context) => VisitorWithHooks; // + before / after
}
```

結論は変わらないが理由が違う。**貯めても報告できない。** `before` / `after` はファイル 1 つの走査を挟むフックで、実行全体の終了フックではない。吐き出す場所が無く、`context.report` は今見ているファイルに紐づく。子の `implEquals` を知った時点で親のファイルは走査済みかもしれない。

- **oxlint の type-aware linting にも触れない。** JS プラグインが貰えるのは `ast` / `scopeManager` / `visitorKeys` / `lines` / `lineStartIndices` で、型はゼロ。typescript-eslint が検査器を渡す口である `parserServices` は、型定義に「Oxlint does not offer any parser services」と明記されて常に空。型を持っているのは別プロセスの Go バイナリ（`oxlint-tsgolint`）で、type-aware なルールはその中の組み込みルールである。橋が無い

companion のメンバは `Companion.member` の形でしか到達されない。各 `.impl({...})` のトップレベルキーを集めて、プロジェクト全体で `Name.key` を数えれば足りる。

### 14.2 パーサ: `@ast-grep/napi` ではなく `oxc-parser`

両方プロトタイプを作り、結果は一致した。400 ファイルのコーパスで、oxc はインストール 3.2 MB で 21 ms、ast-grep は 7.2 MB で 76 ms。oxc のほうが 33 行多い。ast-grep のパターン DSL（`const $N = $B.impl($OBJ)`）を手書きの ESTree walk で置き換えるためだが、`oxc-parser` は `visitorKeys` を export しているので汎用の降下は 10 行で済む。oxlint / oxfmt / Rolldown と系譜も共通する。決め手は、optional な peer dependency がこれを動かすために利用者が払う唯一のコストだということ。DSL より、それを半分にするほうが勝つ。

最初のプロトタイプはテキストベースで、`User["greet"]`、リネームした import、分割代入、ネストした `.impl` を取りこぼした。今も届かないのは名前解決が追えないもの: `export { X as Y }` の連鎖、`import * as ns`、computed key、`.impl({...base})` へのスプレッド。

### 14.3 valof に同梱する

2026-09-04 にテスト用パッケージを pack してインストールし検証した。`bin` エントリと、_optional_ な `peerDependencies` としての `oxc-parser` は、欲しくない利用者に何のコストも課さない。利用者側の `node_modules` を実測すると、valof だけなら 36 KB（パーサは引かれず、インストール警告も出ず、bin はインストールを促して exit 2）、opt-in すると 7.3 MB。`dependencies` は空のままなので、実行時依存ゼロと 1 kB 前後という主張は保たれる。`scripts/size.ts` がバンドルするのは `./dist/index.mjs` だけで、隣にある `dist/lint-cli.mjs` はそこから到達できない。

他の 2 案より優れている。README のレシピにはテストもバージョンもなく、別パッケージはリリース面が増える。valof 内の bin なら既存のリリースワークフローに乗り、ここでテストできる。

#### 2026-09-07 再評価: 理由が変わった

同梱の判断は維持する。**ただし上の 3 つは決定的な理由ではなかった。**

判断時 252 行だったリンタは 1465 行になり、ライブラリ本体 809 行を追い越した。配布物でも逆転している。

```
ソース   library  809 行 / linter 1465 行
配布物   library 27.0 kB / linter 36.6 kB   ← リンタが 58%
tarball  32 KB
```

**本当の理由は、規則がライブラリの API の方言を追っていること。** 実証がある。`main` を取り込んだ際、`with` → `patch` の改名にリンタが追随した。

```
BUILTIN = ["equals", "with", "update", "seal", "create"]
       →  ["equals", "patch", "update", "seal", "create"]
```

`.unpatchable` → `.fixed` も、`.implEquals` という段の追加も同じ。§14.7 の規則は `EqSpec` の綴り（配列は要素ごと、タプルは位置ごと、companion をそのまま渡す）にそのまま乗っており、チェーンの根が `Val.sealer` / `Val.companion` であることも `.impl` が拒む 5 つの名前も、すべてライブラリ側の決定である。

**別パッケージならこのずれは必ず起きる。** 「valof 0.5.0 は `patch`、valof-lint 0.4.x はまだ `with` を見ている」という窓がリリースのたびに開く。同じリポジトリであることが、方言の整合を暗黙に保っている。

#### 代償

- **tarball 32 KB → 39 KB。** `valof/lint` を出したとき増えた分で、ほぼ `dist/lint/index.d.mts`（14.9 kB）である。`Finding` が `RULES` から導かれるので、宣言は規則の型グラフを丸ごと連れてくる
- **配布物の 58% がリンタ。** README の「1 kB gzipped」は**バンドルサイズ**であって、`scripts/size.ts` が測るのは `dist/index.mjs` だけなので主張は保たれる。だがダウンロードサイズは別物で、`npm i valof` した `node_modules` には 36 kB のリンタが入る
- **リリース粒度が結合する。** リンタだけの修正でライブラリのバージョンが上がる。今はどちらも動いているので表面化していない

#### 分ける条件

先に決めておく。

- ライブラリが安定し、**リンタだけのリリースが続く**ようになったとき
- リンタの依存が実行時依存に漏れそうになったとき（今は `typescript` を宣言せず spawn しているので保たれている）
- 配布物に占める割合がさらに大きくなったとき

分けるなら monorepo。`pnpm-workspace.yaml` は既にあるので `packages/valof` と `packages/valof-lint` に割り、リリースワークフローは共有できる。上で「別パッケージはリリース面が増える」と却下したが、workspace ならその代償は小さい。代わりに `valof-lint` が `peerDependencies: valof` を持ち、**方言の整合を暗黙にではなく宣言で管理する**ことになる。

### 14.4 ルール

構文だけで判定するものが 5 つ。残る 1 つは go-to-definition を使う（§14.7）。

- 誰も読まない companion のメンバ
- 複数の**トップレベル**型エイリアスが主張しているブランド文字列
- 型名で終わっていないブランド文字列（§14.12）
- ルールを名指ししていない disable コメント（§14.14）
- 何も黙らせていない disable コメント（§14.15）

トップレベル限定であることが効く。この制限がないと、このリポジトリ自身のテストで `describe` や `test` の中にスコープされたフィクスチャから 30 件の衝突が報告される。

このリポジトリの `src` は companion を使っていないので、dead メンバの規則はここでは発火しない。対象は valof の_利用者_である。

### 14.5 却下: ts-morph、2026-09-04

両方のチェックを ts-morph で書き直すと、現在の 252 行に対してコメントを除いて 50 行になる。`findReferencesAsNodes()` が読み取り追跡のパス全体を置き換え、`getType().getAliasSymbol()` が名前ベースのルート判定の代わりに companion を `Sealer` / `Sealed` / `CompanionBuilder` として識別する。コストはインストール 3.2 MB に対して 15 MB、2 ファイルで 0.06 秒に対して 0.31 秒。

**ts-morph は TypeScript 7 を使っていない。** `@ts-morph/common` に `typescript` への依存はなく、自前のコンパイラを同梱している（15 MB のうち 12 MB）。つまり TS 7.1 の API を待つことは、TypeScript のリリースではなく ts-morph の移植を待つことになる。`typescript@7.0.2` が export するのは `default`、`module.exports`、`version`、`versionMajorMinor` の 4 つだけ。

コストを正当化するために型ベースのルールを 2 つ試作し、どちらも却下した。

- **ブランド重複の判定を payload の代入可能性で絞るのは誤り。** 構造的部分型があるので「payload が違う」は「分離されている」を意味しない。`Val<"Id", {a: string; b: number}>` は `Val<"Id", {a: string}>` に代入できる（検証済み）。双方向の `isAssignableTo` 判定は、まさにその漏れを見逃す方向に働く。このライブラリは公称型を強制するために存在するので、ブランドの衝突は payload が何であれ欠陥である
- **カスタム `equals` を持つ子を親が構造比較していることの検出は、厳しすぎて使えない。** 動作はする（ローカルの型エイリアス、配列、2 ファイルにまたがる場合で検証し、オーバーライドのない子では黙る）。だがオーバーライドが伝播しないのは設計そのもの（§5、§7.6）なので、対処のしようがないまま N×M 回発火する。再検討するならオーバーライドの定義箇所で一度だけ報告し、どこにネストされているかを列挙する形にする。それは「正規形で構築する」レシピを指すことになる

`equals` を_誰がオーバーライドしたか_の検出は、どちらの方式でも構文の話になる。`Companion<V, M>` はオーバーライドの有無にかかわらず `equals` を `(a, b) => boolean` と型付けするため。

#### 2026-09-07 再評価: TS 7.1 を待つ

`implEquals` の spec が入り、§5 が忘れ検出をリンタに割り当てたので、型が要る規則が初めて具体化した（§14.7）。それを機に前提を測り直した。

**TS 7 の API はまだ 2 キー。** 上の記録は今も正しい。

```
$ node -e "const ts=require('typescript'); console.log(ts.version, Object.keys(ts))"
7.0.2 [ 'version', 'versionMajorMinor' ]
```

このリポジトリ自身が `typescript@^7.0.2` に乗っているので、ts-morph を採ると **TS 7 の利用者のコードを同梱の TS 5 系検査器で解析する**ことになる。

**7.1 が安定化するのは Language Service API。** iteration plan（microsoft/TypeScript#63703、ベータ 2026-10-06、安定版 2026-11-24）が挙げるのは Language Service / Emit / Content Mapper の 3 つで、**TypeChecker は明言されていない**。

それで足りる。§14.7 の規則が要るのは go-to-definition であって検査器ではないため。

1. 「プロパティ位置の `Money` は Val か」→ 参照を宣言まで辿り、その宣言を構文で読む。LS で足りる
2. 「その companion は `implEquals` を呼んだか」→ 上のとおり構文の話。検査器があっても変わらない

`findReferencesAsNodes()` も `getDefinitionNodes()` も ts-morph の**検査器ラッパーではなく LS ラッパー**である。LS が安定化するなら素の `typescript` で同じものが手に入る。

**ts-morph の TS 7 対応は再アーキテクチャになる。** `@ts-morph/common` は `typescript` に依存せず自前のコンパイラを同梱する設計で、Go のコンパイラを相手にする移植はバージョン上げではない。ts-morph の API は全同期なので、7.1 の API が非同期なら同期のまま移植する道も無い。2026-11 に間に合う前提は置けない。

**残る優位性は `LanguageServiceHost` のボイラープレートだけ。** `getScriptFileNames` / `getScriptVersion` / `getScriptSnapshot` / `getCompilationSettings` / `getDefaultLibFileName` の実装で 60 行ほど。一度書けば終わる。改変 API は、出すのが「spec に `total: Money` を足せ」というテキスト提案である限り要らない。

**LS がオフセットベースなのは oxc 側に有利。** `findReferences(fileName, position)` が返すのは `{ fileName, textSpan }` でノードではない。解析が ts-morph の中にあるならノードを返す API が便利だが、解析が oxc の AST にあるならノードは使えない。既に `lineIndex` でオフセットを扱っている。

**素の `typescript` なら optional peer dependency が実質タダ。** TS プロジェクトには必ず入っているので、§14.3 の 3.2 MB 対 15 MB の議論ごと消える。

したがって **ts-morph は選択肢から落とす。**

#### 2026-09-07 続き: 待つ必要が無かった

上は「7.1 を待って素の `typescript` を足す」と結論していた。**撤回する。** 7.0 で今できる。

**TS 7.0.2 には `tsc --lsp --stdio` がある。** 実測した。

```
initialize                34 ms
didOpen x200               5 ms
serial 50 queries         76 ms   (1.52 ms/query)
pipelined 200 queries      5 ms   (0.03 ms/query)
non-empty results    200 / 200
```

`textDocument/definition` を `total: Money` の位置に投げると `money.ts` の型エイリアス宣言が返る。capabilities も揃っている（`definitionProvider` / `typeDefinitionProvider` / `referencesProvider` / `implementationProvider` / `hoverProvider`）。

**落とし穴は 1 つだけ。** サーバが `client/registerCapability` を**リクエストとして**送ってくる。応答しないとデッドロックする。

**速度は論点にならない。** warm は 0 ms でチェッカのキャッシュに乗る。LSP は id で多重化するのでパイプライン化でき、往復待ちが 1 回に畳まれる。「1 件ずつ往復するので絞る前段が要る」という懸念は消えた。

**5.x / 6.x に LSP は無いが、in-process API がある。** 補完関係になっている。

|               | in-process API                                    | LSP                                        |
| ------------- | ------------------------------------------------- | ------------------------------------------ |
| 5.9.3 / 6.0.3 | あり（2244 / 2248 keys、`createLanguageService`） | 無し（`--lsp` は Unknown compiler option） |
| 7.0.2         | 無し（2 keys）                                    | あり                                       |

両方で `getDefinitionAtPosition` / `textDocument/definition` を実測した。

|       | 経路                    | cold   | per query                           | 結果    |
| ----- | ----------------------- | ------ | ----------------------------------- | ------- |
| 5.9.3 | `createLanguageService` | 166 ms | 0.15 ms                             | 200/200 |
| 6.0.3 | 同上                    | 159 ms | 0.20 ms                             | 200/200 |
| 7.0.2 | `tsc --lsp --stdio`     | 34 ms  | 1.52 ms 直列 / 0.03 ms パイプライン | 200/200 |

**古い経路のほうが 1 件あたり速い。** IPC の往復が無いため。cold は tsgo が速い。`LanguageServiceHost` は 13 行で、当初 60 行と見積もったのは過大だった。

どちらも `{ file, offset }` を返すので 1 つの関数の裏に隠せる。

```ts
type DefinitionAt = (file: string, offset: number) => { file: string; offset: number }[];
```

**結果、floor 5.9.3 から 7.x まで隙間なく覆える。** 合わせて 100 行程度。取り残される利用者はいない。

#### `textDocument/didOpen` を送らない

2026-09-07 の実装時に実測。**スキャン対象を全部 `didOpen` すると初回クエリが 10 倍遅くなる。**

```
rootUri=repo, didOpen 65 件   init 24 ms | didOpen 2 ms | 初回クエリ 436 ms
rootUri=repo, didOpen なし    init 30 ms | didOpen 0 ms | 初回クエリ  45 ms
```

答えは同じ。`didOpen` はエディタが未保存で抱えているバッファのためのもので、リンタが読むのはディスク上のファイルである。サーバは `rootUri` からプロジェクトを読み、リクエストが名指したファイルを遅延して開く。全件送ると 1 件ずつ document を構築し、初回クエリがその全部を待つ。

CLI 全体で 65 ファイル 580 ms → 213 ms。**ファイル数が増えるほど差が開く**ので、実プロジェクトほど効く。

`tsconfig.json` の `exclude` に入っているファイルでも解決できた（このリポジトリの fixture がまさにそれ）。サーバが inferred project を作るため。

残るコストは init 30 ms と初回クエリ 45 ms で、1 実行に 1 回。**プロセスを常駐させて償却する案は取らない。** 1 回の lint 実行が起動する LS は元から 1 つで、実行をまたいで持ち回るにはライフサイクルと陳腐化の管理が要る。CI で 1 回走るリンタが 75 ms のために払う複雑さではない。

#### `typescript` は peer dependency にしない

`oxc-parser` が optional peer dependency なのは**自分のプロセスに `import` する**から。モジュール解決がユーザのコピーを見つける必要があり、2 つあれば 2 つのパーサになる。

`tsc` は違う。7.x では subprocess として spawn し、5.x / 6.x では `require` するが、**TS のオブジェクトをユーザに返さない**ので共有すべき単一インスタンスが存在しない。シェルアウトする先のバイナリは `git` と同じ外部ツールである。

実行時にユーザ自身の `typescript` を解決し、`typescript/package.json` の version をメジャーで分岐する。無ければこの規則だけ黙って飛ばし、理由を伝える。

宣言しない利点。インストール footprint ゼロ、peer 警告も ERESOLVE も無し、TS のリリースに追随するバージョン範囲を持たない、monorepo が固定した TS でも動く。

peer dependency にした場合を実測した限りでは、入れ子のコピーは作られず（peer の定義どおり）、pnpm v11 は `[WARN] Issues with peer dependencies found` の警告止まり。ユーザコードが壊れる経路は無い。ただし `typescript@7` は薄いシムで実体はプラットフォーム別の optional dependency 26 MB なので、重複したときの容量は誤差ではない。いずれにせよ宣言しないので問題は生じない。

|              | 依存の形                           | 無いとき                      |
| ------------ | ---------------------------------- | ----------------------------- |
| `oxc-parser` | optional peer（import する）       | CLI 全体が exit 2、導入を促す |
| `tsc`        | 宣言しない（spawn / require する） | equals の規則だけ飛ばす       |

#### AST のパスは残る

理由が速度から**正確さ**に変わった。ネガティブコントロールを取ると、`export type Gen0 = ...` の 0 桁目を問い合わせて `Gen0` 自身の定義が返る。**位置を厳密に渡さないと近くの別の識別子を解決する。** 正確なオフセットを出すのが oxc の walk であり、`valof` からの import を起点に使用箇所を辿るコードは、置き換えではなく**問い合わせ位置のフィルタとして**残る。

### 14.6 名前空間自身のバンドルサイズ

`Val` 自身が companion なので、§14 の盲点はこのライブラリの表面にも及ぶ。バンドラは `const Val = {...}` のプロパティを落とせないので、`Val.of` だけを呼ぶモジュールにも `sealer`、`companion`、`unwrap`、`attach`、`deepEquals` が残る（§5 の `eqBy` が当たったのと同じ壁）。

名前空間を名前付き export に分割する案は 2026-09-03 に検討して却下した。利用者の companion には効かず、API が二重化し、ブランドだけが欲しいライブラリなら数行で自作できる。

### 14.7 規則: カスタム equals を持つ子の構造比較、2026-09-07

§5 が spec を全キー省略可にした際、忘れ検出をここに割り当てた。その規則の設計。同日に実装し、TS 7.0.2 / 6.0.3 / 5.9.3 の 3 経路で同一の報告になることを確認した（§14.5）。§14.5 の「厳しすぎて使えない」という却下は `implEquals` の spec が入る前の判断で、**直し方が親の 1 行になったので当たらない**。

**規則。** 親の payload の Val 位置のうち、その子が推移的にカスタム equals を持つものについて、親の spec に**何らかの**エントリがあること。

「何らかの」で足りるのが要点。`total: Money` も `updatedAt: () => true`（等価性から外す）も `span: [undefined, Money]` も、著者がその位置を見た証拠になる。構文位置だけで区別がつく。

| spec の形                              | 読み               |
| -------------------------------------- | ------------------ |
| `Identifier`                           | companion 委譲     |
| `ObjectExpression` / `ArrayExpression` | 降りる             |
| 関数                                   | 著者の判断、黙る   |
| `implEquals` の引数が裸の関数          | 全体を手書き、黙る |

**構文だけで足りる。** パーサ出力で確認した。

- `Val.sealer<Order>()` の `typeArguments.params[0]` は素の `TSTypeReference`。companion と型エイリアスが繋がる
- payload の型は spec と同じ形で降りられる。`TSPropertySignature` / `TSArrayType` / `TSTupleType` / ネストした `TSTypeLiteral` が `{k: spec}` / `[spec]` / 位置指定 / 素のオブジェクトに 1 対 1 で対応する

両側は**エイリアス名**で出会う。companion の変数名ではない。unused-member の規則より素直になる。

#### 決めたこと

**報告先は親。** `Val.sealer<Order>()` の行。§14.5 は「オーバーライドの定義箇所で一度だけ報告し、ネスト先を列挙する」を提案していたが取らない。直すのは親であって `Money` ではないので、`Money` の行に出してもどのファイルを開くか分からない。既存の 2 規則とも揃う。

**カスケードを推移閉包で防ぐ。** `Order → OrderLine → Money` で `Money` だけがカスタム equals を持つ場合、素朴に実装すると `OrderLine` にだけ発火し、**直すと次の実行で `Order` に新しい発火が出る**。「直したら増えた」は最悪の体験。自分か子孫の誰かがカスタム equals を持つなら要ディスパッチ、と閉じて最初から両方報告する。

**名前衝突は duplicate-brand の責務。** 2 つのファイルがどちらも `type Money` を持つと名前解決で区別できず誤検出になる。エイリアス → ブランドの対応は既にあるので、**名前がスキャン範囲で 1 つのブランドにしか解決しないときだけ報告する**。衝突自体は別の規則が報告するので、そちらを直せば足りる。

**`PayloadOf` 経路は意図的に対象外。** 見逃しではなく正しい挙動。

```ts
type OrderB = Val<"OrderB", { total: PayloadOf<Money> }>;
```

§9 のもう 1 つの規則は「フィールド位置に `PayloadOf` を置くな、`total: Money` にしろ」と言う。ここで equals の規則が発火すると「payload のまま `Money.equals` を spec に足せ」となり、**2 つの規則が同じ行に矛盾した指示を出す**。しかも本当の欠陥を隠す方向に直させる。§4.3 のとおりここではブランドごと落ちて子の seal も追跡下の共有も失われており、equals だけ戻しても直らない。`total: Money` に直せば自然に、正しく発火する。トップレベルの `PayloadOf<User> & { … }` も同じく黙る。`SuperUser` の中に `User` の値は無く、フィールドの型を再利用しているだけなので、ディスパッチする先が無い。

**実装上の落とし穴。** これは素朴に書くと勝手に黙るので気づかないが、`ReadonlyArray<Money>` を `readonly Money[]` と同じに扱おうとした瞬間に壊れる。前者は `TSTypeReference` の型引数を降りる必要があり、そこを一般化すると `PayloadOf<Money>` の中の `Money` も拾う。walk は**「spec で写せる形」のホワイトリスト**にする。`TSTypeLiteral` / `TSArrayType` / `TSTupleType` / `ReadonlyArray` / `Array`。それ以外の型参照は不透明として黙る。`PayloadOf` も `SeedOf` も `Omit` も、そこから落ちる。

#### 届かない範囲

どれも誤検出ではなく見逃し側。

- ジェネリック・条件型・マップ型の payload
- スキャン範囲外の companion
- `typescript` が見つからない、または解決に失敗した位置

**go-to-definition が塞ぐのは参照の側だけ。** 2026-09-07 の実装時に一度「ヘルパ経由も塞がる」と書いたが誤り。訂正する。

塞がるのは**子への到達経路**である。リネームした import、re-export、`interface`、エイリアス 1 ホップ、交差、`Money | null`。どれも参照を宣言まで辿るので構文で追う必要が無い。

塞がらないのは**エイリアスが Val だと認める側**。`type Branded<K, T> = Val<K, T>` を経由した `type Money = Branded<"Money", X>` は、収集が「`Val<…>` が直接書かれている」ことを名前で見ているため候補集合に入らず、子として認識されない。**duplicate-brand が持つ穴と同じもので、リンタ全体がこの前提に立っている。** 塞ぐなら `Val` 自身も go-to-definition で同定することになる。見逃し側なので急がない。

#### N×M を恐れなくてよい理由

§5 の「正規形で構築する」原則により `implEquals` は非推奨の逃げ道である。この規則が発火するのは、既にその逃げ道を取った型に限られるので N は小さい。そして N×M 件の発火には N×M 件の**必要な**修正が対応する。ノイズではなく実数である。

### 14.8 ルールの表現と構成、2026-09-07

3 つ目の規則を入れた時点で、ルールごとの分岐が `lint()` と `--help` と `Finding` の 3 か所に散った。整理した結果を残す。

#### ルールは 1 つのオブジェクト

`kind` と説明と実行を 1 か所に持たせる。呼び出し側にルールの知識を置かない。

```ts
type Rule<F extends Located> = {
  kind: F["kind"];
  description: string;
  run: (scans: readonly Scan[], context: Context) => F[] | Promise<F[]>;
};
```

**`Context.types` は値ではなく関数にする。** 言語サーバは最初に求めたルールが起こし、誰も求めなければ起動しない。スキップされたルールも、起動が要らないと自分で判断したルールも、何も払わない。`needsTypes` は equals ルールの内部に隠れる。

```ts
run: (scans, { types }) => (needsTypes(scans) ? findings(scans, types()) : []),
```

runner にルールごとの分岐が無くなる。

```ts
for (const rule of RULES) {
  if (skip?.has(rule.kind)) continue;
  findings.push(...(await rule.run(scans, { types })));
}
```

#### `RULES` は配列。`Record` ではない

一度 `Record<Kind, Rule<Finding>>` にした。網羅を型が強制するのが理由だったが、**キーと `rule.kind` が同じ文字列を 2 回書くことになる。**

配列にして `Kind` と `Finding` をそこから読み戻す。

```ts
export const RULES = [UnusedMember, DuplicateBrand, BrandMismatch, StructuralEquals] as const;

type ReportedBy<R> = R extends Rule<infer F> ? F : never;
export type Finding = ReportedBy<(typeof RULES)[number]>;
export type Kind = Finding["kind"];
```

`Finding` の手書き union も消えた。以前は同じ事実を 3 か所（`RULES` のキー、`rule.kind`、`Finding` の union）に書いていた。

**網羅は弱まらない。むしろ強い。** 載せ忘れたルールは `Kind` に現れず、存在しないのと同じになる。`DuplicateBrand` を配列から外して確認した。

```
x typescript(TS6133): 'DuplicateBrand' is declared but its value is never read.
x typescript(TS2367): '"structural-equals"' and '"duplicate-brand"' have no overlap
x typescript(TS2339): Property 'alias' does not exist on type 'never'
```

CLI の出力分岐が `never` に落ちて止まる。`Record` の「キーを書き忘れたら落ちる」より検知が広い。

`Awaited<O>[number]` で `run` の戻り値から取る形は TS2536 になるので使えない。`R extends Rule<infer F>` は通る。

#### ルールは finding 型と同名

```ts
export type UnusedMember = { kind: "unused-member"; ... };
export const UnusedMember: Rule<UnusedMember> = { ... };
```

型と値で名前空間が分かれるので共存する。**companion が Val と同名を取るのと同じイディオム**であり、このライブラリの中では一貫している。`import { UnusedMember }` 一つが型と値の両方を運ぶので、`rules/index.ts` の import から `type` 修飾も `as` 別名も消えた（`verbatimModuleSyntax` + `isolatedModules` で確認済み）。

実装関数はどのファイルでも `findings`。`rule` が名前を取ったので、非公開の実装が固有名を持つ理由が無い。

#### CLI から規則を切る

`--no-<kind>`。名前は disable コメントと共通にする。覚えるものを増やさないため。

**スキップは報告ではなく仕事を止める。** `--no-structural-equals` は言語サーバを起動しない。65 ファイルで 212 ms → 109 ms。

#### 構成

```
src/lint/
  cli.ts  index.ts  ast.ts
  scan/       構文的事実を取り出す
  typecheck/  go-to-definition（lsp / in-process）
  rules/      判定
```

依存は一方向。`scan/` は閉じており、`rules/` は `scan/index.ts` と `typecheck/index.ts` の窓口だけを見る。`Alias` と `CompanionSite` は `Scan` の構成要素なので `scan/index.ts` が re-export する。ルールが走査の内部に手を伸ばさない。

`ast.ts` は `scan/` の中に入れない。`rules/equals.ts` も payload と spec を歩くのに使うので、共有の道具として一段下に置く。

`Scan` はルール固有のフィールドを持たない。**構文的事実であって、どのルールが読むかは型に書かない。** `aliases` と `brands` は同じ 1 パスが同じ宣言から作り、2 つの規則が 1 つずつ取る。所有関係を書くと、次にルールを足す人が「自分用のフィールドを足す」と読む。

公開する名前は絞る。`src/lint/index.ts` はパッケージの `exports` に無く CLI 専用なので、`lint` 以外に出すものは無い。各ルールが出すのは finding 型と `rule` オブジェクトの 2 つだけ。

### 14.9 エディタ統合、2026-09-08 調査。overlay まで実装

**結論を先に。** oxlint の `jsPlugins` から、Worker 越しに `lint()` を**直接呼ぶ**。valof が出すのは `lint` と `Options.overlay` だけで、`--server` もプロトコルも要らない。**このブランチではやらない。**

一度は「CLI をラップし、`--server` で常駐させ、行区切り JSON を往復させる」と設計した。下にその経緯も残す。**採らない理由は下の「却下」節にある。**

#### CLI をラップするプラグインは書ける

§14.1 の「lint では書けない」はクロスファイルのルールを**ルールとして書く**話だった。CLI を呼んで結果を配るのは lint のモデルの外で走らせる形なので、その指摘に当たらない。

最初の 1 ファイルで CLI をプロジェクト全体に 1 回走らせ、結果をモジュールスコープに貯めて各ファイルに配る。30 行ほど。ESLint と oxlint の両方で実測した。

```
src/order.ts
  6:1  error  structural-equals: Order.total holds Money, which has its own equals  valof/findings
```

- **CLI の起動は 1 回だけ。** ESLint は既定でメインスレッド（`--concurrency` の既定は `off`）。oxlint は 43 ファイル・`--threads 8` でも 1 回で、JS プラグインが Node 側の単一プロセスで動くため
- **`eslint-disable-next-line` が効く**

§14.1 の「並列だと状態を信用できない」はこの方式には当たらない。あれは状態を貯めて**後で**報告する話で、こちらは外部で集めた結果を今のファイルに紐付けるだけである。

#### ESLint は入口が塞がっている。oxlint は通る

```
typescript-eslint does not support TS 7.0.
https://github.com/typescript-eslint/typescript-eslint/issues/10940
```

`@typescript-eslint/parser` が TS 7 未対応で、上の ESLint 実証は TS 6.0.3 に落として取った。valof-lint 自体は TS 7 で動くのに、ESLint 側で TS を読むパーサが追いついていない。

**oxlint の `jsPlugins` は TS 7 の環境でそのまま動いた。** 設定スキーマに「allows usage of ESLint plugins with Oxlint」とあり、ESLint 用に書いたプラグインがほぼ無改造で通る。型情報を使わない方式なので、JS プラグインが `parserServices` に触れない制約（§14.1）にも当たらない。

#### 単発ラップは LSP で破綻する

同一プロセスで 2 回 lint し、間でファイルを直して finding が消えるはずにした。

```
1回目             : 6: structural-equals: Order.total holds Money, ...
修正を保存して2回目 : 6: structural-equals: Order.total holds Money, ...   ← 消えない
spawn 回数        : 1
```

欠陥は 2 つあり、別物である。

1. **キャッシュが固まる。** モジュールスコープの結果が常駐 LSP サーバの寿命だけ残る
2. **未保存バッファが見えない。** valof-lint はディスクを読む。キャッシュを毎回捨てても、保存するまで結果が変わらない

TTL も mtime も 1 を緩めるだけで 2 に効かない。毎回再実行すれば 1 は消えるが 206 ms を毎キーストローク払う。

**どちらも Worker 方式で消える**（下）。1 は resolver を保持したまま毎回走らせられるので（23 ms）キャッシュ自体が要らなくなり、2 は overlay で解く。ここに書いた破綻は「CLI を spawn して結果を貯める」形に固有のものだった。

#### コストの内訳: キャッシュすべきはプロセスであって scan ではない

```
CLI 1 回（67 ファイル）           206 ms
  Node 起動                      ~93 ms
  oxc-parser の import             5 ms
  scan 67 ファイル                11 ms
  LSP spawn                        3 ms
  structural-equals（init+query） 105 ms

常駐した場合
  1 回目（LSP cold）              96 ms
  2 回目（LSP warm）              29 ms
  3 回目（1 ファイル再 scan 後）   23 ms   うち再 scan 0 ms
```

**利得の 96% は「プロセスと LSP セッションを生かす」ことから来る。** scan のキャッシュが買うのは 11 ms で、差分 scan は 0 ms しか買わない。**変更を検知したら全部読み直すのが最も簡単で十分速い**、という結論になる。`fs.watch` と無効化の粒度は要らない。

（この 11 ms は初回実行の値で、ウォームアップ込み。定常状態は 1.70 ms である。下の「scan のキャッシュは要らない」を参照。結論は変わらず強まる。）

#### `didOpen` は 1 ファイルなら 0 ms

§14.5 で `didOpen` を落としたのは「送るのが悪い」ではなく「**全部**送るのが悪い」だった。

```
didOpen 65 ファイル → 初回クエリ 436 ms
didOpen  1 ファイル → 送信 0 ms、クエリ 2 ms
```

そして送った内容が実際に使われることを確認した。ディスクに存在しない型をバッファ側だけに書き、そこへ解決させた。

```
ディスクのまま `total: Money`              -> plain/money.ts:2
オーバーレイ後 `total: Cash`（ディスクに無い）-> plain/order.ts:3
オーバーレイ後、旧位置で `Money` を引く      -> EMPTY（行がずれた）
```

したがって設計は「通常はディスク、バッファがあるファイルだけ `didOpen`」になる。同じ内容を scan と LSP の両方に配る必要があるので、オーバーレイは 1 か所で持つ。

#### 却下: `--server` と行区切り JSON

先に次の形を設計した。狙いはエディタでの表示であって CI ではない（CI なら CLI を直接呼べばよく、lint に組み込む理由がない）。

```
$ valof-lint --server 'src/**/*.ts'
< {"overlay":{"/abs/src/order.ts":"…編集中…"}}
> {"findings":[{"file":"src/order.ts","line":6,"column":22,"kind":"…","message":"…"}]}
```

**採らない。** 下の Worker 方式のほうが、valof 側にプロトコルもディスパッチも要求しない。ただしこの案の前提だった「エディタ拡張を作らずに済むこと」は Worker 方式でも同じで、valof-lint 自身が LSP を喋る案を却下する理由もそのまま残る。能力交渉も URI も位置エンコーディングも `publishDiagnostics` も初期化シーケンスも要らず、クライアントは自分で書くプラグイン 1 つだけである。

**`--server` はテストも速くしない。** テストが遅かったのはプロセスの起動が原因で、`--server` は境界を跨ぐための仕組みだった。テストは境界そのものを無くせる（同一プロセスで `lint()` を呼ぶ）ので出番がない。実際そうして 4.40 s → 748 ms になった。そのとき入れた `Options.types` が、下の Worker 方式でも resolver を保持する口になる。

#### 表示は oxlint が持っている

自前で凝った出力（ソース抜粋 + キャレット）を書く案は**要らない**。oxlint の既定フォーマットが miette 相当で、**プラグインの診断にも同じように効く**。

```
  x valof(findings): structural-equals: Order.lines[] holds OrderLine, which has its own equals
   ,-[src/order.ts:6:15]
 5 |
 6 | export const Order = Val.sealer<Order>();
   :               ^^^^^
   `----
```

キャレットが `Val` に当たっているのは finding が `column` を持つため。エディタの波線も同じ位置に出る。`--format` 一式（json / sarif / github / gitlab / junit / checkstyle / stylish / unix）も、端末幅と色の扱いも付いてくる。

自前で書いて勝てるのは valof-lint 単体をターミナルで叩くときだけで、そこは 1 行形式で足りている。CI ではむしろ 1 行のほうが読みやすい。

**ESLint には一般化できない。** 組み込みフォーマッタは stylish / html / json / json-with-metadata の 4 つだけで、ソース抜粋を出すものが無い（`codeframe` は ESLint 7 で本体から外れ `eslint-formatter-codeframe` になった）。

```
ESLint 既定（stylish）
  src/line.ts
    6:26  error  structural-equals: OrderLine.total holds Money, ...  valof/findings
```

`column` はどちらでも効き、エディタの波線も両方で正しい位置に出る。差は端末表示だけ。もっとも ESLint は typescript-eslint が TS 7 未対応で入口が塞がっているので、利用者にとっての実質的な経路は oxlint である。

**検証の注意。** 既定フォーマットは stdout が TTY のときだけグラフィカルになる。パイプすると `unix` 相当に落ちるので、`| grep` を挟んだまま測ると 1 行形式に見える。一度それで誤った結論を出した。`vp check` 経由の oxlint が `unix` を指定しているのも紛らわしい。pty で `-f default` を明示して確かめること。

#### プロトコルの書き方: 型定義を出す。RPC フレームワークは入れない

「型が効く RPC」を 2026-09-08 に調べた。

```
birpc           v4.2.0   deps 0    25 kB   トランスポート非依存、vitest が使う
json-rpc-2.0    v1.8.0   deps 0    58 kB
rpc-anywhere    v1.7.0   deps 1   124 kB
vscode-jsonrpc  v9.0.2   deps 0   220 kB   LSP の下回り
@trpc/server   v11.18.0  deps 0  2043 kB   HTTP 前提、トランスポート自作が要る
```

**`birpc` が明確に良い。** `post` / `on` / `serialize` / `deserialize` を渡すだけなのでトランスポートを選ばず、stdio に素直に載る。実際に子プロセスと往復させて動かし、型が効くことも誤用で確認した。

```ts
export interface Lint {
  lint(overlay: Record<string, string>): Promise<Finding[]>;
}
```

```
rpc.lint(123)          -> TS2345 引数の型
rpc.linnt({})          -> TS2551 Did you mean 'lint'?
const n: number = f[0].kind  -> TS2322 戻り値のプロパティ
```

**それでも入れない。** 理由は 3 つ。

1. **メソッドが 1 つしかない。** フレームワークの価値は「メソッド名とシグネチャの対応を型が保証する」ことで、対応させる相手が 1 つならほぼ働かない
2. **依存が配布物に乗る。** サーバ（valof-lint）とクライアント（プラグイン）の両方で要るので `dependencies` に入る。tarball 32 KB に対して 25 kB は無視できない比率で、§14.3 の「実行時依存ゼロ」とも噛み合わない
3. **型は依存なしで効く。** 型定義を export すればクライアントは `import type` するだけ。`birpc` が捕まえた 3 つのうち引数と戻り値は素の型でも捕まる。捕まらないのはメソッド名の綴り違いだけで、1 メソッドならそこは問題にならない

```ts
// `valof/lint-protocol` として型だけ出す。ディスパッチは 20 行ほど。
export type Request = { id: number; overlay?: Record<string, string> };
export type Response = { id: number; findings: Finding[] } | { id: number; error: string };
```

**乗り換える条件: メソッドが 3 つを超えたら。** `shutdown`、設定変更、部分再 lint あたりが実際に要ると分かった時点。プロトコルが JSON である限り移行は容易で、`birpc` は独自のエンベロープを使うのでワイヤ形式は変わるが、クライアントは自分で書くプラグイン 1 つなので同時に差し替えられる。

#### 採用: Worker 越しに `lint()` を直接呼ぶ

**壁はプロセスの寿命ではなく、同期と非同期だった。**

```ts
create: (context: Context) => VisitorObject     // ルール API は同期
BeforeHook = () => boolean | void               // フックも同期
export async function lint(...)                 // lint は非同期
```

`lint()` の非同期は消せない。TS 7 のバックエンドが子プロセスの LSP だからである（TS 5 / 6 の in-process 側は同期だが、7 では原理的に待つしかない）。

**Node のメインスレッドは `Atomics.wait` でブロックできる。** ブラウザでは禁止だが Node では通る。Worker で `lint()` を走らせ、ルール側が同期的に待てばよい。ESLint プラグイン界隈の定番で、`synckit`（95 kB、deps 1）や `make-synchronized`（68 kB、deps 0）がこれを提供する。最小実装で往復を確認した: 同期呼び出し 5 回で 106 ms、1 回あたり 21 ms、内訳は仕事そのもの。

**プロセスの寿命はむしろ有利。** プラグインのモジュールスコープは ESLint / oxlint プロセスと同じ寿命なので、Worker が resolver を保持したまま 23 ms で再判定できる。CLI を毎回 spawn する案（206 ms）より速く、「常駐すると結果が固まる」欠陥も、毎回走らせられるので消える。oxlint は LSP でも JS プラグインを公式にサポートする（alpha）。

`--server` と比べたとき valof 側に要るものが減る。

|          | `--server`                             | Worker                               |
| -------- | -------------------------------------- | ------------------------------------ |
| valof 側 | サーバモード、プロトコル、ディスパッチ | **`lint` の export だけ**            |
| 型       | プロトコル型を別に定義                 | 同じ TS モジュールなので自然に効く   |
| overlay  | JSON にシリアライズ                    | 構造化クローンでそのまま             |
| 依存     | なし                                   | プラグイン側に 68 kB。valof には無し |

代償は `lint` が公開 API になること。今は `src/lint/index.ts` が CLI 専用で `exports` にも無い。§14.3 の同梱の議論に「API 表面が増える」が加わる。

#### overlay は current buffer 1 枚だけ

**プラグインは「今 lint しているファイル」の内容しか持てない。** 実測した。

```
lintFiles で見えたファイル: [ 'order.ts' ]
他に開いているファイルの内容は: 見えない
```

蓄積して近似する案もあるが、**そもそも他のバッファの未保存編集を反映すべきでない。**

- lint のモデルに合う。プラグイン API が「今のファイルの内容だけ渡す」形なのはそのため
- 診断の原因が画面内に収まる。他のタブの未保存編集で目の前の診断が変わるのは追えない
- 一番欲しい反応は即座に返る。structural-equals は親に報告されるので、親に `.implEquals({ total: Money })` を書いた瞬間に消える。子の未保存編集が効かないのは実用上ほとんど困らない

したがって各ファイルの診断は「そのファイルのバッファ + 他はディスク」で計算する。overlay は 1 枚なので蓄積も `didClose` も要らず、**呼ぶたびに渡してその 1 回だけ使う**。保持しないのでライフサイクルの管理そのものが消える。

```ts
lint(files, { types: shared, overlay: { [context.filename]: context.sourceCode.text } });
```

#### 他のバッファを反映しないのは、この入口では正しい

「未保存の他バッファを見ない」が異常でないかを確かめた。**ツールがクロスファイル解析をするかで分かれ、しかも同じツールの中でも層で分かれる。**

**TypeScript の LSP は反映する。** 実測した。`order.ts` を開いてすらいないのに、`money.ts` のバッファを 2 行ずらすと `order.ts` からの解決先が動く。

```
order.ts から Money を引く（両方ディスク）      -> money.ts:2
money.ts のバッファを 2 行ずらした後           -> money.ts:4
```

型解決はクロスファイルなので、反映しなければ型エラーが嘘になる。反映が要件である。

**ESLint の LSP は反映しない。** これも実測済み（上の「単発ラップは LSP で破綻する」）。ルールがファイルローカルなので、他ファイルを渡す口が API に無い。

**rust-analyzer は層で分かれる。** native analysis（補完・go-to-definition・型表示）は未保存バッファを反映する一方、`cargo check` 由来の診断は `checkOnSave`（既定 `true`）でディスクを読む。**クロスファイル解析をするツールでありながら、重い診断はディスクベースで保存契機**という構造で、valof-lint が置かれる位置と同じである。

|                                   | 他バッファの未保存編集          |
| --------------------------------- | ------------------------------- |
| TypeScript LSP                    | 反映する（実測）                |
| rust-analyzer の native analysis  | 反映する                        |
| rust-analyzer の cargo check 診断 | **反映しない**（`checkOnSave`） |
| ESLint LSP                        | **反映しない**（実測）          |

valof-lint は性質としては TypeScript 側（クロスファイル解析）だが、入口が lint プラグインなので ESLint 側のモデルに縛られる。**渡す口が無いので、反映したくてもできない。** 選択肢は「lint プラグインを入口にして反映しない」か「自前で LSP を喋って反映する」の二択で、後者はエディタごとの拡張が要るため却下済み。前者の帰結であって欠陥ではなく、rust-analyzer の診断層に先例がある。

#### CLI との整合

**API は同じ。** CLI もプラグインも `lint(files, options)` を呼び、`overlay` を渡すかだけが違う。返るのもどちらも全ファイル分の findings で、プラグインは自分のファイルの分だけ報告する。「このファイルの分だけ返す」オプションは要らない。クロスファイル解析なので計算は全ファイル必要で、絞れるのは返す量だけである。

**意味論は非対称になる。** CLI は「全ファイルがディスク」というひとつの世界を見るが、プラグイン経由では各ファイルの診断が別々の前提で計算される。

```
order.ts の診断 = order のバッファ + 他はディスク
money.ts の診断 = money のバッファ + 他はディスク   ← 別の世界
```

診断の集合がどの単一の世界にも対応しない。**全ファイルが保存済みなら一致する**ので実用上は問題にならないが、`order.ts` に読みを書いても保存するまで `user.ts` の unused-member が消えない、という形で表面化する。README に書くとすればここ。

**N ファイル開いていれば N 回計算する。** 毎回 23 ms で全 findings を作り、プラグインは 1 ファイル分しか使わない。大きなプロジェクトで効いてきたら overlay をキーにしたキャッシュを考えるが、それは「キャッシュの固着」を持ち込むので実測してからにする。

#### 言語サーバはディスクに追随する。ただし遅れる

`didOpen` を送っていないファイルについて、書き換えてから問い直した。

```
初回（ディスクのまま）      -> money.ts@42,  money.ts@116
ディスクを書き換えた直後     -> money.ts@42,  money.ts@116   ← 古いまま
300 ms 待ってから          -> money.ts@115, money.ts@13    ← 2 行ぶんずれて追随
```

サーバが自前で監視しているので、**valof 側に watcher は要らない**。ただし保存直後に lint が走ると古い答えを掴む窓がある。素直な対処は待つことではなく、そのファイルを `didOpen` / `didChange` で送ってしまうこと。1 ファイルなら 0 ms なので確実で安い。overlay の仕組みが未保存バッファと保存直後の競合の両方を解く。

#### scan のキャッシュは要らない

`didChange` ごとに全ファイルを読み直す形を疑ったが、測ると小さい。

```
readFileSync 67 ファイル   0.59 ms
parseSync のみ             0.33 ms
scan 全部（読み+parse+walk） 1.70 ms   ← walk が支配的
```

以前「11 ms」と記録したのは初回実行で、JIT のウォームアップ込みだった。定常状態はその 1/10。lint 1 回 23 ms に対して 7% しかない。

**無効化には必ず正しさの責任が伴う。** 触っていないファイルがディスクで変わる経路（`git checkout`、フォーマッタ、生成コード）を閉じるには `didChangeWatchedFiles` か `fs.watch` が要る。1.7 ms のためにその責任を負う取引になる。§14.5 で差分 scan を捨てたのと同じ論法で、ここも捨てる。**毎回全部読み直すのは実装が最も単純で、構造的に古くならない。**

1000 ファイル規模で scan が効いてきたら再考する。それまでは測ってから。

#### やるときの順序

1. ~~オーバーレイを内部に通す~~ → 入れた（下）
2. ~~`lint` を `valof/lint` として export する~~ → 入れた。`pack.entry` に `src/lint/index.ts` を足すだけで、`exports` は `vp pack` が書く
3. ~~プラグイン~~ → 入れた（下）

~~`--server`~~ は却下。~~`column`~~ と ~~`Options.types`~~ は入れた。`--format=json` は oxlint 側が持つので valof-lint に要るかは未定。

**プラグインは valof に同梱する。** 上で「README のレシピ」としていたのを翻した。§14.3 が先に決めた「分ける条件」（リンタだけのリリースが続く / 実行時依存が漏れる / 配布物の比率）にどれも当たらず、プラグイン自身の依存は `node:worker_threads` と valof だけである。同じ理由で monorepo にもしない。flat config も `jsPlugins` もモジュール指定子を直接書くので、`eslint-plugin-` という名前は要らない。

#### プラグイン、2026-09-09 実装

`valof/eslint-plugin`。**規則は種類ごとに 1 つ**で、ホスト側で重大度を決めたり外したりできる。

```ts
// oxlint.config.ts
export default defineConfig({
  jsPlugins: ["valof/eslint-plugin"],
  extends: [valof.configs.recommended],
});
```

最初は `findings` 1 つにしていた。1 回の run が全種類を答えるので、分けると同じ仕事を 6 回すると考えたためである。**そうならない。** ホストは 1 ファイル分の規則を全部 `create` してから走査に入るので、6 つの `Program` が同じテキストに対して続けて呼ばれる。直前の 1 件だけ覚えれば済む。

```
6 規則 x 2 ファイル  →  lint() の呼び出しは 2 回
```

`skip` は落とした。ホストが規則ごとに on / off を持っているのだから、そこに二重の仕組みを足す意味がない。読むプロジェクトの指定は `settings.valof.project` に移した。規則ごとのオプションだと 6 箇所が食い違える。**両ホストとも `settings` を渡すことは実測した。**

メッセージから種類の接頭辞も外した。`valof(structural-equals): Order.total holds …` のように、ホストが規則名として出す。

**却下: `create` の順序を使って `skip` を組み立てる。** 有効な規則は `create` が呼ばれた時点で分かるので、集めておいて `Program` で「それ以外を skip」にできる。両ホストでその順序も確認した。それでも採らない。仕様として保証された順序ではないうえ、得られるのは structural-equals を切ったときの分だけで、その規則は `.implEquals` がどこにも無ければ自分で何もしない（§14.9 の `needsTypes`）。

**`make-synchronized` は入れなかった。** 68 kB・deps 0 で品質に問題は無いが、上の表で「プラグイン側の依存」と書いたのはプラグインが valof の外にいる前提だった。同梱すると valof の `dependencies` になり、§14.3 の「実行時依存ゼロ」を崩す。`Atomics.wait` + `receiveMessageOnPort` は 30 行ほどで、`SharedArrayBuffer` の版を worker が上げて notify するだけである。タイムアウト付きで待つので、worker が答えないときも 60 秒で言う。

**worker はこのファイル自身。** `new Worker(new URL(import.meta.url))` として `isMainThread` で二役を分けた。別ファイルにすると、ソースツリーでは `./worker.ts`、配布物では `./worker.mjs` になり、どちらが動いているかをコードが当てにいくことになる。

**渡し方は overlay 1 枚 + `report` 1 ファイル。** 計算はプロジェクト全体で、返るのも全部だが、報告するのは今のファイルの分だけ。`report` が先にあったのでプラグイン側に絞り込みは要らない。列は finding が 1 始まり、report が 0 始まりなので 1 引く。

**両方のホストで実測した。**

```
oxlint 1.77 + TS 7      src/order.ts:6:22 valof(findings): structural-equals: …   0.14s
ESLint 10               3:3 error unused-member: Id.shout is never read  valof/findings
```

ESLint 側は typescript-eslint が TS 7 未対応（上）なので、パーサに依存しないことを見るために `.js` の fixture で確認した。規則は AST を見ず `Program` で自分のファイル名と本文しか使わないので、ホストの API 適合はこれで足りる。

**ホストは実物を起動してテストする。** `tests/lint/hosts`。ルール API は valof が型で守れない契約で、どちらのホストも依存ではない。食い違えば形が合わないだけなので、実物を動かす以外に気づく手段がない。実際、両テストとも列の +1 とプラグインの `rules` のキー名の両方で落ちることを変異で確かめた。

- **eslint と oxlint を devDependency に固定した。** finding を突き合わせる相手の版が動かないように。§14.19 参照
- **走らせるのはソースのプラグイン。** 配布物は `vp pack` の後にしか無いので、そちらは手で確かめた

列は両ホストとも finding の位置に出た。report が 0 始まり、出力が 1 始まりで、往復して元に戻る。

**1 ファイルにつきプロジェクト 1 周する。** 検証中、`node_modules` へのシンボリックリンクを含むディレクトリを丸ごと lint させて詰まらせた。ホストが `node_modules` を除くのは既定の動作なので実プロジェクトでは起きないが、この形の代償が出る場所ではある。

**entry に名前を付けた。** パスから導くと `valof/lint/eslint-plugin` になる。設定ファイルに書く名前なので、`vite.config.ts` の `pack.entry` をオブジェクトにして `valof/eslint-plugin` と `valof/lint` にした。bin は `dist/lint-cli.mjs` に移った。tarball は 39 KB → 41 KB。

#### `Options.overlay`、2026-09-08 実装

```ts
lint(files, { overlay: new Map([["/abs/src/order.ts", "…編集中…"]]) });
```

`ReadonlyMap<string, string>`、キーは絶対パス。`files` に無いパスも走査するので、まだ保存していないファイルもそのまま渡せる。

`Resolver` には `setOverlay` ではなく `overlay(sources)` として付けた。**毎回の run で 1 度、空でも呼ぶ。** 呼び出し側が持ち回す resolver は前の run の版を握っているので、「渡さない」と「空を渡す」を区別する必要がない。

バックエンドの差は予想どおりここだけに出た。

- **LSP（TS 7）**: 初回は `didOpen`、本文が変われば版を上げて `didChange`、抜けたら `didClose`。行マップは overlay の本文から作り直す。通知は `initialize` から続く 1 本のチェーンに載せ、`resolveAll` も同じチェーンを待つ（順序が要るため）
- **in-process（TS 5 / 6）**: `getScriptVersion` を上げ、`getScriptSnapshot` が overlay を返す。`fileExists` / `readFile` も overlay を見るので、ディスクに無いファイルを他のファイルが import しても解決する

**テストは行をずらして書く。** 「spec で覆って finding を消す」形では通らない。それは scan だけで決まるので、resolver に overlay を渡さなくても緑になる（実際に一度そう書いて、変異させても落ちなかった）。ディスクと同じ本文の先頭に `//` を足して 1 行ずつずらし、finding が付いてくることを見る形にすると、`didOpen` / `didChange` / `didClose` / 行マップ破棄のどれを壊しても落ちる。

in-process 側は自動テストが無い（§14.10 の穴のまま）。TS 5.9.3 を temp に入れて `inProcess` を直接叩き、ずらした位置が同じ宣言に解決すること、overlay を渡さなければ解決しないことを手で確かめた。

### 14.19 oxlint の版を固定する、2026-09-09 実測

統合テスト（§14.9）が突き合わせる oxlint の版を、vite-plus の更新で勝手に動かしたくなかった。調べた結果、**固定できるし、設定の正本も 1 つにできる。**

#### `vp lint` はプロジェクトの oxlint を先に見る

```js
// vite-plus/dist/constants-*.js
function resolve(path) {
  return require.resolve(path, { paths: [process.cwd(), import.meta.dirname] });
}
```

cwd が先で、vite-plus 同梱は後。`oxlint@1.82.0` を devDependency に入れて `vp lint` 実行中のプロセスを拾うと 1.82.0 だった。だから **固定すればテストと `vp lint` が同じ 1 つを使う**。ずれる余地が無い。

Vitest だけは別で、`resolveBundled`（vite-plus 側優先）を使う。`vite-plus/test` が `export * from 'vitest'` する以上、ランナーと import がずれると壊れるため。

#### `vp lint` は standalone の config を読まない

```
vp lint  +  oxlint.config.ts     26 件（設定が効かない）
vp lint  +  .oxlintrc.json       26 件（JSON でも同じ）
oxlint   +  oxlint.config.ts      2 件（-c 無しでも見つける）
```

**警告は出ない。** 気づく手段が結果の差しかない。argv を捕まえると `vp lint` は `-c` を渡しておらず、代わりに `VP_RESOLVING_CONFIG_METADATA=1` で oxlint の設定元を `vite.config.ts` に切り替えている。だから通常の探索が起きない。

#### 採用: `oxlint.config.ts` を正本にして `vite.config.ts` から import する

```ts
// vite.config.ts
import lint from "./oxlint.config.ts";
export default defineConfig({ lint /* … */ });
```

```
vp lint              0 件（vite.config.ts 経由）
oxlint（-c 無し）     0 件（自分の探索）
```

`typeAware` / `typeCheck` も両経路で効く（`TS2322` と `no-floating-promises` を出すファイルで確認）。oxlint 側の `options` はこの 2 つだけで、Vite+ の `lint.options` はその素通しだった。

これで `.bin/oxlint` が実体になっても設定が割れない。エディタが `.bin/oxlint --lsp` を起動する場合、ラッパが注入していた `OXLINT_TSGOLINT_PATH` は落ちるが、1.77.0 は env 無しでも tsgolint を見つけた。

#### 規則を足す前に tsconfig、2026-09-09

`reportUnusedDisableDirectives` を入れたついでにカテゴリを総当たりした。本物の情報を持っていたのは型認識の 2 つだけで、しかも**どちらも tsconfig の穴を指していた。**

```
no-unnecessary-type-assertion   19 件   `starts[mid] as number`
no-unnecessary-condition        10 件   `const [argument] = children(…)` の後の `&& argument`
```

規則が正しい。`noUncheckedIndexedAccess` が無いので `starts[mid]` は `number`、`argument` は `Node` と見えていた。実行時にはどちらも `undefined` になり得る。**防御は正しく書いてあって、型システムだけが嘘をついていた。**

有効にした結果。

```
tsc --noEmit         エラー 1 件（意図的な unsafe cast のテスト 1 行）
2 規則               29 件 → 2 件
dist/index.d.mts     差分なし。公開宣言は変わらない
```

残った 2 件はどちらも本物だった。`(id["start"] as number) ?? (node["start"] as number)` は `as` が自分の fallback を殺しており、もう 1 件はテストの死んだ `?.` である。

**19 個の `as` は 1 つも消していない。フラグを入れて全部必要になった。**

足さなかったものと理由。`no-useless-concat`（100 桁に収める意図的な分割）、`no-array-sort`（`filter().sort()` は既に新しい配列で、`toSorted` は 2 度コピーする）、`consistent-function-scoping`、`no-undefined` / `no-non-null-assertion` / `no-async-await`（このコードベースの選択そのもの）、`prefer-readonly-parameter-types`（174 件）、`no-shadow`（2 件のうち 1 件はテストの命名慣習）。

#### エディタで確かめた、2026-09-09

`~/tmp/valof-editor-check` に oxlint 版と ESLint 版を 1 つずつ作った。どちらも **tarball から `valof` を入れた利用者と同じ形**にしてある。リポジトリの中に置くと root の `oxlint.config.ts` の `ignorePatterns` とネストした設定が絡んで、見え方が本物と変わる。

**oxlint 1.77 の LSP は JS プラグインの診断で panic する。**

```
thread '<unnamed>' panicked at crates/oxc_linter/src/fixer/disable_fix.rs:52:22:
range end index 316 out of range for slice of length 0
```

診断が 1 件も返らないまま死ぬので、エディタからは「何も出ない」に見える。CLI では出るし、LSP でも組み込み規則なら出る。**JS プラグイン + LSP の組み合わせだけ。**1.82.0 で直っている。ピンを 1.82.0 に上げた。版を 1 箇所に固定してあったので、直しはそこだけで済んだ（§14.19）。

**報告は点ではなく範囲を渡す。** finding は位置を 1 点しか持たないので、そのまま報告すると波線が 1 文字にしか掛からない。プラグイン側でその位置の語を測り、語の上なら語全体、語でなければ（disable コメントの `//`）行末までを渡す。

コアの `Finding` に終端を足す案は採らない。6 つの規則すべてが終端オフセットを持ち回ることになる一方、終端が要るのは描画だけである。1 つの finding が複数トークンにまたがるようになったら考え直す。

**メッセージは規則名を名乗らない。** 一度は入れた。Helix 25.07 のインライン診断が `message` しか描かず、`code`（`valof(unused-member)`）はホバー止まりだからである。**却下。VSCode と Zed は既定で規則名を出す**（2026-09-09 に実機で確認）。ESLint も oxlint も TypeScript も、メッセージ側は名乗らないのが慣例で、そこから外れる理由がホスト 1 つの描画では足りない。

```js
// eslint core / no-unused-vars
unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.";
```

**ESLint で TypeScript を見るには TS 6 が要る。** typescript-eslint は TS 7 の隣で起動を拒む（§14.9）。check プロジェクトの ESLint 版は `typescript@6` を入れており、Microsoft が案内する side-by-side がそのまま回避策になっている。副産物として、**そこが TS 5 / 6 の in-process バックエンドが実ホストで動く唯一の場所**になった（§14.10 の穴。自動テストはまだ無い）。

### 14.10 テストの穴、2026-09-08 棚卸し

**検証方法を先に。** カバレッジ率ではなく**変異テスト**で見る。ソースの一箇所を壊し、`ne vp test
tests/lint` が落ちるかを確かめる。落ちなければ、そこはテストが 1 行も守っていない。

```sh
cp src/lint/rules/equals/paths.ts /tmp/m.bak
perl -0pi -e 's/const found = \[path\];/const found = [path];\n  return found;/' src/lint/rules/equals/paths.ts
ne vp test tests/lint    # 通ってしまうなら未カバー
cp /tmp/m.bak src/lint/rules/equals/paths.ts
```

これで「落ちないテスト」が 3 つ見つかった。`d827e00` で塞いだのがそれ。

#### 塞いだもの、1 巡目（d827e00）

- **CLI から equals fixture を叩く。** in-process の `lint()` は毎回 `types` を渡され、CLI 側は
  `.implEquals` を持たない fixture しか触っていなかった。`index.ts` の「自前で resolver を開いて
  `finally` で閉じる」経路が一度も走っていない。
- **`ignore/not-a-block` の fixture。** ディレクティブが 3 行目に着地し finding が 4 行目だったので、
  ブロック判定を丸ごと消してもテストが通った。ディレクティブ・空行・別コメント・コードの 4 段に直した。
- **`equals/array-spec` と `equals/covered-above`。** `specPaths` の `ArrayExpression` 分岐が効くのは
  **トップレベルの配列 payload だけ**。`{ charges: [...] }` の形は `covered.add(path)` が入口で親パスを
  足すため、分岐を消しても `charges` の prefix で覆われて変異を殺せない。

#### 塞いだもの、2 巡目

- **`paths.ts` `ARRAY_LIKE`。**`equals/array` の payload に `refunds: ReadonlyArray<Money>` を足した。
  `readonly Money[]` と同じ `charges[]` / `refunds[]` に落ちる。
- **`chains.ts` `fromVal` の namespace 形。**`valof.Val.sealer<User>().impl({…})` の fixture を足した
  （今は `bindings/namespaced-value`、§14.13）。
- **`cli.ts` の `--help` / `-h`。**description とパディングを込みで見る。
- **`cli.ts` の oxc-parser 未導入の案内。**`--import tests/lint/no-oxc-parser.ts` が resolve フックで
  `oxc-parser` だけ `ERR_MODULE_NOT_FOUND` にする。パーサが入っている機械で、入っていない機械の出口を通せる。
- **`needsTypes` と `--no-structural-equals`。**resolver をスパイに差し替え、聞かれた query 数を数える。
  `[]` を見るだけだった 2 つのテストが、これで主張どおりのものを観測する。
- **`equals/covered/order.ts` の TS1361。**`import type { Money }` を値の import に直した。

#### 残っている穴（変異で確認済み）

| 箇所                               | 内容                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| `unused.ts` `declaredName`         | `export { A as B }` の**連鎖**。1 ホップは `re-export` で覆えている |
| `directives.ts` `widen`            | 1 ブロックに 2 つのディレクティブ、「空集合が全 kind に勝つ」       |
| `equals/index.ts`                  | 1 つの alias に 2 つの chain、「最初が勝つ」                        |
| `directives.ts` `joins` の trim 節 | コメント間に**コード**が挟まる場合。空行の方は塞いだ                |

#### 残っている穴（コード読み）

| 箇所                      | 内容                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `typecheck/in-process.ts` | TS5/6 バックエンド。開発機は TS 7.0.2 なので `overLsp` が選ばれ、**丸ごと走らない**。CI に TS5/6 を入れるかとセット（§10.1） |
| `paths.ts` payload walk   | `TSTupleType` / `TSUnionType` / `TSIntersectionType` / `TSOptionalType`                                                      |
| `unused.ts`               | 「同名 companion への read は両方に credit される」意図的な過剰近似                                                          |
| `duplicate-brand.ts`      | 同一ファイル内の衝突、3 つ以上の衝突                                                                                         |
| `index.ts` の sort        | 同一 file/line/column での kind によるタイブレーク                                                                           |
| `cli.ts` の引数解析       | `--no-` の複数指定。in-process 側は覆えている                                                                                |

#### 冗長

`cli()` の spawn は 9 回から 10 回。`[cli().status, cli().stdout]` の 2 回 lint と `dead-member` の
2 テストを畳んで 2 回減り、`--help` / `-h` / パーサ不在で 3 回増えた。

`equals/covered` と `equals/excluded` は `specPaths` 上は同じ経路。**これは残す。**「値が何であれエントリ
があれば覆う」という意図の記録になっている。

#### 未決: fixture を型検査するか

`tsconfig.json` は `exclude: ["tests/lint/**/fixtures"]`。外すと **112 errors**。内訳が判断を分ける。

|                      | エラー                   |
| -------------------- | ------------------------ |
| `structural-equals/` | **0**（TS1361 は直した） |
| `mixed/`             | 1                        |
| `unused-member/`     | 73                       |
| `ignore/`            | 21                       |
| `duplicate-brand/`   | 16                       |

structural-equals は go-to-definition が解決しないと成立しないので最初から realistic に書くしかなく、ほぼ通る。
**`tests/lint/rules/structural-equals/fixtures/tsconfig.json` を置いてそのサブツリーだけ検査する案が有力。**残りは除外のまま。

**却下: `unused-member/` `ignore/` `duplicate-brand/` も通す。**

- 型検査を通らないことが要件の fixture がある。`unused-member/builtins` は「`.impl` が型レベルで拒む入力」が
  被写体。`bindings/shadowed-type` と `no-cross-file-credit/reader.ts` の `./elsewhere.ts`、
  `unused-member/foreign-impl` の `some-other-library` は**存在しないこと**が眼目。
- `noUnusedLocals` が unused-member ルールの被写体（誰も読まない companion）を叩く。TS6133 が 12 件。
- 通すには `Val` の import、payload 型、`user` / `id` の宣言、引数の型注釈が要り、6 行の fixture が倍以上に
  なる。効いている 3 行が埋もれる。
- fixture が本物の `EqImpl` / `Sealer` を満たす必要が出て、equality 設計（§5）を触ると無関係な lint の
  fixture が落ちる。

**却下: `as any` で通す。**`(Val.sealer<User>() as any).impl({…})` は `rootPath` が `TSAsExpression` を
辿れず `fromVal` が false を返し、companion site として認識されない。findings が 0 件になり、期待値を
`[]` に書き換えれば「通る」が、それは落ちないテストそのもの。実測で確認した。

**却下: `@ts-expect-error` を貼って回る。**TS6133 も含めて確かに黙る。だが `@ts-expect-error` は抑制では
なく**逆向きのアサーション**で、不要になると TS2578（`Unused '@ts-expect-error' directive`）で落ちる。
110 行に貼れば「この fixture は壊れている」という主張が 110 個立ち、型検査から得たいもの（`implEquals([Money])`
が正当な形か）の正反対になる。

**却下: `@ts-nocheck`。**TS2578 の churn は避けられるが、その行以下は検査されない。`exclude` をファイル
ごとに散らして見えにくくしただけ。

**却下: 緩い fixture 用 tsconfig。**`strict: false` にすると `Val` 自体が壊れる
（`Type 'Money' does not satisfy the constraint 'AnyVal'` が 24 件）。緩いプロジェクトは成立しない。

#### 着手順の目安

次は `declaredName` の連鎖、`directives.ts` の `widen` と `joins`、`equals/index.ts` の「最初が勝つ」。
どれも変異で穴だと確認済みで、fixture 1 つずつで塞がる。`in-process.ts` は CI に TS5/6 を入れるかの話
なので別枠。

### 14.11 テストの置き場所、2026-09-08

fixture とテストを離すと、1 本読むたびに別の木へ飛ぶ。§14.10 の作業は「穴 1 つ = fixture 1 つ + テスト 1 本」なので、この往復が一番多い。コロケーションにした。

```
tests/lint/
  support.ts          fixtures() / spy() / cli()
  no-oxc-parser.ts    --import で渡す resolve フック
  rules/
    unused-member/      {fixtures/, index.test.ts}
    duplicate-brand/    …
    structural-equals/  …
  bindings/ …    §14.13 で追加
  ignore/   …
  skip/     …    fixture は mixed/
  command/  …
```

**`tests/lint/` は `src/lint/` を映す。** ルールは `rules/` にまとめ、ディレクトリ名は**ルール種別そのもの**にした（`brand/` ではなく `duplicate-brand/`）。冗長だが、期待値の文字列と `--help` の一覧と一字一致する。横断機構 4 つは上の階層に残した。`ignore/` は `scan/directives.ts`、`bindings/` は `scan/bindings.ts` に当たるが、`ignore` と `skip` は**利用者から見た機能**の名前で、`directives` はどこにも露出しない。ルールだけは名前が `--help` に出るので、ソースの構造と利用者の語彙が一致する。

**境界はルール 3 つ + 横断機構 4 つ。** 元の `turning a rule off` には性質の違う 3 つが同居していた。API の `skip`、CLI の `--no-` 解析、そして「TypeScript を起こさない」という費用の主張。前 2 つを `skip/` に、費用は `equals/` に移した。`skip/` は**何が報告されるか**、`equals/` は**何を払うか**を見る。

**fixture の重複は許す。** `command/` は出力の形が被写体なので、finding 1 件・0 件・`implEquals` ありの 3 つを自前で持つ。

**describe は撤去。** ディレクトリが主語になるので `describe("duplicate brands")` はパスの繰り返し。テスト名は元から単独で文になっている。`rules/unused-member/` だけ 2 つ残した。`what name resolution cannot reach`（`computed-key` と `spread`）は「意図して見ない」の記録で、見つける側と並べる意味がある。

**単一ファイルの fixture はフォルダを畳む。** `dead-member/a.ts` → `dead-member.ts`。`a.ts` は何を試しているかを 1 文字も語らない。複数ファイルのものは `billing.ts` / `orders.ts` のように中身で名づける。finding は `fixtures/` からの相対パスで出すので、期待値の 1 行目が自分の見ている fixture を名乗る。

**resolver を持つのは `rules/structural-equals/` だけ。** どのテストが language server を要るかがレイアウトに出る。

以前は `unused/` も持っていた。`builder-chain` が `.implEquals` を書いていたためで、そこを観測するテストは 1 本もなかった。ステップを 2 つ（`implSeal` と `fixed`）残して `.implEquals` だけ落とし、抜けた分は `equals/plain` の chain にステップを足して受けた。変異で両方を確認した。

- `rootPath` が呼び出しステップを 1 段しか降りない → `unused/builder-chain` だけが赤（58 本中 1 本）
- `readChain` の walk が引数なしのステップ（`fixed<"id">()`）で止まる → `equals/plain` が赤。`covered` のような `[]` を期待する fixture では site ごと消えて緑のままなので、**finding を出す側**の fixture でしか押さえられない

**設定は 3 箇所。** `vite.config.ts` の lint / fmt `ignorePatterns` が `tests/lint/**/fixtures/**`、`tsconfig.json` の `exclude` が `tests/lint/**/fixtures`（`rules/` を挟んだ時に `*/` では届かなくなった）。fixture に型エラーと崩れた整形を入れて `vp check` が黙ることを確認した。ここを間違えると fixture が検査に入る。

**自己 lint は消した。** 引数なしの `cli()` が `src/**/*.ts` を lint し、`command/` に「finding は 0 件」という 1 本があった。まず `command/`（被写体は出力の形）から出して `self.test.ts` にしたが、そもそも赤になる道がない。`src/` の `Val.sealer` / `Val.companion` は全部コメントと文字列で、実際の使用は 0 件。`src/val.ts` は `Val` を実装している側なので自分を呼ばない。**このリポジトリで valof をドメインロジックに使う日が来るまで、この主張は空。** 手で使用を足せば赤くなるが、それは変異ではなく別のリポジトリを作る作業。

`src/` で valof を使い始めたら戻す先は `tests/lint/self.test.ts`。`vite.config.ts` のタスクにする案は却下、`vp run size` と同じで回し忘れる。

**ルール一覧を名乗るのは `--help` だけ。** `skip/` の `--no-typo` のエラーは `kinds` をレジストリから読んで組む。以前は 3 つのリテラルで、`--help` と 2 箇所が同じ列挙を持っていた。§14.12 の `brand-mismatch` を足したとき赤くなるのは 1 箇所。メッセージの形（前置き、字下げ、`, ` 区切り）は変異で赤を確認済み。

**却下: 1 ファイルのまま describe を増やす。** fixture との距離が縮まらない。

**却下: `command/` から他家族の fixture を参照する。** 重複はゼロになるが、コロケーションが 1 ファイルだけ崩れる。5 行の重複を取った。

**却下: フックを `.js` のまま置く。** `--import` も type stripping を通るので `.ts` で動く。`.js` の理由になっていた「型検査から外れる」は、裏返すとリポジトリで 1 ファイルだけ検査から漏れるという話だった。

**`module.registerHooks` に移した。** `register()` は非推奨（@types/node 26 が `@deprecated Use module.registerHooks() instead` を出す）。`registerHooks` は同スレッド同期で、フックを**関数のまま**受ける。`data:` URL に本体を文字列で埋める必要がなくなり、本体にも型が付いた。1 ファイルのまま。変異で確認: 見張る specifier を変えると `command/` の「asks for oxc-parser」が赤。

### 14.12 規則: 型名と一致しないブランド、2026-09-08

**入れる。** `brand-mismatch`。ブランドの最後の `/` 以降が型名と一致しなければ報告する。既定で on。

```
判定  brand.slice(brand.lastIndexOf("/") + 1) === alias
```

```ts
type UserId = Val<"UserId", string>; // 通る
type BillingId = Val<"billing/BillingId", string>; // 通る。/ 以前は見ない
type EmailAddress = Val<"Email", string>; // 報告
```

#### 根拠: ブランドは言語が強制する重複

`type X = Val<...>` から TypeScript は「これは `X` という名前だ」を導けない。だからブランド文字列は
**型名を人間がもう一度書かされているだけ**で、情報を増やしていない。

「事実は正典の場所に一度だけ書く」がここだけ守れない。守れないなら 2 つが食い違わないことを保証する
のは lint しかない。既存 3 つと同じ「一致すべき 2 つの食い違い」の検出であり、スタイル規則ではない。

リネームで顕在化する。LSP のリネームは文字列リテラルを書き換えないので、`OrderId` →
`PurchaseOrderId` にするとブランドは `"OrderId"` のまま残る。コンパイラは永久に気づかない。代償は
エラーメッセージで、読み手が「なぜ」を読む一番深い行が実在しない型名を指す。

```
Type 'PurchaseOrderId' is not assignable to type 'UserId'.
      Type '"OrderId"' is not assignable to type '"UserId"'.   <- ここ
```

#### 根拠: README が既にそう言っている

> **Name the brand after the type it brands.**

規則は新しい規約を作らない。**既にある規約を機械が守るだけ。**既定で on にする根拠もこれ。

#### 根拠: ブランドを選べること自体が思考コスト

`type EmailAddress = Val<"Email", string>` を正当と認めた瞬間、「どこまでの略記を許すか」という判断が
利用者に戻る。それが払わせたくないコストなので、認めない。移行中の `UserV2` も同じで、別の型なら
別のブランドを持つべき。**誤検知は実質ない。**非リテラルのブランドと `Val` でないものは、
duplicate-brand と同じ `original(bound, typeName) !== "Val"` ガードで落ちる。

#### 却下: 型名と名前空間を混ぜる二本立て

`type BillingId = Val<"billing/Id">` を通すために「最後のセグメント一致、または全セグメントの
PascalCase 連結一致」を検討した。**通す理由がない。**型名を `BillingId` にしたならブランドも
`"billing/BillingId"` にすればよい。名前空間と型名は直交していて、混ぜる必要がなかった。

「型名がブランド末尾で終わればよい」（`BillingId`.endsWith(`Id`)）も却下。`type UserId = Val<"Id">`
が通ってしまい、規則の目的が消える。

#### 却下: `/` 以前にも規約を作る、名前空間を既定で推奨する

**`/` 以前は見ない。**そこに規約を作らない理由は 2 つ。

1. **跨ぎの衝突は実質 monorepo だけ。** valof はライブラリ構築を推奨しない（README の Caveats）。
   monorepo なら全ディレクトリに scan をかければ duplicate-brand がそのまま見る。brand 系の規則は
   resolver を使わないので、対象を広げる costs は scan だけ。
2. **何を前置きにするかはプロジェクト構成に依存する。** 規約にできない。

副産物として、**問題が起きるまで思考コストを払わなくてよい。**名前空間は要らないうちは書かない。
`UserId` が 2 つできて duplicate-brand が鳴ってから、そのとき初めて分け方を考える。

これに伴い §2.1 の「`"app/User"` のように名前空間を付ける命名規約を推奨する」を改めた。README
（`Id` in two domains of a monorepo）が最初から monorepo 限定で書いていて、§2.1 だけが一般的な推奨に
なっていた。

#### メッセージは直し方を名指しする

正解が機械的に導けるので、既存 3 つにできないことができる。

```
EmailAddress claims the brand "Email", which should be "EmailAddress"
BillingId claims the brand "billing/Id", which should be "billing/BillingId"
```

`Id claims the brand "Id", and so does another type` と同じ構文で、後半だけが「どうすべきか」になる。

#### 実装

`BrandClaim` が既に `alias` / `brand` / 位置を持つ。`Rule` オブジェクト 1 つと `RULES` への 1 行だけで、
`Scan` に足すものも resolver も要らない（§14.8）。バンドル予算は無関係。`scripts/size.ts` が測るのは
`dist/index.mjs` だけで lint は入らない。

**2026-09-08 実装。`rules/brands.ts` を `duplicate.ts` と `mismatch.ts` に割った。**1 ファイルに 2 つ置くと
実装関数の名前が衝突する。§14.8 の「どのファイルでも `findings`」は 1 ファイル 1 ルールを前提にしていた。
ファイル名は `unused.ts` / `equals/` と同じで、種別の中の区別する語だけを取る。

**既存の fixture が 7 つ違反した。**duplicate-brand を観測する fixture は `OrderId = Val<"Id">` の形で、
ブランドの重複と型名の不一致を同時に持っていた。別名を `Id` に揃えて直した。2 つのファイルが同じ
`Id` を宣言する形になり、README が言う monorepo の例そのものになる。`namespaced` だけはブランドを
`"orders/OrderId"` にした。

**変異で 3 つ確認した。**`Val` ガードの除去は `bindings/not-a-val` が、最後のセグメントではなく全体を
比べるのは `duplicate-brand/namespaced` が、メッセージから名前空間を落とすのは新しい `namespaced.ts` が
赤くなる。

---

## 15. v2 候補

### 14.14 規則: 欠けている disable コメント、2026-09-08

**入れる。**`incomplete-disable`（2026-09-08 に `bare-disable` から改名、§14.18）。指示がルールを 1 つも挙げていなければ報告する。
既定で on。

#### 根拠: 黙らせる範囲が本人の決定を離れる

裸の指示は次の行の**全ルール**を黙らせる。後から足したルールも含む。`brand-mismatch` を足した日に、
`unused-member` のつもりで書かれた裸の指示が黙って範囲を広げた。書いた人は何も決めていない。

#### 却下: CLI を落とす（exit 2）

`--no-typo` と同じ「走れなかった」の扱いにする案。**往復が 1 回増える。**裸のコメントを直すまで
他のルールの findings が出ない。直すものが 2 つあるとき、2 回走らせることになる。位置つきの finding
なら 1 回で全部見える。エディタ統合（§14.9）にもそのまま乗る。

**メッセージだけ exit 2 案から取った。**`--no-typo` が「知っているルールはこれだ」と言うのと同じ命令形。

```
valof-lint-disable-next-line names no rule; name the ones it silences
```

**ルール名は列挙しない。**`kinds` を読むには規則が `rules/index.ts` を import することになり、
レジストリと規則の依存が循環する（§14.8 は「呼び出し側にルールの知識を置かない」の逆向き）。
一覧を名乗るのは `--help` だけという §14.11 の線もそのまま保つ。

#### 却下: 裸の指示を無効にする

報告せず、単に何も黙らせない案。実装は一番小さいが、**なぜ finding が復活したのか読み手に伝わらない。**

報告した上で**黙らせ続ける**。行の下は書いた人が望んだとおりに書かれていて、ここで指示を無効にすると
本来の finding が裸の指示の下に埋もれる。

#### 一行に複数のルール

`// valof-lint-disable-next-line duplicate-brand brand-mismatch`。**元から動いていた。**`directive()` の
分割が `/[\s,]+/` なので、空白でもカンマでも区切れる。テストも README も無く、変異（先頭 1 つだけ取る /
空白だけで割る / カンマだけで割る）でどれも赤にならなかった。fixture 1 つ（`ignore/two-kinds`）で 3 つとも
赤になる。`--help` の例も 1 つだけ挙げていたので 2 つに変えた。

#### 実装

`Scan.bare: Where[]` を足した。`disabled` は「行 → 種別」で、キーが**指示の次の行**なので指示自身の位置を
持たない。`disabledLines` が両方を返す。

**効いている指示だけを見る。**コードの後ろに書かれた指示（`ownLine` が false）は何も黙らせないので、
言うことがない。`ignore/after-code` が緑のままであることがそれを守る。

**自分を黙らせられない。**finding は指示の行に、指示が黙らせるのは次の行に出るので、裸の指示が自分の
報告を消すことはない。

**2026-09-08 訂正。**「名指しの `// valof-lint-disable-next-line bare-disable` でなら消せる」と書いたが、
消せていたのは**バグのおかげ**だった。`byLine.set(blockEnd + 1, kinds)` をコメントごとに書き直していたため、
ブロックの途中の行（＝次のコメントの行）にエントリが残っていた。§14.15 でブロック単位に組み直したときに
消えた。指示についての finding を黙らせる手段は `--no-<kind>` だけになる。

### 14.15 規則: 効いていない disable コメント、2026-09-08

**入れる。**`unused-disable`。指示が挙げた名前のうち、その行で何も黙らせなかったものを報告する。
既定で on。

```
valof-lint-disable-next-line names unused-member, which reports nothing here
```

**名前ごとに 1 件。**`unused-member, duplicate-brand` の片方だけが働いているとき、どちらを消せばよいかを
finding が名乗る。裸の指示は対象外で、`incomplete-disable` に任せる。名指しする名前がなく、求める修正も同じ。

#### 他のルールの findings が要る

これだけは `Scan` から決まらない。「この指示は何かを黙らせたか」は他のルールが何を報告したかの関数で、
`run(scans, context)` からは見えなかった。**`Context` を 2 つ広げた。**

```ts
reported: readonly Located[];      // 前のルールが報告したもの、黙らされる前
notRun: ReadonlySet<string>;       // 報告できなかった kind
```

`RULES` の順が実行順であることに、初めて意味が生まれる。このルールは**最後に置く**。

**`notRun` は `--no-<kind>` だけ。**外したルールは指示を「効いていない」ように見せるが、指示のせいではない。

**残る誤検知は glob。**duplicate-brand は相方のファイルが同じ run に要る。1 ファイルずつ lint すると、
プロジェクト全体では働いている指示を報告する。README に書いた。

#### TypeScript が無ければ走らない

最初は「TS の無いプロジェクトの `structural-equals`」も誤検知の一つとして扱い、`types()` をルールごとに
包んで「聞いて `undefined` が返った kind」を `notRun` に足していた。**やめた。**`resolver()` が
`undefined` を返す経路そのものを消し、投げるようにした（`code: ERR_NO_TYPESCRIPT`）。CLI が受けて exit 2。

- **Val を書く人で TypeScript を持たない人はいない。**「無い」は支援すべき構成ではなく壊れたインストール
- **黙って何も報告しないのが一番悪い。**クリーンな run と見分けが付かない
- **分岐が 3 つ消えた。**`Context.types` の `Resolver | undefined`、equals ルールの `if (!resolver) return []`、
  runner の per-rule ラッパ。`Options.types` の `null` も要らなくなった

**確認は起動時、1 回。**最初はルールが名前解決を求めたときに投げる形にした。**やめた。**落ちるかどうかが
「今このファイル群に `.implEquals` があるか」で決まる。`.implEquals` を 1 つ足した日に、TS の無い機械の CI が
初めて落ちる。`--no-structural-equals` でも要求する。

**確認は起動ではない。**`require.resolve` するだけで、language server は今までどおりルールに聞かれるまで
起動しない。§14.8 の 212 ms → 109 ms は保たれる。

テストは `tests/lint/no-typescript.ts`。`no-oxc-parser.ts` と同じ `module.registerHooks` の resolve フックで、
`typescript` の解決だけを失敗させる。TS のある機械から、無い機械の出口を通せる。

#### 実装: `Scan.disabled` / `Scan.bare` → `Scan.directives`

指示 1 つを `{ line, column, covers, kinds }` にした。`disabled`（行 → 種別）は `silences()` で導出する。

**ブロック単位に組み直した。**以前はコメントごとに `byLine.set(blockEnd + 1, kinds)` を呼び、ブロックが
伸びるたびに書き直していた。**途中の行のエントリが残る。**行の下ではなくブロックの中を指す幽霊で、
`unused-disable` はそれを「効いている指示」と読んでしまう。ブロックを閉じるときに一度だけ書く形にした
（§14.14 の訂正も参照）。

#### ファイル名を kind に揃えた

`unused.ts` の隣に `unused-disable.ts` が並ぶのが読めない。`rules/` を `unused-member.ts` /
`duplicate-brand.ts` / `brand-mismatch.ts` / `incomplete-disable.ts` / `unused-disable.ts` /
`structural-equals/` にした。`tests/lint/rules/` が §14.11 で採った並びと同じで、`--help` の語彙とも一致する。

### 14.16 ファイル全体の disable、2026-09-08

**綴りにスコープを必ず出す。**4 つ。

```
// valof-lint-disable-next-line unused-member       行
// valof-lint-disable-whole-file unused-member      ファイル
// valof-lint-disable-all-whole-file                ファイル、全ルール
// valof-lint-disable ...                           スコープ無し = 誤り。何も黙らせず報告する
```

`-all` の位置がスコープの前なので、行単位の `-all` が欲しくなれば
`valof-lint-disable-all-next-line` が空いている。**今は入れない。**行で「全部」を欲しがる場面が無い。

#### 却下: 裸の `valof-lint-disable` をファイル全体の意味にする

最初はこれで実装した。ESLint の `/* eslint-disable */` に倣う形。**やめた。**行の綴りから
`-next-line` を落としただけの形なので、書いた人がスコープを意識しない。しかも裸なら全ルールを
黙らせるので、**自分についての `incomplete-disable` も黙る**。書いた人は何も知らされない。

#### 「名前を挙げない」の意味がスコープで違う

ここだけ非対称で、理由がある。

- **行**: 全部黙らせて、かつ報告する（§14.14）。黙らせるのをやめると、本来の finding が指示の下に埋もれる
- **ファイル**: 何も黙らせずに報告する。黙らせると**その報告自体が消える**。ファイルを丸ごと外すのは
  `-all-whole-file` という別の綴りの仕事

`-all-whole-file` は自分についての finding も黙らせる。ファイルを run から外すとはそういうことなので、
特例ではない。**副作用として `incomplete-disable` の `-all` 除外ガードは観測できない。**外しても赤にならないので、
コードにコメントで記録した（CLAUDE.md「落とせないならコメントが唯一の記録」）。

#### 実装

`Directive` に `spelling` を持たせ、`covers: number | "file"` と分けた。「何を黙らせるか」は
`effect()` が綴りと名前から決める。**「空集合＝全種」の約束をやめた**（`Silenced = ReadonlySet | "every"`）。
スコープで意味が割れた以上、空集合に 2 つの意味を持たせられない。

`silences()` は Map ではなく述語を返す。ファイル全体と行の 2 段を呼び出し側で組み立てさせない。

**綴りの後ろには空白以外を許さない**（`(?![-\w])`）。`valof-lint-disable-nextline` のような打ち間違いが
「ファイル全体を黙らせる指示」に化ける道を塞ぐ。fixture `ignore/misspelled` が守る。

### 14.17 `--no-<kind>` を受けない規則、2026-09-08

`incomplete-disable` と `unused-disable` は `--no-` で外せない。`Rule` に `always?: true` を足した。

**理由。**「黙らせたことについての報告」を切るスイッチは、**全部黙らせて何も聞かない**手段になる。
2 つはまさにそれを防ぐために在るので、自分を外す口を持ってはならない。

逃げ道はファイル側にだけ残る。`valof-lint-disable-all-whole-file` は自分についての finding も含めて
そのファイルを外す。グローバルなスイッチと違い、**そのファイルに書いてあり、grep できる。**

**代償。**`unused-disable` の glob 由来の誤検知（1 ファイルずつ lint すると相方の居ない duplicate-brand の
指示が「効いていない」と出る）に、全体スイッチが無くなった。逃げ道はそのファイルの `-all-whole-file` だけ。
再検討するなら `unused-disable` から `always` を外す。

**解いた、2026-09-08。読む集合と報告する集合を引数で分ける。**

```
valof-lint src src/billing/id.ts                         第 1 引数がプロジェクト、以降が報告対象
valof-lint --report-on src/billing/id.ts --project src   名前で渡せば順序は自由
valof-lint src                                           報告対象を省けばプロジェクト全体
valof-lint 'src/**/*.ts' '!src/generated/**'             ! で除外
```

一度は「運用で解く、直すのはエディタ統合と同時」と書いた。**利用者がいないという理由が消えた。**
lint-staged がそれで、末尾にパスを足す道具なので位置引数が報告対象であるほうが噛み合う。

**第 1 引数は glob かディレクトリでなければエラー。**`valof-lint one.ts` が書けなくなる。単一ファイル実行
こそ 3 規則が誤答する形なので、引数で不可能にする。`--project` フラグだけを足す案（位置引数は全部報告対象）
も動いたが、**プロジェクトを渡し忘れた形が黙って通る。**

**ディレクトリを受けると方針を 2 つ持つことになる。**`<dir>/**/*.{ts,tsx,mts,cts}`、`node_modules` は除外。
今までは glob が全部決めていた。`valof-lint .` が `node_modules` を歩く事故が実在するので除外は要る。
fixture `project/pkg/node_modules/dep.ts` が守る（除外を消すと赤）。

`Options.report` は解決済みパスの集合。`lint()` は silencing と同じ最後の filter で落とす。**scan は
`project ∪ 位置引数`。**プロジェクトの glob が拾わない新規ファイルを報告対象に渡したとき、それを読まずに
「何も無い」と言わないため。fixture `project/outside/fresh.ts` が守る（union を消すと赤）。

**除外を `!` で足した、2026-09-09。** どちらの集合も最初から複数書けたが（`--project` も位置引数も配列に貯めている）、除外だけが無かった。`!` で始まるパスは project でも報告対象でもなく除外に集め、**展開してから両方の集合から引く。**

走査からも消えるので、除外したファイルが持っていた別名や読みは他のファイルの答えに効かなくなる。生成コードを外したいという要求はそれ自体なので、これで正しい。「見はするが報告しない」が要るなら報告側だけ引く形に変えられるが、要求が出るまで持たない。

glob マッチャは要らない。`expand("src/generated/**")` の結果を引き算するだけで、除外のパスは正のパスと同じ意味論で解決される。

**`--target` を `--report-on` に改名した、2026-09-09。** 内部 API が `Options.report` と呼んでいるものが CLI で `--target` になっていて、同じものに 2 つの綴りがあった。ヘルプ本文も元から "what the run reports on" と書いている。

却下した名前。`--files`（project も files である）、`--only`（「これだけ lint する」と読める。走査を絞ると答えが変わるという、この設計が一番避けたい誤解）、`--report`（1 語で済み、`--format` が形式フラグの慣用なので衝突は薄いと実測した。それでも `--report-on` のほうが動詞と前置詞が揃って読みやすいという判断）。`v0.4.0` に `bin` が無く未リリースなので改名は無料だった。

リンタが「run が完全か」を推測する案は採らない。判定できないものを推測させると、本当に効いていない指示を
見逃す側に倒れる。**どこまでが自分のプロジェクトかは利用者が知っていて、引数で言える。**

エディタ統合（§14.9）が要求するのも同じ形で、プラグインは `lint()` にプロジェクト全体を渡し、今開いている
ファイルだけを報告対象にする。

`-all-whole-file` を付けたファイルはこれに当たらない。run には入っていて、他のファイルの finding の根拠と
して数えられ、自分だけが報告されない。指示は報告を消すのであって事実を消さない。

**実装。**`lint()` は skip 集合を `isSkippable` で濾すだけ（ルール固有の分岐なし）。CLI は `--no-` に
別のメッセージを返す。`--help` の「Leave a rule out of the run, but not …」もレジストリから組む。

### 14.18 指示についての規則の見せ方、2026-09-08

**内部は Rule のまま、`--help` で 2 群に分ける。**

```
Reports what the type checker cannot:
  unused-member       …
  duplicate-brand     …
  brand-mismatch      …
  structural-equals   …

And about the disable comments themselves, which always run:
  incomplete-disable  …
  unused-disable      …
```

利用者から見て 2 つは他の 4 つと性質が違う。**コードではなくコメントについての指摘**で、行では黙らせられず、
`--no-` も受けない（§14.17）。違和感の正体は名前ではなく**同じ列に並んでいること**なので、並べ方で解いた。

**改名。**`bare-disable` → `incomplete-disable`。「ルールを挙げていない」と「スコープを挙げていない」を
1 語で言える。`unused-disable`（欠けてはいないが効いていない）と対になる。

#### 他のリンタの線引き（oxlint 1.77.0 で実測）

```
a.js:1:1: warning: Unused oxlint-disable directive (no problems were reported).
```

**ルール ID が付かない。**リンタ自身の診断で、`--report-unused-disable-directives` で入れる既定 off。
裸の `/* oxlint-disable */` は報告しない。それを咎めるのは `eslint-plugin-eslint-comments` の
`no-unlimited-disable` という**プラグインのルール**で、ID を持つ。**業界の線引きは「unused = 診断、
unlimited = ルール」**で、うちの 2 つは両方にまたがる。

#### 却下: kind を 1 つ（`disable-comment`）に統合

名前としては正直だが、**直し方の違う 2 つの欠陥が 1 語に潰れる**（名前を挙げる / 指示を消す）。

#### 却下: ESLint に倣って列を空にする

kind を出力から外す案。**印字側にルール固有の分岐が入る**（§14.8 が消した種類のもの）。ID が無いので
検索の手掛かりも減る。既定 off にする案も採らない。既定 on は §14.14 / §14.15 の判断。

### 14.13 `Val` の綴りを 1 箇所に、2026-09-08

「`Val` をどう綴っても認識する」は 3 箇所が依存する共有の事実。`brands.ts:41`（型位置）、`aliases.ts:76`
（型位置、equals のエイリアス収集）、`chains.ts` `fromVal`（値位置）。記録がルール別のディレクトリに散っていた
ので `bindings/` に集めた（`src/lint/scan/bindings.ts` に対応）。

移したもの: `brand/` から `renamed-val` / `namespaced-val` / `shadowed-val` / `not-a-val`、`unused/` から
`namespaced-val`。名前は位置を名乗るように変えた（`renamed-type` / `namespaced-value`）。

**集めて 2 つ穴が出た。** どちらも fixture 1 つで塞がり、変異で赤を確認した。

- **値位置でリネームした `Val`。**`import { Val as V }` + `V.sealer<User>()`。`fromVal` の
  `original(bound, first)` を通る唯一の形が未カバーだった。→ `renamed-value.ts`
- **namespace import ではない修飾子。**`other.Val<"Id", string>`。`valName` の `namespaces.has` を消しても
  `namespaced-type` は緑のまま（右側が `Val` なので通ってしまう）。ガードを守るのは**落ちる側**の fixture
  だけ。→ `not-a-namespace/`

**期待値は 2 ルールにまたがる。** 型位置は `duplicate-brand`、値位置は `unused-member`。ルールの名前が付いて
いないディレクトリに両方が並ぶこと自体が「これはルールの話ではない」と言っている。被写体は結合の解決で、
finding は**それを最も安く観測できるルール**のもの。

**却下: `unused/` のリネーム追跡も動かす。** `renamed-import` / `re-export` / `same-name` /
`no-cross-file-credit` が叩くのは `unused.ts` の `exportedAs` → `declaredName`。unused の中にしかなく、
他のルールは呼ばない。共有機構ではなくルールの機能なので `unused/` に残す。

### 15.1 `Val.trait`

2026-09-03 に提起。v1 ではなく v2 向け。

**欠けているもの。** companion の関数は自分の Val に固定されるので、`SuperUser` が `PayloadOf<User>` から作られていても `User.greet(superUser)` は弾かれる。2 つの Val が共有する振る舞いは、構造的な型に対する普通の export 関数にするしかない。それで動くが、valof の中で companion の形の居場所を持たない唯一のものになる。

実測: 第 1 引数を広く注釈すると `.impl` の中でも型チェックは_通る_（`greet(u: Named)` はパラメータの反変性により `(value: User) => unknown` に代入できる）。`User.greet(superUser)` もコンパイルできる。ただしパターンとしては却下した。ある型の companion を通して別の型を操作することになり、文脈型付けも失われる。

**スケッチ。** `Val.trait<Shape>().impl({...})`。第 1 引数に文脈型付けを与え、関数をまとめる名前空間になる。

作る前に決めること:

- `equals` / `patch` / `update` を持たせてはならない。ブランドも seal もない以上、作り直す対象が存在しない。既定を足さない `attach` の変種が要る
- Shape には `DeepReadonly` を適用する必要がある。さもないと配列フィールドを持つ Val が一致しなくなる
- 「trait」は型ごとの実装を含意するが、これは構造的制約に対する単一の実装になる。名前がディスパッチを約束してしまう可能性がある
- 本当の基準は §6.7 のもの。`Sealer` に `.implCreate` がないのは、callable なコンストラクタの隣では `create` が「何も絞らない」から。`Val.trait` も同じ試験を通らなければならず、引数の注釈とグルーピングだけでは API に値する保証にならないかもしれない
