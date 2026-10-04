# 持ち運び検証の証跡

本人の原文や実画像を使わない合成QAです。`build-validation.json` に4modeと原文15ファイル・既存11worktreeの保持を記録しています。ブラウザ結果は writer 8群、Maker 7群、Maker非同期4群、base移動7群です。

`*.log.txt` は実行ログです。`build-validation.json` のログ名に `.txt` を付けたものが対応します。

再実行する場合は、5つの `.mjs` を `.dot/portable-qa/` へコピーし、harness内のローカルルートとPlaywrightパスを環境に合わせます。writer→Maker→build-relocation→relocation-browserの順で実行します。Maker非同期検証は制作道具が起動していれば独立して実行できます。

`build-relocation.mjs` は `.dot/site-portable` から `.dot/portable-qa/fixture-site` に検証専用コピーを作り、合成3件だけを通常の詳細ページへ出します。本人の元ファイルと配布サンプルには書き込みません。生成先 `.dot/portable-qa/relocated-preview` を `python3 -m http.server 4365 --bind 127.0.0.1 --directory <生成先>` で表示します。`/portable-first/` と `/moved/nested/` の画像・本文は同じ入力です。

Markdownは `../portable-sample/` に実ダウンロードのbytesで保存し、整形対象から除外しています。作業用の失敗fixtureやブラウザプロファイルは配布サンプルへ入れていません。
