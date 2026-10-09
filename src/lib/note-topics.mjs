/** Display labels only: retain the owner's original Markdown and draft flag. */
export function noteTopics(entry) {
  if (['legacy-cyberpunk2077-1', 'cyberpunk2077-1'].includes(entry.id))
    return ['ゲーム', '感想'];
  return [
    ...new Set([
      entry.data.category,
      ...entry.data.tags.filter((tag) => ['ゲーム', '感想'].includes(tag)),
    ]),
  ];
}
