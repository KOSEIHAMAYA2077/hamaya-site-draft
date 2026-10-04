import {
  RETURN_STORAGE_KEY,
  readReturnState,
  enableReturnState,
  rememberReturnItem,
  clearReturnState,
  returnHref,
} from './return-state.mjs';
import {
  DISPLAY_STORAGE_KEY,
  PREFERENCES_EVENT,
  readDisplayPreferences,
} from './preferences.mjs';

/** Explicit local navigation choices only. No activity timeline or draft content. */
export function setupReturnEntry(base) {
  const error = document.querySelector('[data-return-error]');
  if (!error) return;
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    // Reading, writing, and code links remain available without browser storage.
  }
  const panel = document.querySelector('[data-return-panel]');
  const controls = document.querySelector('[data-return-controls]');
  const enable = controls?.querySelector('[data-return-enable]');
  const clear = controls?.querySelector('[data-return-clear]');
  const status = controls?.querySelector('[data-return-status]');
  let catalog = { work: [], note: [] };
  try {
    const raw = JSON.parse(
      panel?.querySelector('[data-return-catalog]')?.textContent || '{}',
    );
    for (const kind of ['work', 'note']) {
      if (Array.isArray(raw[kind])) {
        catalog[kind] = raw[kind].filter(
          (item) =>
            typeof item?.id === 'string' && typeof item?.title === 'string',
        );
      }
    }
  } catch {
    // A missing catalog yields empty links; never use a persisted URL or title.
  }
  const reportError = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };
  const render = (result) => {
    const state = result.state;
    const unavailable = result.error === 'storage';
    if (enable) enable.checked = state.enabled;
    if (panel) {
      panel.querySelector('[data-return-off]').hidden = state.enabled;
      panel.querySelector('[data-return-enabled]').hidden = !state.enabled;
      panel.querySelector('[data-return-off-message]').textContent = unavailable
        ? '前回の場所を確認できません。'
        : '前回の場所は保存していません。';
      for (const kind of ['work', 'note']) {
        const item = catalog[kind].find((item) => item.id === state[kind]);
        const href = item && returnHref(kind, item.id, base);
        const link = panel.querySelector(`[data-return-${kind}-link]`);
        const empty = panel.querySelector(`[data-return-${kind}-empty]`);
        link.hidden = !href;
        empty.hidden = Boolean(href);
        if (href) {
          link.setAttribute('href', href);
          link.textContent = `${item.title} →`;
        } else {
          link.removeAttribute('href');
          link.textContent = '';
        }
      }
    }
    if (status) {
      status.textContent = unavailable
        ? 'このブラウザでは前回の場所を読み出せません。閲覧と執筆はそのまま使えます。'
        : state.enabled
          ? 'これから選んだ制作と開いた記録を、それぞれ1件だけ残します。'
          : '前回の場所は保存していません。';
    }
    reportError(
      unavailable ? 'このブラウザでは前回の場所を読み出せません。' : '',
    );
  };
  const refresh = () => render(readReturnState(storage));
  const syncExperiment = (preferences = readDisplayPreferences(storage)) => {
    const link = panel?.querySelector('[data-return-experiment]');
    if (link) link.hidden = !preferences.experiments;
  };
  const remember = (kind, id) => {
    const result = rememberReturnItem(kind, id, storage);
    render(result);
    if (!result.ok && result.error === 'storage')
      reportError(
        '前回の場所を保存できませんでした。閲覧と執筆はそのまま使えます。',
      );
  };
  enable?.addEventListener('change', () => {
    const shouldEnable = enable.checked;
    const result = shouldEnable
      ? enableReturnState(storage)
      : clearReturnState(storage);
    render(result);
    const message = result.ok
      ? shouldEnable
        ? '保存をONにしました。これから選んだ制作と開いた記録を残します。'
        : '保存をやめて履歴を消しました。'
      : shouldEnable
        ? '保存をONにできませんでした。閲覧と執筆はそのまま使えます。'
        : '履歴を削除できませんでした。ブラウザのサイトデータ設定から削除できます。';
    if (status) status.textContent = message;
    reportError(result.ok ? '' : message);
  });
  clear?.addEventListener('click', () => {
    const result = clearReturnState(storage);
    render(result);
    const message = result.ok
      ? '保存をやめて履歴を消しました。'
      : '履歴を削除できませんでした。ブラウザのサイトデータ設定から削除できます。';
    if (status) status.textContent = message;
    reportError(result.ok ? '' : message);
  });
  const selectedWork = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const choice = event.target.closest(
      '[data-focus-study] [data-focus-choice]',
    );
    if (choice) remember('work', choice.getAttribute('data-focus-choice'));
  };
  document.addEventListener('click', selectedWork);
  document.addEventListener('auxclick', selectedWork);
  window.addEventListener('storage', (event) => {
    // Read the current key. Delayed events never resurrect their old payload.
    if (event.key === RETURN_STORAGE_KEY || event.key === null) refresh();
    if (event.key === DISPLAY_STORAGE_KEY || event.key === null)
      syncExperiment();
  });
  window.addEventListener(PREFERENCES_EVENT, (event) => {
    if (typeof event.detail?.experiments === 'boolean')
      syncExperiment(event.detail);
  });
  window.addEventListener('pageshow', () => {
    // Back/forward restoration is read-only, even after another tab deleted history.
    refresh();
    syncExperiment();
  });
  refresh();
  syncExperiment();
  if (controls) controls.hidden = false;
  const note = document
    .querySelector('[data-return-note-id]')
    ?.getAttribute('data-return-note-id');
  if (note) remember('note', note);
}
