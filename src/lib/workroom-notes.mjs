// Only this migrated, owner-written record is included in the local review.
// A new file, a sample, or a draft:false flag does not expand this allowlist.
export const WORKROOM_NOTE_IDS = Object.freeze(['legacy-cyberpunk2077-1']);

/**
 * Return the original Astro entries, without changing their draft status or copy.
 * Route injection is separately restricted to the explicit LOCAL_WORKROOM build.
 * @template {{ id: string, collection: string, data: { date: string } }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
export function workroomNotes(entries) {
  return entries
    .filter(
      (entry) =>
        entry.collection === 'notes' && WORKROOM_NOTE_IDS.includes(entry.id),
    )
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
}
