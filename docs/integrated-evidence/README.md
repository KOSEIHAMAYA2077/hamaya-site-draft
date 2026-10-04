# 統合候補の検証証跡

`integrated-workroom` の2026年10月4日のローカル確認です。本人の好みや採用判断を代行した結果ではありません。公開・デプロイはしていません。

- [画面一覧](hamaya-integrated-workroom.png): 実ブラウザの画像4枚を配置した確認用PNG。
- `home-*`、`record-*`、`search-*`、`settings-*`、`writer-*`、`maker-*`、`experiment-*`、`timeline-*`、`comparison-*`: 原寸の画面17枚。writerとMakerの入力は合成検証データです。
- [checks.json](checks.json): 4構成のbuild/test結果、元ファイル15件のSHA256、既存9作業領域の保持。
- [browser-evidence.json](browser-evidence.json): 横断利用19検査群、通信・保存・ダイアログ・ダウンロード一致の記録。
- [preference-failure-evidence.json](preference-failure-evidence.json): 設定保存失敗時の2検査群。
- [final-smoke-evidence.json](final-smoke-evidence.json): 修正後5検査群。ホーム応答サイズはこのファイルが最新値です。

## 再実行

`integrated-journey.mjs`、`preference-failure.mjs`、`final-smoke.mjs` は実行したスクリプトを保存しています。実行環境ではPlaywrightを `/tmp/hamaya-browser-qa/node_modules/playwright/`、Chromiumを `/tmp/hamaya-browser-runtime/` に用意しています。別の端末ではimport先とブラウザのパスを調整してください。サイト本体の依存や通常buildには加えていません。

統合候補を `http://127.0.0.1:4360/hamaya-site-draft/` で配信し、比較用の `japanese-ui-copy` ビルドを `http://127.0.0.1:4358/hamaya-site-draft/` に用意します。fixtureとダウンロードを証跡ディレクトリへ書かないよう、3スクリプトを新しい一時ディレクトリにコピーして順番に実行してください。`final-smoke.mjs` は本筋で作った合成fixtureを使います。

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamaya-browser-runtime node integrated-journey.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamaya-browser-runtime node preference-failure.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamaya-browser-runtime node final-smoke.mjs
```

実際のダウンロード開始後は入力を受け渡し済みとして扱います。端末への保存完了までは保証しません。移動確認はブラウザの仕様に依存し、自動保存の代わりにはなりません。
