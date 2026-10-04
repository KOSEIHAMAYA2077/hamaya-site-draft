/**
 * Opt-in return targets only. No content, URLs, queries, dates, or event log.
 * The version belongs to the key; unknown object fields are never accepted.
 */
export const RETURN_STORAGE_KEY = 'hamaya-workroom-return-v1';
export const RETURN_STORAGE_LIMIT = 1024;
export const RETURN_IDS = Object.freeze({
  work: Object.freeze([
    'import-typeandsummon',
    'import-game-ai-search-puzzles',
    'import-de10-nano-riscv-invader',
    'import-de10-nano-voice-changer',
    'import-pong-study-raylib',
    'import-one-board-incremental',
  ]),
  note: Object.freeze(['legacy-cyberpunk2077-1']),
});

/** @typedef {{enabled: boolean, work: string | null, note: string | null}} ReturnState */
/** @typedef {{ok: boolean, state: ReturnState, error: null | 'storage' | 'disabled' | 'invalid'}} ReturnResult */
/** @typedef {{getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void}} ReturnStorage */

/** @returns {ReturnState} */
const emptyState = () => ({ enabled: false, work: null, note: null });

/** @param {unknown} kind @param {unknown} id */
function knownItem(kind, id) {
  return (
    (kind === 'work' || kind === 'note') &&
    typeof id === 'string' &&
    RETURN_IDS[kind].includes(id)
  );
}

/** @param {unknown} raw @returns {ReturnState} */
function parseState(raw) {
  if (typeof raw !== 'string' || raw.length > RETURN_STORAGE_LIMIT)
    return emptyState();
  try {
    const value = JSON.parse(raw);
    if (
      value === null ||
      Array.isArray(value) ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 3 ||
      !['enabled', 'work', 'note'].every((key) => Object.hasOwn(value, key)) ||
      value.enabled !== true ||
      ![value.work, value.note].every(
        (id) => id === null || typeof id === 'string',
      )
    )
      return emptyState();
    return {
      enabled: true,
      work: knownItem('work', value.work) ? value.work : null,
      note: knownItem('note', value.note) ? value.note : null,
    };
  } catch {
    return emptyState();
  }
}

/**
 * Read without writing, repairing, migrating, or retaining a cached copy.
 * Malformed/old states are treated as off; unavailable storage is a failure.
 * @param {ReturnStorage | undefined | null} storage
 * @returns {ReturnResult}
 */
export function readReturnState(storage) {
  try {
    if (!storage) throw new Error('Storage unavailable.');
    return {
      ok: true,
      state: parseState(storage.getItem(RETURN_STORAGE_KEY)),
      error: null,
    };
  } catch {
    return { ok: false, state: emptyState(), error: 'storage' };
  }
}

/** @param {ReturnStorage | undefined | null} storage @returns {ReturnResult} */
function storageFailure(storage) {
  // A rejected removal or write must never be shown as successful. If reading
  // still works, expose the actual remaining state rather than a desired one.
  return { ...readReturnState(storage), ok: false, error: 'storage' };
}

/**
 * Enabling is an explicit fresh start, never an import of previous activity.
 * @param {ReturnStorage | undefined | null} storage
 * @returns {ReturnResult}
 */
export function enableReturnState(storage) {
  const state = { ...emptyState(), enabled: true };
  try {
    if (!storage) throw new Error('Storage unavailable.');
    storage.setItem(RETURN_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state, error: null };
  } catch {
    return storageFailure(storage);
  }
}

/**
 * Always re-read before a deliberate selection. A stale tab cannot restore its
 * cached IDs after another tab has cleared the key. Callers must not invoke this
 * during initial UI restoration, storage events, or pageshow handling.
 * @param {unknown} kind
 * @param {unknown} id
 * @param {ReturnStorage | undefined | null} storage
 * @returns {ReturnResult}
 */
export function rememberReturnItem(kind, id, storage) {
  const current = readReturnState(storage);
  if (!current.ok) return current;
  if (!knownItem(kind, id)) return { ...current, ok: false, error: 'invalid' };
  if (!current.state.enabled)
    return { ...current, ok: false, error: 'disabled' };
  // Project the exact schema even when a caller supplies unexpected arguments.
  const state = {
    enabled: true,
    work: kind === 'work' ? String(id) : current.state.work,
    note: kind === 'note' ? String(id) : current.state.note,
  };
  try {
    if (!storage) throw new Error('Storage unavailable.');
    storage.setItem(RETURN_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state, error: null };
  } catch {
    return storageFailure(storage);
  }
}

/**
 * Clearing also turns remembering off. It removes only this feature's key.
 * @param {ReturnStorage | undefined | null} storage
 * @returns {ReturnResult}
 */
export function clearReturnState(storage) {
  try {
    if (!storage) throw new Error('Storage unavailable.');
    storage.removeItem(RETURN_STORAGE_KEY);
    return { ok: true, state: emptyState(), error: null };
  } catch {
    return storageFailure(storage);
  }
}

/**
 * Resolve known IDs, never stored URLs. Only an ordinary same-origin base path
 * is accepted, so even corrupted caller data cannot form an outside URL.
 * @param {unknown} kind
 * @param {unknown} id
 * @param {string} [base]
 * @returns {string | null}
 */
export function returnHref(kind, id, base = '/') {
  if (
    !knownItem(kind, id) ||
    typeof base !== 'string' ||
    base.length > 512 ||
    (base !== '' && !/^\/(?:[a-zA-Z0-9._~-]+\/?)*$/.test(base))
  )
    return null;
  const parts = base.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) return null;
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  return kind === 'work'
    ? `${prefix}/#piece-${id}`
    : `${prefix}/room/notes/${id}/`;
}
