# 公開GitHubの作品候補

公開リポジトリを読んで、本人が掲載候補を選べるようにした調査用の別collectionです。独立したprivateブランチ `work-candidates` で扱います。既存の作品6件の下書きと本人文は変更していません。候補9件はすべて `draft: true`、`decision: pending` です。

## 調査した範囲

2026-10-04に `KOSEIHAMAYA2077` の公開リポジトリ9件を通常のGitHub APIで確認しました。全件 `private: false`、`fork: false` です。調査時の一覧は[調査時の一覧](work-candidates-evidence/public-inventory.json) にあり、候補と根拠は [src/data/work-candidates.json](../src/data/work-candidates.json) に保存しています。

各候補の確認時SHAを固定し、根拠99件に読んだ範囲を記録しています。README、主要コード、設定、利用条件を読み、実装から分かる動作・技術・見る入口・未確認点を分けました。コードの実行、依存の導入、実機操作は行っていません。デモや動画への入口が存在することと、動作を検証したことも区別しています。

作者・担当範囲・AI利用についてのREADME記載は、出典の自己申告として残しています。GitHubアカウントやコミット日時から、単独制作、制作期間、本人の意図を推測していません。privateリポジトリの内容は候補に移していません。

| 候補                      | 今回の位置づけ・区別                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `glyph-matter`            | 追加候補。文字で立体を描く試作。mainと公開デモの配布元を区別し、デモの動作は未検証。                                                            |
| `semantic-glyph-lab`      | 追加候補。意味解釈や生成方式の比較。ローカルAPIの起動手順を公開デモURLとして扱わない。                                                          |
| `mining-forge`            | 追加候補。確認したmainは設計資料のみで、実行コードなし。README等の「非公開」表記とAPIの現在のpublic状態が食い違い、紹介する範囲は本人確認待ち。 |
| `TypeAndSummon`           | 既存下書きあり。READMEは課題の保管用と説明。画像・BGM・効果音・同梱JARの条件と授業公開可否は別途確認。                                          |
| `one-board-incremental`   | 既存下書きあり。mainのPrototype 0と、READMEが案内する別ブランチの試作を区別。                                                                   |
| `pong-study-raylib`       | 既存下書きあり。教材・スターターテンプレート由来。MITの著作権表示はNick Koumarisで、`fork: false` を本人の全面的な独自制作の証拠にしない。      |
| `de10-nano-voice-changer` | 既存下書きあり。授業制作との記載、Intel FFT IP等の条件あり。全体ライセンス未指定と、カーネルモジュールのGPL表示を区別。                         |
| `de10-nano-riscv-invader` | 既存下書きあり。Terasic公式回路・生成IP・公開時のCPU置換を区別。公開ソースと発表時の構成の同一性は未確認。                                      |
| `game-ai-search-puzzles`  | 既存下書きあり。8パズルと15パズルでAI利用の自己説明が異なる。保存結果を今回再現した成果として扱わない。                                         |

候補に取り込んだのは説明と出典URLです。元リポジトリのソース、画像、音声、動画、モデル、PDF、配布バイナリはサイトへコピーしていません。公開状態と転載・再配布の許諾は別に確認します。

## ローカルで比べる

`/compare/candidates/` は `LOCAL_CANDIDATES=1` を明示した場合だけ生成します。通常のdevや、ほかの比較用フラグだけでは有効にしません。

```sh
ASTRO_TELEMETRY_DISABLED=1 LOCAL_CANDIDATES=1 BASE_PATH=/hamaya-site-draft npm run build
ASTRO_TELEMETRY_DISABLED=1 LOCAL_CANDIDATES=1 BASE_PATH=/hamaya-site-draft npm test
ASTRO_TELEMETRY_DISABLED=1 LOCAL_CANDIDATES=1 BASE_PATH=/hamaya-site-draft npm run preview
```

この設定の入口は `http://127.0.0.1:4321/hamaya-site-draft/compare/candidates/` です。buildとtestには同じ設定を渡してください。`npm run build:candidates` も明示フラグ付きのbuildです。

画面では全9件、追加3件、既存下書き6件、選んだ候補で絞り込めます。チェックは画面内だけの仮選択で、再読み込みすると消えます。コピーするのは候補名・リポジトリ名・URLの一覧です。クリップボードを使えない場合は選択可能なテキストを表示します。ファイルの書き換え、draft解除、公開操作は行いません。

通常buildは現在の公開記事0件の状態で5ページを生成し、候補ページと候補データを配布物から除外する設計です。確認用出力を配布物にせず、すべての `LOCAL_*` フラグを外して通常buildをやり直します。`src/`、調査JSON、Git履歴を公開用の `public/` や `dist/` へコピーしないでください。ローカル用フラグと `noindex` は認証・アクセス制限ではありません。

## 本人が決めること

- どの候補・どの版を載せるか。保留や除外も含めて選ぶ。
- 短い紹介文、担当範囲、AI支援の説明を本人の言葉で確認する。制作期間を載せる場合は別途確認する。
- 授業・共同制作の公開条件、第三者素材の利用条件、掲載できる画面・写真を確かめる。
- 公開する入口と実際の動作を確認し、掲載用の作品下書きへ必要な内容だけ移す。

候補画面で選んでも採用・公開は確定しません。内容確認後の移行と、GitHub Pages等への公開判断は別の作業です。

## 検証結果

2026-10-04に完了。`npm run lint` はエラー・警告・hintなし。通常root、通常base＋canonical、候補root、候補base、制作道具のみ、比較＋実験＋候補の6設定でbuild・104テストが成功しました。通常は5ページ、候補は13ページ、全比較込みは16ページです。設定ごとの結果は [build-matrix.json](work-candidates-evidence/build-matrix.json) にあります。

Chromium 153.0.8010.12で、ホームの導線、9/3/6件のフィルタ、選択なし、キーボード選択、コピー成功／拒否、選択解除、再読み込み、390px／320px、reduced-motion、JavaScript無効の表示を確認しました。外部自動通信・console error・404はありません。コピー成功／拒否は隔離したClipboard APIで検査し、OSクリップボードへは書き込んでいません。外部のゲーム・モデル・配布ファイルは実行していません。記録は [browser.json](work-candidates-evidence/browser.json)、画像は [PC](work-candidates-evidence/desktop-overview.png)・[モバイル](work-candidates-evidence/mobile-overview.png)・[カード](work-candidates-evidence/mobile-card.png) です。

通常配布物には候補の本文・専用操作コード・入口が含まれないことを検査しました。既存のMarkdownとプロフィール設定は `experiment-study` の開始点から差分なし。候補選択だけで作品collectionへ移す処理はありません。
