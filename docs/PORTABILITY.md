# Markdownと画像を持ち運ぶ

`portable-markdown` は `return-entry` の `55fa283` から作った独立コピーです。元main・統合版・return-entryと本人の原文15ファイルを変更していません。公開・新しい認証・バックエンド・外部依存の追加はありません。

## 使うとき

1. 「書く」で記事・作品をダウンロードします。画像は `.md` と同じ階層の `images/` に保管し、本文を `![説明](./images/name.png)` とします。
2. Makerは「下書きを確認」→「画像と一緒に持ち出す（ZIP）」。選択1件の `.md`・画像・`report.json` が入ります。完全なバックアップ用に元JSONも残します。
3. フォルダーごと移します。サイトへ戻す場合、記事は `src/content/notes/`、作品は `src/content/works/`、画像は `public/images/` へコピーし、`src/data/public-assets.json` で採用画像を指定します。本文の相対参照は変更不要です。
4. 別baseでは `BASE_PATH=/new-place npm run build`。画像は表示時だけそのbaseへ解決されます。元Markdownを書き換えません。内容と公開範囲の確認まで `draft: true` を保ちます。

[サンプル](portable-sample/README.md) はブラウザから実際に保存したMarkdown3件と画像2件です。ZIPを解凍したフォルダーだけで読めます。表示アプリによってfrontmatterの見え方は違いますが、本文・画像は通常のMarkdownです。

## 保てるものと、止めるもの

| 対象                             | 扱い                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| writerの記事・作品               | 題・日付・分類・status・URL・cover・タグ・本文を保持。取り込み後に未編集なら本文のCRLF、末尾改行、タグの空白・重複も保持                       |
| 本文画像                         | `images/...` と `./images/...` をpublicの採用済み画像へ解決。直書き・参照記法を確認。画像不足・未採用・親パス・外部URL・旧baseはbuild停止      |
| Maker画像                        | PNG・JPEG・WebPを形式と実decodeで確認し、元bytesのままZIPへ。最大2枚、各1 MiB、縦横8192px・合計16777216画素以内。未対応形式・破損はZIP作成停止 |
| Maker文章・設定                  | 既知値をfrontmatterまたは本文のコード枠へ保存。元文章をHTML/Markdownとして実行しない。改行のLF化はreportに記録                                 |
| 未知設定・不正型・日付・重複キー | 取り込み停止。現在の入力は保持                                                                                                                 |
| YAMLコメント                     | 消える前に取り込み停止。元.mdを残し、必要なら本文へメモを移したコピーを用意する                                                                |
| frontmatterの書式                | 値を保持してキー順・引用法を再生成。書式そのものの復元には元.mdを残す                                                                          |
| `draft: false`                   | 取り込み画面で明示して `true` へ。自動公開しない                                                                                               |

writerは画像ファイル自体を読まないため、その画面だけでは不足画像を判定できません。サイトのbuildで確認します。Makerの通常Markdownボタンは従来どおり画像を含めず、その旨を表示します。画像付きZIPは別の明示操作です。画像確認中に入力や記録を変えた場合も、古いZIPを出力しません。

MakerのZIPは全データの復元形式ではありません。選択外の記録・関連ID先は自動同梱しません。元JSONを残してください。通常の相対 `.md` 記事間リンクは保持しますが、サイトの `/notes/slug/` 形式へ自動変換しません。移行時にリンク先を確認してください。表紙のfrontmatter設定も他のMarkdownアプリに同じ表示を要求するものではありません。

採用画像はdraftに関係なく配布物へコピーされます。この検証では合成画像だけを、使い捨てのQAコピーで採用しました。配布用にする本人の画像はまだ選んでいません。

## 実操作の結果

- writer 8群：実入力・保存、CRLF本文、タグ、拒否後の全入力と再出力bytes、draftの明示、375px・キーボード・reduced-motion。
- Maker 7群：実ZIP保存、PythonによるZIP CRC検査、画像bytes一致、writer再取り込み・保存のMarkdown bytes一致、壊れた画像と未知設定の停止。
- Maker追加4群：画像確認中の編集・記録切替、保存後の未保存警告解除、再編集時の警告復帰。
- 移動7群：`/portable-first/` と `/moved/nested/` の3ページずつ、画像8表示すべて240×160にdecode、内部リンク14本が200、375px・キーボード・reduced-motion。外部通信・ページエラー・壊れた参照は0。
- root・base・比較・workroomの4modeで各206テスト成功。ページ数は5・5・15・23。lintはエラー0・警告0、既存互換APIのhintが1件。

通常サイトの実際の詳細ページを使うため、QAコピー内の合成3件だけ一度 `draft: false` にしました。その同じコピーを2baseでbuildしています。ダウンロードしたサンプルと本人の原文は変更していません。通常buildに合成fixture・新しい制作道具が混ざらないことも確認済みです。

[結果・画面画像](portable-evidence/) に実行記録があります。本人の実記事や実画像による確認、公開判断は未実施です。

持ち運び用ZIPは162,703 bytes、SHA-256は `ce45bf296c808bc63ddf8e33d9e2be1f26a36c5ef91d9f8be3a7c3ffc6f6b5bd`。Libraryにも保存しました。Library IDは `libfile_1ded398cd2b88191804c6b6f68e3a677`、ファイルIDは `file_000000006d4481f585bba99d4655842b` です。

## ローカルの確認先

- [制作道具](http://127.0.0.1:4364/portable-origin/write/)
- [Maker画像持ち出し](http://127.0.0.1:4364/portable-origin/write/maker-field/)
- [移動後の合成記事](http://127.0.0.1:4365/moved/nested/notes/portable-writer-note/)
- [移動後の合成作品](http://127.0.0.1:4365/moved/nested/works/portable-writer-work/)

同じMacで確認サーバーが動いている間だけ開けます。再起動はこの枝で `ASTRO_TELEMETRY_DISABLED=1 LOCAL_WORKROOM=1 BASE_PATH=/portable-origin npm run dev -- --port 4364`。合成例の再現手順は `portable-evidence/build-relocation.mjs` にあります。各harnessのローカルルート・Playwrightパスは実行環境に合わせて変更してください。既存の比較サーバーを停止する必要はありません。

この作業開始時に停止していた比較案内4347・統合版4360・return-entry4362は、保存済みの出力と既存スクリプトから再開しました。元の4321と他タスクのサーバーは操作していません。この作業用の一時ブラウザはすべて終了しています。
