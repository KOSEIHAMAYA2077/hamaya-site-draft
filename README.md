# 濱谷康生のサイト — 下書き

制作物、学んだこと、日々の雑記を置いていく個人サイトです。明るい白と薄灰を中心に、黒い文字と細い線で整えています。プロフィールや作品の中身は、本人の文章と公開判断を待っています。

現在の `contour-study` は、統合版 `ac5bea0` を基準にした見た目の独立比較です。作品名を大きくし、一つの銀色の立体と曲面のある読む面を重ねています。[同サイズの比較画像と意図](docs/CONTOUR_STUDY.md) を保存しました。[新案4366](http://127.0.0.1:4366/hamaya-site-draft/) と [基準4360](http://127.0.0.1:4360/hamaya-site-draft/) を並べて見られます。採用と公開は本人の判断を待ちます。

この作業領域と専用リポジトリは非公開の下書きです。GitHub Pagesの有効化、公開用workflow、外部へのデプロイは行っていません。生成ページには `noindex` を付けています。`noindex` はアクセス制限ではないため、非公開の情報は本文やリポジトリに入れないでください。

入力と通常配布の修復は独立ブランチ `audit-static-safety` にあります。[公開前監査](docs/SECURITY_AUDIT.md) と [制作道具の接続仕様](docs/TOOL_CONNECTION.md) を参照してください。`experience-next` の制作案は保持しています。

この `experiment-study` には、シドの小試作を眺める独立した [「実験を見る」](docs/EXPERIMENT_STUDY.md) を追加しています。`LOCAL_EXPERIMENTS=1 npm run dev` または `npm run build:experiments` でのみ使えます。本人の作品としての採否は未確定で、通常buildには含めません。

## ローカルで見る

Node.js 24以上を使います。実装はAstro 7の静的サイトです。

```sh
npm ci
npm run dev
```

ブラウザで `http://127.0.0.1:4321/` を開きます。制作物は「作品」、学びと雑記は「学び・雑記」、プロフィールは「自己紹介」から見られます。記事一覧の検索と分類はURLに残り、記事から戻っても復元できます。4つ以上の節がある記事・作品には、折りたたみの目次が付きます。

`npm run dev` では `/write/` と `/directions/` も使えます。作品を使った `/compare/` の比較版を見るときは `LOCAL_COMPARISON=1 npm run dev` で起動します。

## 記事・作品を追加する

画面から書く場合は [下書きの道具](http://127.0.0.1:4321/write/) を開きます。題と本文から書き始め、読む表示で確認して、設定を添えたMarkdownをダウンロードできます。既存のMarkdownも1つ選んで再編集できます。不明な設定があれば取り込みを止め、入力の置換は画面で確認します。入力は自動保存されません。詳しい手順は [docs/WRITING.md](docs/WRITING.md) にあります。

執筆画面を含むローカル用の出力をlocalhostで開くと、トップ、空の一覧、フッターに執筆への入口を表示します。通常buildには執筆画面も入口も含めません。表示上の案内やローカル用フラグは、認証やアクセス制限ではありません。

```sh
npm run new -- note first-note --title "今日学んだこと"
npm run new -- work first-work --title "制作の記録"
```

生成先は `src/content/notes/` と `src/content/works/` です。すべて `draft: true` で始まります。本文を編集し、本人が公開内容を確認してから `draft: false` にします。同じslugのファイルは上書きしません。

`draft: true` の内容は一覧にも詳細ページにも出ません。ただし、Markdownの元ファイルはprivateリポジトリへ保存されます。私的メール、業務の非公開資料、金融情報、内部メモ、認証情報は下書きにも入れないでください。

本文のraw HTMLはbuildで拒否し、HTMLコメントは生成ページから除去します。元のMarkdownは変更しません。外部リンクはログイン情報・制御文字・バックスラッシュを含まないHTTPSにし、本文ではサイト内のパスも使えます。

画像は掲載を決めたPNG・JPEG・WebP・GIF・AVIFを `public/images/` に置き、`src/data/public-assets.json` に `images/foo.webp` の形で明示します。本文では `![説明](/images/foo.webp)` と書きます。未採用のファイルを `public/` に置くとbuild前の確認で止まります。画像は記事のdraft設定に関係なくコピーされるため、未採用画像は `public/` に置かないでください。詳しい手順と画像検査の範囲は [docs/CONTENT.md](docs/CONTENT.md) にあります。

プロフィール、リンク、画像の差し替え方と未入力項目は [docs/CONTENT.md](docs/CONTENT.md) にまとめています。既存記事1件と公開GitHub作品6件の下書き、出典と除外した対象は [docs/MIGRATION.md](docs/MIGRATION.md) にあります。設計の意図は [docs/DESIGN.md](docs/DESIGN.md)、実読した参考資料とライセンスは [docs/REFERENCES.md](docs/REFERENCES.md) を参照してください。

検証済みGitHub作品を眺める独立案「制作の棚」は、明示した非公開比較buildだけで表示します。既存ホームや通常の下書き除外は保持しています。使い方、資料の範囲、関連記録の対応、検証結果は [docs/COLLECTION_STUDY.md](docs/COLLECTION_STUDY.md) にあります。

Astraの批評を受けた別比較版「一作品を開く」は、同じ比較buildの `/compare/focus/` です。作品を主役にした表示、モバイルの切替、立体との対応、画面位置の実測は [docs/FOCUS_STUDY.md](docs/FOCUS_STUDY.md) にあります。

## 確認する

buildは用途ごとに分けています。ページ数は、記事・作品の公開が0件である現在の値です。

| コマンド                | 生成するページ                                                                        | 現在のページ数 |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------- |
| `npm run build`         | 通常のサイトだけ。`/write/`・`/directions/`・`/compare/` と、それら専用のbundleを除外 | 5              |
| `npm run build:local`   | `LOCAL_STUDIO=1`。通常ページに執筆画面と方向性の比較を追加                            | 12             |
| `npm run build:compare` | `LOCAL_COMPARISON=1`。ローカル用ページに作品の比較版を追加                            | 14             |

通常buildでは `LOCAL_STUDIO` と `LOCAL_COMPARISON` を設定しません。ローカル用・比較用の成果物は配布用に使わず、通常buildをやり直して確認します。

```sh
npm run lint
npm run build
npm test
npm run preview
```

`lint` は整形とAstroの型を確認します。`test` は追加スクリプトの入力検証、既存ファイルの保護、生成HTMLの導線、静的アセット、下書きやローカル用ページの除外、未入力表示を確認します。`npm test` の前に同じ設定でbuildしてください。`npm run preview` は直前のbuildを表示するので、通常build後の `/write/` はありません。

執筆道具の静的出力を確認する場合は、次を使います。

```sh
npm run build:local
LOCAL_STUDIO=1 npm test
npm run preview
```

作品の比較版は `npm run build:compare`、そのテストは `LOCAL_COMPARISON=1 npm test` です。いずれも公開操作は行いません。

GitHub Pagesのプロジェクトサイトを想定する場合は、リポジトリ名に合わせてbaseを指定します。

```sh
BASE_PATH=/repo-name npm run build
BASE_PATH=/repo-name npm test
BASE_PATH=/repo-name npm run preview
```

この場合のローカルURLは `http://127.0.0.1:4321/repo-name/` です。将来、ユーザーサイト `username.github.io` のルートで公開する場合はbaseを `/` にします。`BASE_PATH` を省略したbuildがこの設定です。

公開URLを決めた後は、HTTPSのoriginを `SITE_ORIGIN` に設定します。パスはこの値に含めず、`BASE_PATH` に設定してください。たとえば公開前の検証専用コピーなら、`SITE_ORIGIN=https://example.invalid BASE_PATH=/hamaya-site-draft npm run build` で確認できます。buildとtestには同じ値を渡します。この例のURLを公開先として使わないでください。

ページごとの題・説明・OGの基本項目を生成します。`SITE_ORIGIN` が未設定のローカル下書きではcanonicalとOGのURL・画像を出しません。共有画像も本人が選ぶまで未入力です。設定手順は [docs/CONTENT.md](docs/CONTENT.md) にあります。

## 本人の判断を待つ公開作業

この段階ではPagesを有効にしていません。本人が内容と写真・リンク・作品の公開範囲を確認してから、公開先のリポジトリ、URL、base、`noindex` の扱いを決めます。`dist/` はbuild成果物で、`public/.nojekyll` はGitHub Pagesでの静的配信に備えたファイルです。

公開するときは、決めたbaseでbuildとテストを行い、キーボード操作、モバイル、動きを減らす設定、作品と記事の実データもブラウザで確認してください。

## 非公開のGit bundleで移す

ネットワーク経由の保存が使えない場合は、専用privateリポジトリの履歴をbundleで渡せます。現在のGit設定や認証情報をコピーする必要はありません。

まず `git status --short` を確認し、保存したい変更だけをコミットします。bundleに入るのはコミット済みの履歴です。履歴にも私的な資料や認証情報がないことを確認してください。

```sh
git status --short
git bundle create ../hamaya-site-draft.bundle --all
git bundle verify ../hamaya-site-draft.bundle
```

bundleは暗号化されません。非公開の保存先で扱い、公開サイトの `public/` や配信する `dist/` へ置かないでください。移行先では次のように復元します。

```sh
git clone /private/path/hamaya-site-draft.bundle hamaya-site-draft
cd hamaya-site-draft
git remote remove origin
```

移行先で専用privateリポジトリのURLとprivate設定を確認してから、remoteを追加して保存します。既存の公開リポジトリを保存先にしないでください。GitHubへの保存はPages公開とは別の作業です。

検証結果と依存関係の注意点は [docs/VALIDATION.md](docs/VALIDATION.md) にあります。5つの方向性は、devまたはローカル用buildの [比較ページ](http://127.0.0.1:4321/directions/) で見られます。ホームは「静かな軌道」を基準にし、[光の制作室](http://127.0.0.1:4321/directions/signal/) と、新しい [分類を開く制作机](http://127.0.0.1:4321/directions/desk/) を比較できます。制作机は、最初の画面から分類を選び、同じ場所で記録を開く案です。

初期版は `main` と `baseline-10b2870`、この追加実装は `experience-next` に分けて保存しています。採用するホームは本人が見てから決めます。

配布前の安全性修復は別ブランチ `audit-static-safety` で進めています。制作道具を採用する際の受け渡し条件は [docs/TOOL_CONNECTION.md](docs/TOOL_CONNECTION.md) にあります。

公開GitHubの9件を本人が選ぶための [作品候補の調査と比較画面](docs/WORK_CANDIDATES.md) を、privateブランチ `work-candidates` に追加しています。全件下書き・採否未定で、`LOCAL_CANDIDATES=1` のローカル比較にだけ表示します。

7案を実画像で見比べる独立ガイドは `npm run guide` で開きます。通常サイトbuildへは含めません。[比較ガイドと起動手順](docs/COMPARISON_GUIDE.md) を参照してください。
