# Markdownと画像の小さな持ち運びサンプル

すべて検証用の合成データです。本人の原文・実作品・私的資料は入っていません。

1. このフォルダーを丸ごと保存します。
2. `portable-writer-note.md`、`portable-writer-work.md`、`portable-maker-note.md` を、手元のMarkdown表示アプリで開けます。画像は `images/` と一緒に移してください。
3. サイトで続きを書くときは「書く」→「Markdownを取り込む」で `.md` を選びます。保存後も `images/` を残します。Makerからは「下書きを確認」→「画像と一緒に持ち出す（ZIP）」を使えます。

```text
portable-writer-note.md       書く画面で作った記事
portable-writer-work.md       書く画面で作った作品
portable-maker-note.md        Makerから取り出した記事
images/
  synthetic.png
  portable-maker-note-before.png
maker-source.json            完全な元データ（合成）
report.json                  Makerの変換記録
```

画像参照は `./images/...` または `images/...` です。画像は再圧縮していません。作品の表紙はfrontmatterの `cover` にも保存していますが、一般のMarkdown表示アプリではこのサイト固有の表紙設定を表示しないことがあります。本文の画像は通常のMarkdown記法です。

3件とも `draft: true` のままです。このフォルダーをリポジトリへ保存しても、記事として自動追加・公開されません。サイトへ戻す際は、記事を `src/content/notes/`、作品を `src/content/works/`、画像を `public/images/` へコピーし、`src/data/public-assets.json` に採用画像を指定します。公開は別途判断してください。

MakerのZIPは選択した1件だけです。全件・関連記録・元の改行形式まで戻せるよう、元JSONも別に保管します。YAMLコメント・未知設定・不正画像は、黙って落とさず停止します。Markdownのキー順や引用書式は取り込み後に再生成されます。

同じ本文・画像を `/portable-first/` と `/moved/nested/` で表示し、3ページの画像decode・14本の内部リンク・375px・キーボード操作を実ブラウザで確認しました。どちらも外部サービスやバックエンドは使っていません。配布ZIPの `evidence/` は検証結果と画面画像です。
