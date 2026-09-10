# valof の位置づけ

2026-09-10 の検討記録。設計判断は `design.md`、ここは**外から見たときの valof**。README と PR の文面はここから引く。

## 目次

- **§1 強み** 10 項目。裏が取れたもの、弱いもの、条件つきに分けた
- **§2 Effect v4 調査** typeclass を落とした件と、`Data` / `Equal` の形
- **§3 ディープコピーの弁明** 採用前に読まれる質問。README 向けの言い換え
- **§4 残る問い**

---

## 1. 強み

### 裏が取れたもの

**1. plain object なので境界で考えることが減る**

`structuredClone` / JSON / `postMessage` / React state をそのまま通る。§2 の Effect が対比になる。

**2. 名前空間つきの関数整理**

Scala の companion object、Kotlin の `companion`、Rust の `impl` に対応が付く。Effect v4 が
`Semigroup → Combiner`、`Monoid → Reducer` に改名したのと同じ方向（§2）。

**3. plain object のまま動的ディスパッチ**

`Dyn` の箱。Effect は `Data.Class`（プロトタイプあり）か `Data.taggedEnum`（プレーンだが振る舞いなし）の
両端だけで、間が空いている。

**4. 既定で deep readonly**

**5. `seal` が Result を返せる**

`patch` は `ReturnType<typeof seal>` で推論するので、ライブラリは Result の中身を知らない（design §6.3）。
neverthrow / Effect / 自作、どれでも通る。**規約に従うだけで parse, don't validate になり、Result 実装を
選ばせない。**

**6. FP の語彙がない**

Effect の改名がこの判断を裏書きしている。ただし `dyn` は残る。Rust を知らない読者には読めない。

**7. 既に選んだものに乗る**

`dependencies` が空。`oxc-parser` は lint 入口だけの optional peer。`sideEffects: false`。

**言い方は肯定形で。**「valof は選択を強制しない」ではなく**「valof はあなたが既に選んだものに乗る」**。
否定形は Effect 利用者を客から外す。

| 欲しいもの     | 組み合わせ方                                                           |
| -------------- | ---------------------------------------------------------------------- |
| Result         | neverthrow / Effect / 自作。`seal` の戻り値になる（5）                 |
| バリデーション | zod / valibot / arktype を `seal` の中へ。parse, don't validate になる |
| pipe           | 関数は普通の関数なので、好きな pipe を載せられる                       |
| 状態           | React / Zustand / Jotai / Redux にそのまま置ける                       |
| linter         | ESLint / Biome / oxlint のどれでも（10）                               |

**Effect と併用できる。**`seal` が `Effect` や `Either` を返せばよい。競合ではなく共存。

**メソッドチェーンは失う。**ここは class に劣る。`User.greet(u)` は繋がらない。pipe を載せれば composition は
戻るが、それは利用者の選択で、ライブラリが配るものではない。`Dyn` の箱は `p.greet()` という**呼び出しの
綴りだけ**戻す。戻り値は箱ではないので連鎖はしない。

**8. バンドルが軽い**

|                 | gzip    |
| --------------- | ------- |
| `Val` のみ      | 1.12 kB |
| `Val` + `Trait` | 1.21 kB |

ブランドは phantom なので実行時に痕跡がない。目安として Effect v4 は「典型的なプログラムで 70 kB → 20 kB」。
**守備範囲が違うので「同じことをより小さく」ではない。**並べるなら「値オブジェクトのために 20 kB は要らない」
という文脈で。

実行時は無料ではない（§3）。

### 弱いもの

**9. 構造共有と React**

実装はある。`owned` の WeakSet で、`patch` は変わった経路だけコピーして下は共有する。葉まで記録するのも
`React.memo` のため（design §4.1）。

**ただし Effect との差にはならない。**v4 に `Optic` モジュールが入った（v3 に対応なしの新規）。optics も
普通の spread も、触っていない枝の identity は保つ。`{...s, a: {...s.a, b: v}}` が既にそう。

**取り分は能力ではなく手間。**optic の宣言も spread の連鎖も書かずに、任意の深さの `patch` 1 つで済む。
そう書き換える。

### 条件つき

**10. linter**

**「eslint 非依存」ではなく「ESLint を使っていてもいなくても入る」。**`exports` に `./eslint-plugin` と
`./lint` の両方がある。前者は排除の言い方、後者は包含で、事実は後者。

- **利点**: oxc-parser 直なので Biome / oxlint 利用者も統合できる。ESLint プラグインだけならその人たちは使えない
- **デメリットか**: 半分イエス。linter は opt-in なので、走らせない人には規則が無い
- ただし逃がしたのは**型で表現できないもの**。companion のメンバは静的解析からしか見えず、型に持たせる
  選択肢がそもそもない（design §14）
- 本当のコストは配布と統合。ESLint に乗れば設定は既にあるが、独立 CLI は CI とエディタに 1 本ずつ配線が
  要る（design §14.9 の overlay がその答え）

売り文句は**「valof の規則は valof が持ってくる。既存の linter を替えなくていい」**。

---

## 2. Effect v4 調査、2026-09-10

v4 は 2026-08-12 から RC。コードは `Effect-TS/effect-smol`。

### typeclass パッケージが無い

`packages/` は ai / atom / effect / opentelemetry / platform-\* / sql / tools / vitest。v3 の
`@effect/typeclass` は入っていない。`@effect/typeclass@0.41.0`（2026-07-13）の peer は `effect: ^3.22.0` で、
**v4 に付いてきていない。**

`migration/v3-to-v4.md` にある typeclass 関連のマッピングは 2 つだけ。

```
@effect/typeclass/Semigroup -> effect/Combiner
@effect/typeclass/Monoid    -> effect/Reducer
```

`Functor` / `Applicative` / `Covariant` / `Invariant` / HKT は表に無い。対応先も「no counterpart」の記載もない。

残ったほうの中身は単一の具体型に対する関数 1 つ。

```ts
export interface Combiner<A> {
  readonly combine: (self: A, that: A) => A;
}
```

### 読み

**「使われなかったから落とした」ではなく、HKT の層を落とした。**落ちたのは valof が最初から持っていない
部分で、残ったのは「1 つの型に対する共有された振る舞いに名前を付ける」という valof の領域。

理由は 2 つに分かれる。

- **語彙**: 直接証拠がある。改名がそれ。概念を残したまま名前だけ捨てている
- **HKT**: 状況証拠。TS に HKT が無いので `TypeLambda` + `Kind` で脱関数化するしかなく、細部が漏れる。
  実例が [effect#3171](https://github.com/Effect-TS/effect/issues/3171)。TS 5.4 で
  `Option<ReadonlyRecord<string, B>>` と出ていた hover が、5.5 で `Kind<OptionTypeLambda, ...>` になった。
  ライブラリ側は何もしていない

**公式の理由表明は見つからなかった。**以上は移行表からの推測。

### 値の形

Effect の等価性は**値の中にある**。

```ts
export interface Equal extends Hash.Hash {
  [symbol](that: Equal): boolean;
}
```

symbol キーのメソッドを値に置く。design §1 の逆で、JSON を往復すると自分に戻らない。

`Data` は両端だけ。`Data.Class` は `Pipeable.Class` を継承（プロトタイプあり）、`Data.taggedEnum` は
`({ ...props, _tag: tag })` を返す（プレーンだが振る舞いなし）。**間が空いている。**

### クラスを入れない利点、equality の側

`compareObjects` は `[Equal.symbol]` を持たないクラスインスタンスを `compareRecords` に落とす。列挙可能な
own key を比べるだけなので、穴が 2 つ開く。

- **`#` プロパティは own key ですらない。**`Reflect.ownKeys` にも出ない。差があっても**等しいと言われる**
- **メソッドと getter はプロトタイプにある。**別のクラスでもフィールドが同じなら等しくなる。名前的な同一性が消える

`hash` の `structure()` も同じキー集合を見るので同じ穴。逃げ道は `byReferenceInstances` への登録か
`[Equal.symbol]` の実装で、**どちらも気づいた人だけ**。

**valof は入り口で止める。**design §3 が payload をプリミティブ・配列・プレーンオブジェクト・Val に限り、
dev では `assertPlainObject` が落とす。利用者がこの判断をする場面が無い。

§1-1 の「境界で考えることが減る」は移送の話だけではない。**等価性が正しくなる**のも同じ制限から来ている。

**向こうにあってこちらに無いもの。**`Data.struct` は `Equal` / `Hash` を持つので `HashMap` / `HashSet` に
そのまま入る。valof は Map / Set を見送っている（design §7、代替は §8）。比較でこれを言わないと全体が
信用されない。

---

## 3. ディープコピーの弁明

採用前に読まれる質問。design §4.1 は決定の記録として足りているので、ここは**利用者向けの言い換え**。
置き場所は README か `Val.sealer` の JSDoc。

### 強いほう: 穴は塞げない

型でも lint でも塞げない理由を一言で言えること。

**TS に線形型・アフィン型が無い。**「この引数の所有権をもらった」を表す手段がないので、呼び出し側が参照を
持ち続けているかは**呼び出し地点のローカルに書かれていない**。lint も同じで、`const raw` がどこまで生きるかは
関数境界を越える。valof-lint にも見えない。

**決め手はコストではなくここ。**

> 手で書いた `[...arr]` は誰も検査しない。1 箇所忘れると、静かなエイリアシングバグになる。ライブラリの
> コピーは忘れられない。

### 弱いほう: 「コストは変わらない」

**厳密にやる場合には成立する。**`[...arr]` は浅いのでネストした配列を守れない。正しく手で書けば再帰コピーに
なり、valof と同じものになる。

**成立しない場合が 1 つ。**リテラルを直接渡すとき。

```ts
User({ id: "a", name: "bob" }); // 誰もこのオブジェクトを持っていない
```

エイリアスが無いので、手で書くなら何もコピーしない。valof は 47 ns 払う。`owned` にいないので WeakSet も
効かない。**純粋な無駄で、実際よくある呼び方。**

### 言い方

1. **払っていたはずのコストを 1 箇所に集めた。**正しく書くなら再帰コピーになるため
2. **余分に払うのは、エイリアスの無い入力を見分けられないぶん。**ライブラリには判別できない
3. **WeakSet の +100 ns / +48 B は本当の追加分。**ただし Val のリスト構築で 4.7 倍返ってくる（design §4.1）

3 を隠さないほうが 1 が信用される。

---

## 4. 残る問い

- **API の引っかかり 2 つ。**どちらも TS の制約で、初見の読者は冗長と読む。README の早い位置で 1 行ずつ
  弁明する

  ```ts
  const User = Val.sealer<User>().impl({ ... }); // 2 段。部分推論が無いため（design §13.1）
  type User = Val<"User", { ... }>;              // "User" を 2 回書く
  ```

- **`dyn` の名前。**Rust の語彙。§1 の 6 で挙げた「FP の語彙が無い」から唯一はみ出す
- **`Trait` の需要は実利用で確かめる。**design §15.1 の「需要」に測り方まで書いた。`dyn` と `Final` が
  実際に使われるか
