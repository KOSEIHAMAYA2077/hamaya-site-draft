# 既存資料の移植候補

準備日: 2026-10-03 UTC。

旧サイトの本文 1 件と、公開 GitHub リポジトリ 6 件を、本人が採否を決めるための下書きとして保存しました。すべて `draft: true` です。作品・記事とも生成サイトの公開件数は 0 件を維持します。下書きの保存は、外部公開の承認を意味しません。

## 読み取った資料と制約

- 正規の `list_projects` で local プロジェクト「濱谷康生のサイト」を確認しました。読み取り元は `/Users/hamayakousei/Documents/濱谷康生のサイト` です。
- 正規一覧では同名の ChatGPT プロジェクトを特定できず、最新 50 件の `list_threads` にも対象プロジェクトの会話はありませんでした。ChatGPT アーカイブは呼出環境の制限で読み取れません。これらの不足を別経路で迂回していません。
- 旧サイトのローカル Git リポジトリとファイルは read-only で確認しました。旧リポジトリは正規 GitHub connector で private と確認済みです。旧記事の公開 URL は未確認のため、推測した URL を付けていません。
- GitHub 作品は、既存の認証を使った `gh api repos/KOSEIHAMAYA2077/<name>` で、`visibility`、`private`、`description`、`html_url` を確認しました。以下の 6 件はすべて `visibility: public`、`private: false` でした。

## 移植した下書き

| 対象                                           | 下書きファイル                                                                              | 出典                                                                                                                                               | 扱い                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 好きなゲームについて思うこと 1 — Cyberpunk2077 | [legacy-cyberpunk2077-1.md](../src/content/notes/legacy-cyberpunk2077-1.md)                 | ローカル read-only 資料 `notes/cyberpunk2077-1.html`                                                                                               | 既存の言葉・段落・見出し・強調を保つ Markdown。題と `2026-07-30` は元ファイルの表示に基づく。公開 URL・投稿日としての外部確認は未了。採否待ち。 |
| TypeAndSummon                                  | [import-typeandsummon.md](../src/content/works/import-typeandsummon.md)                     | [GitHub](https://github.com/KOSEIHAMAYA2077/TypeAndSummon) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/TypeAndSummon)                     | API の既存説明だけを保存。採否待ち。                                                                                                            |
| de10-nano-riscv-invader                        | [import-de10-nano-riscv-invader.md](../src/content/works/import-de10-nano-riscv-invader.md) | [GitHub](https://github.com/KOSEIHAMAYA2077/de10-nano-riscv-invader) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/de10-nano-riscv-invader) | API の既存説明だけを保存。採否待ち。                                                                                                            |
| pong-study-raylib                              | [import-pong-study-raylib.md](../src/content/works/import-pong-study-raylib.md)             | [GitHub](https://github.com/KOSEIHAMAYA2077/pong-study-raylib) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/pong-study-raylib)             | API の既存説明だけを保存。採否待ち。                                                                                                            |
| de10-nano-voice-changer                        | [import-de10-nano-voice-changer.md](../src/content/works/import-de10-nano-voice-changer.md) | [GitHub](https://github.com/KOSEIHAMAYA2077/de10-nano-voice-changer) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/de10-nano-voice-changer) | API の既存説明だけを保存。採否待ち。                                                                                                            |
| game-ai-search-puzzles                         | [import-game-ai-search-puzzles.md](../src/content/works/import-game-ai-search-puzzles.md)   | [GitHub](https://github.com/KOSEIHAMAYA2077/game-ai-search-puzzles) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/game-ai-search-puzzles)   | API の既存説明だけを保存。採否待ち。                                                                                                            |
| one-board-incremental                          | [import-one-board-incremental.md](../src/content/works/import-one-board-incremental.md)     | [GitHub](https://github.com/KOSEIHAMAYA2077/one-board-incremental) / [API](https://api.github.com/repos/KOSEIHAMAYA2077/one-board-incremental)     | API の `description` が `null` のため「説明は未入力です。」を明示。採否待ち。                                                                   |

作品下書きの `date: 2026-10-03` は、この UTC 準備日です。制作日、完成日、大学在籍中の制作時期、公開日を推測したものではありません。日付を確認できるまでは `draft: true` を保ちます。`status: 記録` も、完成したという主張ではありません。

作品名と説明は GitHub API の値をそのまま使い、説明の日本語化、本人の役割、制作期間、成果、AI 利用範囲などの補足は書いていません。API の説明にある文言の現況も本人確認待ちです。画像・スクリーンショット・README 本文は自動転載していません。

旧雑記は HTML の表示上の空白を整理し、見出し 9 件と段落 15 件を Markdown に変換しました。本文の校正、事実修正、AI による追加はしていません。記事中の昔の出来事やプロフィールに触れる文章も、原文としての確認待ちです。自己紹介の項目へ転用していません。

## 除外した対象

| 対象                                                             | 理由と現在の扱い                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 旧プロフィールの大学・専攻・拠点など                             | 現況と採否が未確認。新プロフィールの事実として自動コピーしない。   |
| 旧サイトの黒・緑のテーマ、Canvas、時計、scanlines、noise、glitch | 新しい明るい設計へ置き換える。ブランドやレイアウトの転用はしない。 |
| 写真、画像、GitHub avatar、作品のスクリーンショット              | 本人が選んだ掲載素材と代替テキストを待つ。自動コピーしない。       |
| 未読の ChatGPT 会話・添付素材                                    | 正規機能で取得できた資料がない。内容を推測しない。                 |
| AtCoder プロフィール URL                                         | 本人の ID が未特定。他参加者の URL や推測した URL は使わない。     |
| 6 件以外の作品・別サービスの活動記録                             | 今回は選定していない。必要なものを本人が選ぶ。                     |
| 私的メール、非公開の業務資料、金融情報、内部メモ、認証情報       | 調査対象にもサイト・private repo の内容にも入れない。              |

## 本人が確認すること

1. 7 件それぞれの掲載・非掲載と、掲載する場合の順番。
2. 旧雑記を原文のまま継承するか。書き直す場合は本人の文章を使う。
3. 各作品の制作日、作品名、説明、本人の役割、画像、公開してよい範囲。
4. 説明が空の `one-board-incremental` に入れる本人の短い説明。
5. 自己紹介、写真、AtCoder URL、今回読み取れなかった過去の会話・添付素材。
6. `draft: false` に変更する内容と、GitHub Pages で外部公開する時期。

一覧と詳細ルートの両方が下書きを除外するため、ここで準備したファイルはローカルプレビューにも表示されません。本人確認のためには、この Markdown と元資料を見比べてください。

## 移植時の確認

- 元記事のファイルを読み取る前後で SHA-256 が一致しました。旧プロジェクトへの書き込みは行っていません。
- 元記事 SHA-256: `7ebf9aa781d0933e875fbd279fa178ff347758b805dff965d4a089fa4bb41e4b`。
- 下書きの題・日付は元記事の表示を、作品の URL・説明・公開状態は上記 GitHub API を根拠にしました。
- この移植では `docs/MIGRATION.md`、`src/content/notes/legacy-cyberpunk2077-1.md`、`src/content/works/import-*.md` だけを追加しました。
