import { collectionStudy } from './collection-study.mjs';

/**
 * Keep the collection's verified work and relationship boundary. The excerpt is
 * the published note's own description; no body or inferred summary is used.
 * @param {Array<{ id: string, data: { title: string, description: string, repository?: string } }>} entries
 * @param {Record<string, string[]>} [relationships] Owner-confirmed note IDs only.
 * @param {Array<{ id: string, data: { title: string, draft: boolean, description?: string } }>} [notes]
 */
export function focusStudy(entries, relationships = {}, notes = []) {
  return collectionStudy(entries, relationships, notes).map((entry) => ({
    ...entry,
    relatedNotes: entry.relatedNotes.map((note) => {
      const description = notes.find(
        (source) => source.id === note.id && source.data.draft === false,
      )?.data.description;
      return {
        ...note,
        excerpt:
          typeof description === 'string' && description.length > 0
            ? description
            : null,
      };
    }),
  }));
}
