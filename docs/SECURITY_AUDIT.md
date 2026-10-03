# 公開前の入力・静的配布監査

確認日: 2026-10-04 UTC。対象は `experience-next` の `edfd8a2ae43c8bcef0fe8b764b387f3aab023f80` から分けた `audit-static-safety` です。既存の制作案と `main` は変更していません。本人の記事の公開設定、Pages、deploy、認証、リポジトリの公開範囲も変更していません。

実装の読み取り、依存の公式advisory、自己作成fixtureの隔離buildとローカルChromiumで検証しました。第三者サイトへの攻撃や外部データの取得試験は行っていません。技術上の確認であり、本人の内容・素材・公開時期の承認ではありません。

## 再現した問題と修復

| 経路             | 修復前に確認した事実                                                                                                                                                           | このブランチの扱い                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公開Markdown     | 取り込み後に手動で `draft: false` とした本文のscript、イベント属性、inline SVG、iframe、javascriptリンクが実ブラウザで動作した。執筆画面の読む表示自体は文字表示で安全だった。 | 本文の生HTMLと危険URLをMarkdown ASTと生成属性の両方で拒否。HTMLコメントは配布HTMLから除く。元ファイルは変更しない。                                        |
| 画像の相対import | 自作PNGを `../../../synthetic-private-image.png` で参照すると、public外の画像が `dist/_astro/` に取り込まれた。                                                                | 本文画像を `/images/` 配下のraster画像に限定。外部画像、相対ファイルimport、SVGを受け渡し対象から除外。参照記法も検証する。                                |
| loaderの例外処理 | Astroのglob loaderはrenderer例外をログに残して空本文でbuildを続行した。                                                                                                        | setup時の独立preflightで全Markdownを検証し、危険入力で終了コード1にする。公開filter前の画像収集も防ぐ。                                                    |
| URL・frontmatter | schemaが認証情報や制御文字を含むHTTPS入力を十分に制限していなかった。                                                                                                          | schema、取り込み・書き出し、公開本文で共通のURL境界を使用。frontmatterは既存の厳格なYAML解析も通す。題・要約・画像altはHTMLへ文字として出力。              |
| 通常配布         | `/write/` と `/directions/` が通常buildに含まれた。localhostで入口を隠しても成果物には残った。                                                                                 | ローカル専用ページを `src/local-pages/` へ分離。明示フラグのときだけルートを登録し、通常出力から専用bundleと入口も外す。                                   |
| publicファイル   | `public/` はdraftや使用有無に関係なく全件コピーされる。現在の実データに非公開画像の混入はなかった。                                                                            | `src/data/public-assets.json` で採用したraster画像だけを許可。未採用ファイル、symlink、形式の違う画像はコピー前に停止。固定faviconは確認済みdigestで制限。 |
| 許諾文           | 執筆用bundleへ入るentities・yaml・Vite helperの許諾文が配布物に揃っていなかった。                                                                                              | 対応バージョンの全文を `public/third-party-notices.txt` へ同梱。lockfile・インストール版・配布ファイルとの一致をテスト。                                   |

この境界は、Markdownを受け取る場所から配布物までを対象にします。リポジトリ内のAstro・JavaScript・設定ファイル自体は、引き続きレビューされる実装コードです。

## buildと入力の使い方

公開済みコンテンツ0件の現在は、`npm run build` が通常5ページ、`npm run build:local` が執筆・方向性を含む12ページ、`npm run build:compare` が比較2案も含む14ページを作ります。`npm run dev` は執筆と方向性を有効にし、比較案には追加で `LOCAL_COMPARISON=1` が必要です。フラグ、localhost表示、noindexはアクセス制限ではありません。配布用にはフラグを外してbuildし直します。

preflightは `src/content/notes/` と `src/content/works/` の**下書きも含む全.md**を検証します。HTMLや不正URLを含む文章は執筆画面で原文を保って編集・ダウンロードできますが、そのままリポジトリへ追加するとbuildが止まります。コード例はコードフェンスへ入れてください。1 MiBのファイル上限、64 KiBのfrontmatter上限、未知キー・YAMLエイリアス等の拒否も共通です。schemaへ項目を追加する際は受け渡し側と同時に更新します。

画像を採用する手順は [CONTENT.md](CONTENT.md) にあります。形式ヘッダの確認は画像全体のデコードやメタデータ除去ではありません。現在の画像採用リストは空です。本文だけを下書きに戻しても、採用済み画像は配布されます。

buildが失敗した場合、前回の `dist/` が残ることがあります。失敗したコマンドの残存成果物は配布対象にしません。

## 検証結果

| 確認          | 結果                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自動検査      | 整形、Astro check、75テスト。入力・既存の往復編集・安全な読む表示・生成リンク・下書き除外・画像・許諾文を対象。                                                                          |
| buildモード   | root通常5、base付き通常5、base付きlocal12、base付きcompare14を生成。各設定で75テスト成功。                                                                                               |
| Pages base    | `/hamaya-site-draft` と検証用origin `https://example.invalid` でcanonical、HTML/CSSの参照先、動的importを確認。                                                                          |
| 再buildと漏出 | 独立コピーでlocal→通常、base付きcompare→通常へ戻した。試作ルート・専用bundleが消え、下書きの題・説明・本文・タグに置いた合成canaryが全生成ファイルのbyte列にない。                       |
| 配布物        | source map、元Markdown、端末パスの混入なし。未採用publicファイルを置くfixtureは終了コード1、配布先へのコピーなし。                                                                       |
| 実ブラウザ    | Chromium 153。root/base各1280・375・320pxでトップ・作品・記事・自己紹介、空状態、キーボードの本文移動、横overflowなし。通常出力の執筆・方向性・比較URLは404。                            |
| 執筆の回帰    | base付き1280・375pxでlocal入口、動的import、作品Markdown取り込み、危険URLの拒否と入力保持、読む表示の無実行・Enterで遷移しないこと、Blob書き出しの本文・画像パス保持とdraft:trueを確認。 |

ブラウザ検証の取得データは [audit-evidence.json](audit-evidence.json) にまとめます。合成データは隔離コピーにのみ置き、本体コンテンツ9件はすべて下書きのままです。以前の見た目・操作検証は [FOCUS_STUDY.md](FOCUS_STUDY.md) と [VALIDATION.md](VALIDATION.md) にあり、後者の12ページやSVG fixtureの記録は修復前のものです。

## 依存advisoryの残り

`npm audit --json` はhighを2項目報告しました。インストール済み `http-cache-semantics@4.2.0` とその依存元 `astro@7.3.5` が、同一の [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) に該当します。2026-10-04 UTCの公式情報では修正版は未提供です。依存の問題自体は未解消です。

報告される条件は、利用者のmax-stale指定を処理する共有HTTPキャッシュです。インストール済みAstroの利用箇所は `dist/assets/build/remote.js` のみで、build画像処理が `storable()` と `timeToLive()` を呼びます。問題のrequest評価メソッドはAstroから呼ばれていません。本サイトはstatic出力で、SSR adapter、認証セッション、利用者間の共有応答キャッシュを持たず、Markdownのリモート画像も拒否します。確認した構成で問題の利用経路は見つかりませんでした。将来SSR・共有キャッシュ・外部画像処理を追加する場合は再評価が必要です。

npmが示すAstro 2.10.9への大幅なダウングレードは適用していません。これは修正版の導入ではなく、本体互換性を壊し得るためです。

## 素材と次の接続

今回の図形はサイト内の自作SVG、文字はシステムフォントです。参照サイトのコード・写真・ロゴ・動画・フォントは追加していません。yomiyasuを含む参照先の実読範囲・利用条件は [REFERENCES.md](REFERENCES.md)、配布コードの許諾全文は [third-party-notices.txt](../public/third-party-notices.txt) に残しています。

制作道具との最小の受け渡し条件は [TOOL_CONNECTION.md](TOOL_CONNECTION.md) にあります。別スレッドの実装は未読なので、その保存・ログ・連携が検証済みとはしていません。本人の文章、写真、AtCoder URL、作品と記事の採否、ホーム案と公開範囲は引き続き本人の判断待ちです。
