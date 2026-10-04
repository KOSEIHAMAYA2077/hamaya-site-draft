/**
 * Keep only in-memory fingerprints of inputs whose download has started.
 * An undefined snapshot means there is no input to lose. A handoff says
 * nothing about whether the browser or user finished saving the file.
 */
export function createDraftHandoffTracker() {
  const handedOff = new Map();
  return {
    /** @param {Iterable<[string, string | undefined]>} entries */
    hasPending(entries) {
      for (const [key, snapshot] of entries) {
        if (snapshot !== undefined && handedOff.get(key) !== snapshot)
          return true;
      }
      return false;
    },
    /** @param {string} key @param {string} snapshot */
    handoff(key, snapshot) {
      handedOff.set(key, snapshot);
    },
    clear() {
      handedOff.clear();
    },
  };
}

/**
 * Opt-in native navigation protection; no persistence or form submission.
 * Browsers decide whether to display a prompt and what it says. Register
 * only while needed so a clean page does not retain a beforeunload listener.
 * @param {{
 *   enabled: boolean,
 *   target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
 *   hasUnsaved: () => boolean
 * }} options
 */
export function createUnsavedDraftGuard({ enabled, target, hasUnsaved }) {
  let listening = false;
  /** @param {BeforeUnloadEvent} event */
  function beforeUnload(event) {
    if (!hasUnsaved()) return;
    event.preventDefault();
    // A nonempty legacy fallback complements preventDefault; browsers supply
    // their own dialog text. See MDN's Window.beforeunload documentation.
    event.returnValue = 'unsaved';
  }
  function refresh() {
    const needed = enabled && hasUnsaved();
    if (needed === listening) return;
    listening = needed;
    if (needed) target.addEventListener('beforeunload', beforeUnload);
    else target.removeEventListener('beforeunload', beforeUnload);
  }
  refresh();
  return {
    refresh,
    dispose() {
      if (listening) target.removeEventListener('beforeunload', beforeUnload);
      listening = false;
    },
  };
}
