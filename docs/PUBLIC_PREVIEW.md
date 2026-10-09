# 公開用の静的出力

本人は2026年10月9日、既存のGitHub Pagesを更新することを許可しました。公開先は既存リポジトリ `KOSEIHAMAYA2077.github.io` のルート、URLは <https://koseihamaya2077.github.io/> です。制作ソースの `hamaya-site-draft` は本人の指示ですでにpublicになっています。秘密データや非公開の日記をソースにも配信物にも入れません。この作業ブランチは `dist` の準備までを担当し、pushやPages設定変更は親タスクで行います。

## 掲載するもの

- 確認済みの公開GitHub作品6件。タイトル・リポジトリ説明・URLだけを選び、トップと作品一覧からGitHubへリンクします。説明がない作品には説明を補いません。
- 既存の公開記事「好きなゲームについて思うこと 1」1件。正規URLは `/notes/cyberpunk2077-1/` です。従来の `/notes/cyberpunk2077-1.html` にも同じHTMLを生成し、canonicalは新URLへ向けます。
- 既存の自己紹介・ナビゲーション・404。未入力プロフィールやAtCoderのURLを補いません。

記事は[現行の公開元](https://koseihamaya2077.github.io/notes/cyberpunk2077-1.html)を読み、見出し・段落・強調・句読点を照合しました。[出典と照合記録](PUBLIC_PREVIEW_SOURCE.json)に取得元、SHA-256、本文24ブロックと既存の移行用Markdownとの差を記録しています。公開元の本文は書き換えていません。

専用の `src/public-preview/notes/` collectionを使うため、既存の `src/content/`、`src/data/`、全ての `draft: true` は維持します。新しい公開記事の複製も `draft: true` で、明示した公開モードの許可リストだけが読み出します。通常ビルドには複製も作品6件も含めません。

## ビルドと検証

依存関係を準備した後、最初に通常配布の互換性を検証します。

```sh
npm run lint
npm run build
npm test
```

既存のユーザーサイトを更新する最終出力はルート用です。

```sh
BASE_PATH=/ SITE_ORIGIN=https://koseihamaya2077.github.io/ npm run build:public-preview
BASE_PATH=/ SITE_ORIGIN=https://koseihamaya2077.github.io/ npm run test:public-preview
```

プロジェクトサイトの相対パスも検証できます。この出力は現在の公開先には使いません。

```sh
BASE_PATH=/hamaya-site-draft SITE_ORIGIN=https://koseihamaya2077.github.io/ npm run build:public-preview
BASE_PATH=/hamaya-site-draft SITE_ORIGIN=https://koseihamaya2077.github.io/ npm run test:public-preview
```

`npm test` は通常配布と既存のローカルモード向けです。公開用出力には専用の `test:public-preview` を使い、ページ数・掲載元・本文一致・内部参照・canonical・除外対象を検証します。配信用ファイルは `dist/` の中身だけです。作業後はルート用ビルドへ戻してください。

## 配布の境界

`PUBLIC_PREVIEW=1` と `LOCAL_*` の併用はビルド開始時にエラーにします。公開出力には執筆画面、比較案、Maker、実験、作業室、閲覧履歴、vendor、docs、元Markdown、source mapを含めません。記事本文は正規記事ページと旧URLのHTMLにだけ含め、検索用JSや作品一覧へ埋め込みません。外部スクリプトやデータ送信は追加しません。

公開する正規ページには既存サイトと同じく `noindex` を付けず、canonicalを設定します。通常の下書き・ローカル画面と404は `noindex, nofollow` を維持します。

日記サービスのURL・パスワード・リンクはこのソースにも出力にも追加していません。
