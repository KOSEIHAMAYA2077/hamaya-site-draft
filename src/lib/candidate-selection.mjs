/** Make a review list only; no publish or content mutation operation. */
export function candidateSelection(entries, selectedIds) {
  const selected = new Set(selectedIds);
  return entries
    .filter((entry) => selected.has(entry.id))
    .map(
      (entry) => `${entry.repository}\n${entry.title}\n${entry.repositoryUrl}`,
    )
    .join('\n\n');
}
