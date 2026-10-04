# 再開入口の比較記録

2026年10月4日、`return-entry` ブランチのローカル確認です。保存状態は検証用に作ったもので、本人の活動を記録したものではありません。

- [一覧画像](hamaya-return-entry-comparison.png): 保持した統合版、初回OFF、履歴ありの実画面を配置。
- `initial-*`、`resumed-*`、`collapsed-*`、`settings-*`: 最終版の1280px・375px原寸画像8枚。
- [browser-evidence.json](browser-evidence.json): 本筋17検査群。保存操作と通信の記録も含む。
- [final-capture-evidence.json](final-capture-evidence.json): 最終版4検査群、8画像、元統合版との位置比較。画面の寸法はこのファイルを正本とする。
- [build-matrix.json](build-matrix.json): 4構成のbuildと192テスト。
- [checks.json](checks.json)、[baseline.json](baseline.json): 元の15ファイルと10作業領域の保持、検証範囲。

## 再実行

`return-journey.mjs` と `final-capture.mjs` は実行したブラウザ検証のスクリプトです。Playwrightを `/tmp/hamaya-browser-qa/node_modules/playwright/`、Chromiumを `/tmp/hamaya-browser-runtime/` に用意した環境で実行しました。別端末ではimport先とブラウザパスを調整してください。これらをサイト本体の依存には加えていません。

今回の比較を `http://127.0.0.1:4362/hamaya-site-draft/`、元の統合候補を `http://127.0.0.1:4360/hamaya-site-draft/` で配信します。保存した証跡を上書きしないよう、スクリプト2本を新しい一時ディレクトリへコピーして実行してください。検証は専用browser contextで行い、終了時にブラウザを閉じます。

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamaya-browser-runtime node return-journey.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hamaya-browser-runtime node final-capture.mjs
```

実際の戻る・別タブ操作を確認し、BFCache復元時の処理は合成のpersisted pageshowイベントで補完しています。ネイティブBFCacheの稼働、利用者の好み、継続利用の効果や速度を実測したものではありません。
