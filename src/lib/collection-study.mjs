// Only the six public repositories already checked in docs/MIGRATION.md are
// authorized for this local comparison. This is not a publication selection.
export const comparisonSources = [
  ['import-typeandsummon', 'TypeAndSummon', true],
  ['import-game-ai-search-puzzles', 'game-ai-search-puzzles', true],
  ['import-de10-nano-riscv-invader', 'de10-nano-riscv-invader', true],
  ['import-de10-nano-voice-changer', 'de10-nano-voice-changer', true],
  ['import-pong-study-raylib', 'pong-study-raylib', true],
  ['import-one-board-incremental', 'one-board-incremental', false],
].map(([id, name, hasDescription]) => ({
  id: String(id),
  name: String(name),
  repository: `https://github.com/KOSEIHAMAYA2077/${name}`,
  hasDescription: Boolean(hasDescription),
}));

/** @param {string | undefined} value */
export const comparisonEnabled = (value) => value === '1';

/**
 * Project the verified source fields only. Prepared dates, status, body, roles,
 * images and unconfirmed relationships never reach the comparison page.
 * @param {Array<{ id: string, data: { title: string, description: string, repository?: string } }>} entries
 * @param {Record<string, string[]>} [relationships] Owner-confirmed note IDs only.
 * @param {Array<{ id: string, data: { title: string, draft: boolean } }>} [notes]
 */
export function collectionStudy(entries, relationships = {}, notes = []) {
  return comparisonSources.map((source) => {
    const entry = entries.find(({ id }) => id === source.id);
    if (!entry || entry.data.repository !== source.repository)
      throw new Error(`比較元の確認が必要です: ${source.id}`);
    return {
      id: source.id,
      title: entry.data.title,
      description: source.hasDescription ? entry.data.description : null,
      repository: source.repository,
      relatedNotes: notes
        .filter(
          (note) =>
            relationships[source.id]?.includes(note.id) &&
            note.data.draft === false &&
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.id),
        )
        .map((note) => ({ id: note.id, title: note.data.title })),
    };
  });
}
