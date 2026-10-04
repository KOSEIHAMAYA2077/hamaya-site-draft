import { parseWorkCandidates } from './work-candidates.mjs';

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Keep explicit owner dates separate from the recorded Git commit timestamp. */
export function timelineStudy(candidates, ownerDates = {}) {
  if (!Array.isArray(candidates))
    throw new Error('作品候補は配列で指定してください。');
  const checked = candidates.length ? parseWorkCandidates(candidates) : [];
  if (
    !ownerDates ||
    typeof ownerDates !== 'object' ||
    Array.isArray(ownerDates)
  )
    throw new Error('本人入力の制作日は作品IDごとに指定してください。');
  const ids = new Set(checked.map((entry) => entry.id));
  for (const [id, value] of Object.entries(ownerDates)) {
    if (!ids.has(id)) throw new Error(`制作日の作品IDが見つかりません: ${id}`);
    if (value !== null && !calendarDate(value))
      throw new Error(
        `制作日は実在するYYYY-MM-DDかnullで指定してください: ${id}`,
      );
  }
  const entries = checked.map((entry) => {
    const at = entry.commitDate;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(at) ||
      !Number.isFinite(Date.parse(at)) ||
      new Date(at).toISOString() !== at.replace('Z', '.000Z')
    )
      throw new Error(
        `公開記録は確認済みのUTC日時で指定してください: ${entry.id}`,
      );
    return {
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      repository: entry.repositoryUrl,
      draft: true,
      publicRecord: {
        kind: 'commit-committer',
        date: at.slice(0, 10),
        at,
        commit: entry.commit,
        url: `${entry.repositoryUrl}/commit/${entry.commit}`,
        verifiedAt: entry.verifiedAt,
      },
      creationDate: Object.hasOwn(ownerDates, entry.id)
        ? ownerDates[entry.id]
        : null,
    };
  });
  // Day order only. The ID is a stable tie-breaker, not a same-day work order.
  entries.sort(
    (a, b) =>
      a.publicRecord.date.localeCompare(b.publicRecord.date) ||
      a.id.localeCompare(b.id, 'en'),
  );
  return entries;
}

export function timelineMonths(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const month = entry.publicRecord.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(entry);
  }
  return [...groups].map(([month, items]) => ({ month, entries: items }));
}

/** Positional neighbours never wrap the newest record back to the oldest. */
export function timelineNeighbours(entries, id) {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: entries[index - 1] ?? null,
    next: entries[index + 1] ?? null,
  };
}
