# 濱谷康生のサイト — 下書き

制作物、学んだこと、日々の雑記を置いていく個人サイトです。明るい白と薄灰を中心に、黒い文字と細い線で整えています。プロフィールや作品の中身は、本人の文章と公開判断を待っています。

この作業領域と専用リポジトリは非公開の下書きです。GitHub Pagesの有効化、公開用workflow、外部へのデプロイは行っていません。生成ページには `noindex` を付けています。`noindex` はアクセス制限ではないため、非公開の情報は本文やリポジトリに入れないでください。

## ローカルで見る

Node.js 24以上を使います。実装はAstro 7の静的サイトです。

```sh
npm ci
npm run dev
```

ブラウザで `http://127.0.0.1:4321/` を開きます。制作物は「作品」、学びと雑記は「学び・雑記」、プロフィールは「自己紹介」から見られます。記事一覧には検索とカテゴリの絞り込みがあります。

## 記事・作品を追加する

```sh
npm run new -- note first-note --title "今日学んだこと"
npm run new -- work first-work --title "制作の記録"
```

生成先は `src/content/notes/` と `src/content/works/` です。すべて `draft: true` で始まります。本文を編集し、本人が公開内容を確認してから `draft: false` にします。同じslugのファイルは上書きしません。

`draft: true` の内容は一覧にも詳細ページにも出ません。ただし、Markdownの元ファイルはprivateリポジトリへ保存されます。私的メール、業務の非公開資料、金融情報、内部メモ、認証情報は下書きにも入れないでください。

プロフィール、リンク、画像の差し替え方と未入力項目は [docs/CONTENT.md](docs/CONTENT.md) にまとめています。設計の意図は [docs/DESIGN.md](docs/DESIGN.md)、実読した参考資料とライセンスは [docs/REFERENCES.md](docs/REFERENCES.md) を参照してください。

## 確認する

```sh
npm run lint
npm run build
npm test
npm run preview
```

`lint` は整形とAstroの型を確認します。`test` は追加スクリプトの入力検証、既存ファイルの保護、生成HTMLの導線、静的アセット、下書きの除外、未入力表示を確認します。`npm test` の前に同じ設定でbuildしてください。

GitHub Pagesのプロジェクトサイトを想定する場合は、リポジトリ名に合わせてbaseを指定します。

```sh
BASE_PATH=/repo-name npm run build
BASE_PATH=/repo-name npm test
BASE_PATH=/repo-name npm run preview
```

この場合のローカルURLは `http://127.0.0.1:4321/repo-name/` です。将来、ユーザーサイト `username.github.io` のルートで公開する場合はbaseを `/` にします。`BASE_PATH` を省略したbuildがこの設定です。

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
