# サイト案のローカル比較ガイド

7案を実画面から見比べる独立ガイドです。ブランチ `comparison-guide` は `work-candidates` の `386ba02` から分けました。元のホーム、比較、実験、候補のブランチを統合していません。

ガイドは `local-review/`、配信は `scripts/serve-comparison-guide.mjs` にあります。Astroのルートやpublicには置かず、通常の `npm run build` に画像・本文・操作コードを含めません。新しい主サイト機能ではありません。

## 一つの入口

このコピーで `npm run guide` を実行すると、`http://127.0.0.1:4347/` をlocalhostだけで開けます。すでに4347でガイドが動いていれば、そのまま使えます。別プロセスが使っている場合は止めず、空いているポートを確認して `GUIDE_PORT=4348 npm run guide` のように指定してください。

ホームをhome／signal／desk、作品の開き方を現在の一覧／collection／focus、実験を追加検討／今回は置かない／保留として考えます。candidatesは作品の採否を相談する道具で、ホーム案ではありません。チェックや相談用メモのコピーは、採用・merge・公開指示に変換しません。組み合わせた画面も未実装です。

画像は1280×900、reduced-motion設定で既存の保存済みプレビューを撮影しました。home／signal／deskは掲載作品0・記事0、collection／focusは公開GitHub由来6件・説明5件・関連記録0件、experimentsはシド（AI）の試作2件、candidatesは公開GitHub9件の調査下書きです。合成の検証用記事は表示していません。案内文や装飾図形はUIの試案で、本人の文章・実績として確定していません。

## 既存プレビューを保つ

2026-10-04に以下の入口とlocalhost限定bindを確認しました。全件HTTP 200で、停止・置換していません。完全な重複QAサーバーは確認できず、監査版も保持しました。確認用の新しいブラウザcontextは終了時に閉じ、本人のタブには触れていません。

| 用途        | URL                                                            | 配信元と参照コード                                                              |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| home        | `http://127.0.0.1:4321/`                                       | `.dot/site-draft/dist`、experience-next `edfd8a2`                               |
| signal      | `http://127.0.0.1:4321/directions/signal/`                     | 同上                                                                            |
| desk        | `http://127.0.0.1:4321/directions/desk/`                       | 同上                                                                            |
| collection  | `http://127.0.0.1:4334/compare/collection/`                    | `/tmp/hamaya-collection-qa-20261003/root-comparison`、experience-next `edfd8a2` |
| focus       | `http://127.0.0.1:4338/compare/focus/`                         | `/tmp/hamaya-focus-qa-20261004/preview`、experience-next `edfd8a2`              |
| 監査版      | `http://127.0.0.1:4344/hamaya-site-draft/`                     | `/tmp/hamaya-audit-preview-20261004`、audit-static-safety `10f6781`             |
| experiments | `http://127.0.0.1:4345/hamaya-site-draft/compare/experiments/` | `/tmp/hamaya-experiment-preview-20261004`、experiment-study `83377a0`           |
| candidates  | `http://127.0.0.1:4346/hamaya-site-draft/compare/candidates/`  | `/tmp/hamaya-candidates-preview-20261004`、work-candidates `386ba02`            |

参照HEADは最新のローカルブランチから確認した値です。候補画面は前タスクでbuildとのbyte一致を検証済みですが、ほかの保存済みプレビューと最新HEADの全ファイル一致は今回照合していません。静止画像だけで動きや組み合わせの完成度は判断しません。

停止後に再開するときは、まず `lsof -nP -iTCP:ポート番号 -sTCP:LISTEN` で未使用を確認してください。既存プロセスを強制終了する手順は含めません。保存済み配信元がある場合のコマンドは次の通りです。

```sh
# このガイドのworktreeから、元の保存済みdistを読む
cd ../site-draft
ASTRO_TELEMETRY_DISABLED=1 ./node_modules/.bin/astro preview --port 4321 --host 127.0.0.1
```

別のターミナルで、必要なものだけ起動します。

```sh
python3 -m http.server 4334 --bind 127.0.0.1 --directory /tmp/hamaya-collection-qa-20261003/root-comparison
python3 -m http.server 4338 --bind 127.0.0.1 --directory /tmp/hamaya-focus-qa-20261004/preview
python3 -m http.server 4344 --bind 127.0.0.1 --directory /tmp/hamaya-audit-preview-20261004
python3 -m http.server 4345 --bind 127.0.0.1 --directory /tmp/hamaya-experiment-preview-20261004
python3 -m http.server 4346 --bind 127.0.0.1 --directory /tmp/hamaya-candidates-preview-20261004
```

`/tmp` の固定コピーが消えた場合は元のdistを上書きして再建せず、必要なcommitの独立コピーでbuildします。experience-nextの案には `LOCAL_COMPARISON=1`、実験には `LOCAL_EXPERIMENTS=1`、候補には `LOCAL_CANDIDATES=1` を指定します。base付きの入口は `BASE_PATH=/hamaya-site-draft` を使い、対応するサブディレクトリから配信します。新しい配信元・ポートを確認してから、このガイドの `local-review/guide.json` を更新し、画像も撮り直します。

## 制作道具の配布版

MAKER FIELDは独立した制作道具として案内しました。ライブラリの `MAKER-FIELD-20261004.zip`、ID `libfile_caabd1ee7a5c8191b8303e1b05a5ae81` をreadで照合し、ZIPの名前と257494 bytesを確認しています。ZIP内の実行や再展開はしていません。

このMacの配布フォルダは `/Users/hamayakousei/Documents/Codex/2026-10-04/task-6/maker-field-release-20261004/`、ZIPは同じtask-6内の `MAKER-FIELD-20261004.zip` です。README・QA・STORAGE・app/storage/serverコードを読みました。初期データは架空サンプルです。

既定4187では別コピーが稼働しており、HTTPで取得したindex.htmlのSHA-256は配布版と不一致です。そのプロセスを止めず、配布版への実リンクとしても使っていません。配布版を別に試す場合は、4188の空きを確認したうえで次を実行します。これは起動例で、4188の稼働を今回確認したものではありません。

```sh
cd /Users/hamayakousei/Documents/Codex/2026-10-04/task-6/maker-field-release-20261004
PORT=4188 node server.cjs
```

起動後の入口は `http://127.0.0.1:4188/` です。ブラウザ・プロファイル・originごとに保存先が分かれます。別ポートの既存データは自動移動しません。

配布側QAは代替DOM・保存先による37テスト成功を報告しています。ブラウザでの実ダウンロード・JSON復元・小画面は未確認で、今回もアプリ操作・保存・復元はしていません。

| 比較       | 制作道具                                                    | サイトの現在の入口                                |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------- |
| ファイル   | `{version:1, logs:[], experiments:[], ideas:[]}` の専用JSON | UTF-8 Markdownを1件ずつ                           |
| 保存       | ブラウザ内の状態・取消履歴                                  | 執筆画面の入力はメモリ内、持ち帰るMarkdownはdraft |
| 日付と項目 | 空の日付や追加項目を許す                                    | 題・要約・実在日付・種類などが必要                |
| 画像       | base64 PNG/JPEG/WebP                                        | 掲載判断・alt・採用済みpublic画像の検証が必要     |
| 接続       | サイトへの変換・自動同期なし                                | 専用JSONをそのまま取り込めない                    |

[TOOL_CONNECTION.md](TOOL_CONNECTION.md) の受入条件と照合した結果です。本人が採用する前に、項目を黙って捨てない変換規則、必要な説明・日付・分類、画像の権利とaltを個別に決める必要があります。制作ログの判断を作品の公開承認へ読み替えません。

## 検証と保存

2026-10-04にlint（0エラー・0警告・0hint）、通常root／base付きの5ページbuild、最終107テストが成功しました。通常配布へのガイド本文・画像・操作コードの混入はありません。ガイドサーバーは許可した10ファイルだけを配信し、JSON・ソース・Git設定を配信しません。

Chromium 153.0.8010.12で7案の画像、全試用リンクHTTP 200、別タブ、相談用コピーと代替表示、リセットと再読み込み、キーボード、390px／320px、reduced-motion、JavaScript無効、配信ファイル制限を確認しました。コピー成功／拒否は隔離したClipboard APIで検査し、OSクリップボードには書き込んでいません。外部への自動通信・JavaScript実行エラーはありません。記録は [browser-evidence.json](comparison-guide-evidence/browser-evidence.json) にあります。

[PDFガイド](comparison-guide-evidence/hamaya-site-comparison-guide.pdf) は全3ページを画像として確認し、[7案の比較画像](comparison-guide-evidence/hamaya-site-seven-views.png) とともにLibraryへ保存しました。

| 成果物                             | Library ID                                 |
| ---------------------------------- | ------------------------------------------ |
| `hamaya-site-comparison-guide.pdf` | `libfile_8ac961bfbe948191bdd3a08e37e049a4` |
| `hamaya-site-seven-views.png`      | `libfile_0c55251955448191916c0a73b22f54b6` |

このガイドを作るために起動した4347だけを維持しています。編集途中の同ガイドのプロセスは所有を確認して終了・再起動しました。既存6サーバー、制作道具の別コピー、本人のブラウザタブは変更していません。採用の判断、組み合わせた画面、制作道具のJSON変換・実ブラウザでの復元確認は今後の範囲です。
