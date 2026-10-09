export const PUBLIC_PREVIEW_NOTE_ID = 'cyberpunk2077-1';
export const PUBLIC_PREVIEW_NOTE_SOURCE =
  'https://koseihamaya2077.github.io/notes/cyberpunk2077-1.html';
export const PUBLIC_PREVIEW_NOTE_TITLE = '好きなゲームについて思うこと 1';

// This explicit selection was authorized separately from the local comparisons.
// Prepared dates, private bodies, roles and candidate records are not projected.
export const PUBLIC_PREVIEW_WORKS = Object.freeze(
  [
    {
      id: 'import-typeandsummon',
      title: 'TypeAndSummon',
      description:
        'Java Swing real-time typing battle game with HTTP/TCP multiplayer/ Used AI for coding and music, bgm only',
      repository: 'https://github.com/KOSEIHAMAYA2077/TypeAndSummon',
    },
    {
      id: 'import-game-ai-search-puzzles',
      title: 'game-ai-search-puzzles',
      description:
        'ゲームAIの探索アルゴリズム学習として，8パズルでIDSとA*を実装・比較した記録',
      repository: 'https://github.com/KOSEIHAMAYA2077/game-ai-search-puzzles',
    },
    {
      id: 'import-de10-nano-riscv-invader',
      title: 'de10-nano-riscv-invader',
      description:
        'DE10-NanoとQuartus Prime Lite 24.xで実装した簡易RV32I CPUによるインベーダー風ゲーム　no AI only me',
      repository: 'https://github.com/KOSEIHAMAYA2077/de10-nano-riscv-invader',
    },
    {
      id: 'import-de10-nano-voice-changer',
      title: 'de10-nano-voice-changer',
      description:
        'DE10-Nano message transmitter and real-time FFT voice changer created for a university IoT course / no AI',
      repository: 'https://github.com/KOSEIHAMAYA2077/de10-nano-voice-changer',
    },
    {
      id: 'import-pong-study-raylib',
      title: 'pong-study-raylib',
      description:
        'C++ and raylib Pong study project based on Programming With Nick tutorials/ no AI',
      repository: 'https://github.com/KOSEIHAMAYA2077/pong-study-raylib',
    },
    {
      id: 'import-one-board-incremental',
      title: 'one-board-incremental',
      description: null,
      repository: 'https://github.com/KOSEIHAMAYA2077/one-board-incremental',
    },
  ].map((source) => Object.freeze(source)),
);

/** @param {Array<{id: string, data: {title: string, description: string, repository?: string}}>} entries */
export function publicPreviewWorks(entries) {
  return PUBLIC_PREVIEW_WORKS.map((source) => {
    const entry = entries.find(({ id }) => id === source.id);
    if (
      !entry ||
      entry.data.title !== source.title ||
      entry.data.repository !== source.repository ||
      (source.description !== null &&
        entry.data.description !== source.description)
    )
      throw new Error(
        `公開プレビューの作品出典を確認してください: ${source.id}`,
      );
    return { ...source };
  });
}

/** @template {{id: string, data: {title: string, date: string, draft: boolean}}} T @param {T[]} entries @returns {T[]} */
export function publicPreviewNotes(entries) {
  const entry = entries.find(({ id }) => id === PUBLIC_PREVIEW_NOTE_ID);
  if (
    !entry ||
    entry.data.title !== PUBLIC_PREVIEW_NOTE_TITLE ||
    entry.data.date !== '2026-07-30' ||
    entry.data.draft !== true
  )
    throw new Error('公開プレビューの記事出典を確認してください。');
  return [entry];
}
