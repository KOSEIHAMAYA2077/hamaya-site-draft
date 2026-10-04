# 曲面と重なり・比較証跡

- `hamaya-contour-comparison.png`：基準と新案の同サイズ比較。PC1280×812と375×812、TypeAndSummon、動き停止状態。画像を縮めず並べた2648×2000pxのボードです。
- `comparison.html`：同じボードのHTML。隣の4枚の画像を参照し、外部取得はありません。
- `browser-checks-final.json`：最終結論。11群成功。
- `browser-checks-nojs.json`：静的PC配置の修復後、全6作品と通常アンカーを再確認。
- `browser-checks.json`：最初の操作検証。JavaScript有効の7群が成功した時点の記録です。末尾の失敗はnative smooth-scroll完了前に測った検証側の問題で、修復後の再検証と最終JSONで解決を記録しています。
- `build-validation.json`：4mode×175テスト、lint、原文と元worktreeの保持。参照ログは `.log.txt` として保存しています。
- `source-scope.json`：既存スクリプト・立体SVG・依存定義のbyte一致。

ブラウザharnessは当日のローカルパスとポートを記録しています。再実行時はルートとPlaywrightパスを実行環境に合わせてください。`capture-baseline.mjs` の基準記録先は `.dot/contour-qa` です。既存ユーザープロファイルを使わず、検証後に一時ブラウザを閉じています。

本人の記事本文や新しい作品情報を検証用に書き換えていません。JavaScriptなしの表示では6作品が文書順に並びます。比較画像はJavaScript有効・動き停止の同条件で撮影しています。
