/** Display choices only. Never store drafts, search text, or imported content. */
export const DISPLAY_STORAGE_KEY = 'hamaya-workroom-display-v1';
export const MOTION_STORAGE_KEY = 'archive-motion';
export const PREFERENCES_EVENT = 'workroom:preferences-change';
export const MOTION_EVENT = 'workroom:motion-change';
export const defaultDisplayPreferences = Object.freeze({
  version: 1,
  timeline: true,
  experiments: true,
});

export function parseDisplayPreferences(raw) {
  try {
    const value = JSON.parse(raw);
    if (
      value === null ||
      Array.isArray(value) ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 3 ||
      value.version !== 1 ||
      typeof value.timeline !== 'boolean' ||
      typeof value.experiments !== 'boolean'
    )
      return { ...defaultDisplayPreferences };
    return {
      version: 1,
      timeline: value.timeline,
      experiments: value.experiments,
    };
  } catch {
    return { ...defaultDisplayPreferences };
  }
}

export function readDisplayPreferences(storage) {
  try {
    return parseDisplayPreferences(storage?.getItem(DISPLAY_STORAGE_KEY));
  } catch {
    return { ...defaultDisplayPreferences };
  }
}

export function saveDisplayPreferences(value, storage) {
  if (
    typeof value?.timeline !== 'boolean' ||
    typeof value?.experiments !== 'boolean'
  )
    return false;
  try {
    if (!storage) return false;
    storage.setItem(
      DISPLAY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        timeline: value.timeline,
        experiments: value.experiments,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readMotionPreference(storage) {
  try {
    return storage?.getItem(MOTION_STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

export function saveMotionPreference(paused, storage) {
  if (typeof paused !== 'boolean') return false;
  try {
    if (!storage) return false;
    storage.setItem(MOTION_STORAGE_KEY, paused ? 'off' : 'on');
    return true;
  } catch {
    return false;
  }
}
