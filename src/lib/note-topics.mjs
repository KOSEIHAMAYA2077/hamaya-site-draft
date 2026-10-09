/** Display labels only: retain the owner's original Markdown and draft flag. */
export function noteTopics(entry) {
  if (entry.id === 'legacy-cyberpunk2077-1') return ['ゲーム', '感想'];
  return [
    ...new Set([
      entry.data.category,
      ...entry.data.tags.filter((tag) => ['ゲーム', '感想'].includes(tag)),
    ]),
  ];
}
