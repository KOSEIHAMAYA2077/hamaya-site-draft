import {
  parseMakerField,
  convertMakerField,
  MAX_INPUT_BYTES,
  RECORD_FIELDS,
  LABELS,
} from './adapter.mjs';

const root = document.querySelector('[data-maker-field]');
if (root) {
  const get = (id) => root.querySelector(`#maker-${id}`);
  const fileInput = get('file');
  const fileStatus = get('file-status');
  const pendingPanel = get('pending');
  const pendingInfo = get('pending-info');
  const loadButton = get('load');
  const choice = get('choice');
  const selectionStatus = get('selection-status');
  const description = get('description');
  const category = get('category');
  const slug = get('slug');
  const prepareButton = get('prepare');
  const errorPanel = get('error');
  const resultPanel = get('result');
  const downloadButton = get('download');
  const downloadStatus = get('download-status');
  const nextLink = get('next');
  const kinds = {
    logs: '制作ログ',
    experiments: '比較・実験',
    ideas: 'アイデア',
  };
  const previewLimit = 100000;
  let active;
  let pending;
  let rows = [];
  let selected;
  let result;
  let loadVersion = 0;
  let editVersion = 0;
  const downloadedNames = new Set();
  const recordInputs = new Map();
  const objectURLs = new Set();

  function setStatus(element, message) {
    element.textContent = message;
  }
  function showError(message) {
    errorPanel.hidden = false;
    setStatus(errorPanel, message);
  }
  function clearResult() {
    editVersion += 1;
    result = undefined;
    resultPanel.hidden = true;
    downloadButton.disabled = true;
    nextLink.hidden = true;
    errorPanel.hidden = true;
    for (const input of [description, category, slug])
      input.removeAttribute('aria-invalid');
    setStatus(downloadStatus, '');
    prepareButton.disabled = !selected;
  }
  function shortPreview(text, remaining) {
    if (text.length <= remaining) return { text, used: text.length };
    let part = text.slice(0, remaining);
    if (/[\ud800-\udbff]$/.test(part)) part = part.slice(0, -1);
    return {
      text: `${part}\n…（長い項目のため表示を省略しています。書き出しでは原文を使います。）`,
      used: remaining,
    };
  }
  function clearSelection() {
    selected = undefined;
    clearResult();
    get('preview').hidden = true;
    get('output-fields').hidden = true;
    get('fields').replaceChildren();
    description.value = '';
    category.value = '';
    slug.value = '';
    setStatus(selectionStatus, '残したい1件を選んでください。');
  }
  function renderSelection() {
    if (selected)
      recordInputs.set(JSON.stringify(selected), {
        description: description.value,
        category: category.value,
        slug: slug.value,
      });
    clearSelection();
    const index = Number(choice.value);
    if (!choice.value || !Number.isInteger(index) || !rows[index]) return;
    const { collection, record } = rows[index];
    get('preview').hidden = false;
    setStatus(get('title'), record.title || '題が未入力の記録');
    setStatus(
      get('meta'),
      `${kinds[collection]} / ${record.date || '日付が未入力'}${record.sample === true ? ' / 架空のサンプル' : ''}`,
    );
    const fragment = document.createDocumentFragment();
    let remaining = previewLimit;
    for (const key of RECORD_FIELDS) {
      if (!Object.hasOwn(record, key) || ['title', 'date'].includes(key))
        continue;
      const term = document.createElement('dt');
      term.textContent = LABELS[key] || (key === 'tags' ? 'タグ' : key);
      const detail = document.createElement('dd');
      const value = record[key];
      if (['beforeImage', 'afterImage'].includes(key) && value) {
        detail.textContent =
          '画像あり。画像本体は下書きに含めず、省略したことを記録します。';
      } else {
        const text =
          typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        const preview = shortPreview(text || '（空文字）', remaining);
        if (text.includes('\n') || text.includes('\r') || text.length > 200) {
          const block = document.createElement('pre');
          block.tabIndex = 0;
          block.textContent = preview.text;
          detail.append(block);
        } else detail.textContent = preview.text;
        remaining = Math.max(0, remaining - preview.used);
      }
      fragment.append(term, detail);
    }
    get('fields').replaceChildren(fragment);
    if (!record.title?.trim() || !record.date) {
      setStatus(
        selectionStatus,
        'この記録は題か日付が未入力です。Maker Fieldで入力し、JSONを書き出し直してください。',
      );
      return;
    }
    selected = { collection, id: record.id };
    const saved = recordInputs.get(JSON.stringify(selected));
    if (saved) {
      description.value = saved.description;
      category.value = saved.category;
      slug.value = saved.slug;
    }
    get('output-fields').hidden = false;
    prepareButton.disabled = false;
    setStatus(
      selectionStatus,
      saved
        ? 'この記録の要約・分類・ファイル名を戻しました。内容を確認できます。'
        : 'この1件だけを下書きにします。要約・分類・ファイル名を入力してください。',
    );
  }
  function applyPending() {
    if (!pending) return;
    active = pending;
    pending = undefined;
    pendingPanel.hidden = true;
    rows = [];
    recordInputs.clear();
    clearSelection();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '記録を選んでください';
    const options = document.createDocumentFragment();
    options.append(placeholder);
    for (const [collection, label] of Object.entries(kinds)) {
      const group = document.createElement('optgroup');
      group.label = `${label}（${active.state[collection].length}件）`;
      for (const record of active.state[collection]) {
        const option = document.createElement('option');
        option.value = String(rows.length);
        option.textContent = `${record.date || '日付なし'}　${record.title || '題なし'}`;
        rows.push({ collection, record });
        group.append(option);
      }
      if (group.children.length) options.append(group);
    }
    choice.replaceChildren(options);
    choice.disabled = rows.length === 0;
    get('records').hidden = false;
    setStatus(get('count'), `${active.name} / ${rows.length}件`);
    setStatus(
      fileStatus,
      `${active.name} を開きました。元のJSONは変更していません。`,
    );
    if (!rows.length)
      setStatus(
        selectionStatus,
        'このJSONには記録がありません。別のファイルを選べます。',
      );
    else choice.focus();
  }
  function cancelPending() {
    loadVersion += 1;
    pending = undefined;
    pendingPanel.hidden = true;
    fileInput.value = '';
    setStatus(
      fileStatus,
      active
        ? '読み込みをやめました。いま開いている記録と入力はそのままです。'
        : '読み込みをやめました。ファイルを選び直せます。',
    );
    fileInput.focus();
  }
  async function readFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    const version = ++loadVersion;
    pending = undefined;
    pendingPanel.hidden = false;
    loadButton.disabled = true;
    setStatus(pendingInfo, `${file.name} を確認しています。`);
    setStatus(fileStatus, '選んだファイルを、このブラウザ内で確認しています。');
    try {
      if (!/\.json$/i.test(file.name))
        throw new Error('.json ファイルを選んでください。');
      if (file.size > MAX_INPUT_BYTES)
        throw new Error('JSONは8 MiB以内にしてください。');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (version !== loadVersion) return;
      const state = parseMakerField(bytes);
      if (version !== loadVersion) return;
      pending = { bytes, state, name: file.name };
      const counts = Object.entries(kinds)
        .map(([key, label]) => `${label}${state[key].length}件`)
        .join('・');
      setStatus(
        pendingInfo,
        `${file.name} / ${counts}${active ? '。このJSONを開くと、いまの選択・要約・設定を置き換えます。' : '。元のJSONは変更しません。'}`,
      );
      loadButton.disabled = false;
      setStatus(
        fileStatus,
        '形式を確認しました。開くファイルを確認してください。',
      );
    } catch (error) {
      if (version !== loadVersion) return;
      pendingPanel.hidden = true;
      setStatus(
        fileStatus,
        `${error instanceof Error ? error.message : 'ファイルを確認してください。'}${active ? ' いまの記録と入力はそのままです。' : ''}`,
      );
    } finally {
      if (version === loadVersion) fileInput.value = '';
    }
  }
  async function prepare() {
    if (!active || !selected) return;
    clearResult();
    const version = editVersion;
    prepareButton.disabled = true;
    try {
      const invalid = (field, message) => {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
        throw new Error(message);
      };
      if (!description.value.trim())
        invalid(description, '短い要約を入力してください。');
      if (!['学び', '雑記'].includes(category.value))
        invalid(category, '分類を選んでください。');
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.value) ||
        slug.value.length > 64
      )
        invalid(
          slug,
          'ファイル名は半角英小文字・数字・ハイフンで64文字以内にしてください。例：maker-note-01',
        );
      const options = {
        ...selected,
        slug: slug.value,
        description: description.value,
        category: category.value,
      };
      if (downloadedNames.has(`${options.slug}.md`))
        throw new Error(
          'この画面ですでに使ったファイル名です。別の名前にしてください。',
        );
      const converted = await convertMakerField(active.bytes, options);
      // Verify the exact file through the existing writer's import contract.
      const { importDraft } = await import('../lib/draft-import.mjs');
      const imported = importDraft(converted.markdown, converted.filename);
      if (imported.originalDraft !== true)
        throw new Error('下書き形式を確認できませんでした。');
      if (version !== editVersion) return;
      result = converted;
      resultPanel.hidden = false;
      setStatus(
        get('output-summary'),
        `${converted.filename} / ${new TextEncoder().encode(converted.markdown).length.toLocaleString('ja-JP')} bytes / 記事1件・draft: true${converted.report.omittedImages.length ? ` / 画像${converted.report.omittedImages.length}件の省略を記録` : ''}`,
      );
      setStatus(
        get('output-preview'),
        shortPreview(converted.markdown, previewLimit).text,
      );
      setStatus(
        downloadStatus,
        '内容を確認して、Markdownの下書きを持ち帰れます。',
      );
      downloadButton.disabled = false;
      downloadButton.focus();
    } catch (error) {
      if (version === editVersion)
        showError(
          error instanceof Error
            ? error.message
            : '下書きを確認できませんでした。',
        );
    } finally {
      if (version === editVersion) prepareButton.disabled = !selected;
    }
  }
  function download() {
    if (!result) return;
    if (downloadedNames.has(result.filename)) {
      setStatus(
        downloadStatus,
        'この画面ですでに使ったファイル名です。名前を変え、「下書きを確認」からやり直せます。',
      );
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }),
      );
      objectURLs.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      downloadedNames.add(result.filename);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        objectURLs.delete(url);
      }, 10000);
      setStatus(
        downloadStatus,
        'ダウンロードを開始しました。「書く」画面の「Markdownを取り込む」で、保存したファイルを選んでください。',
      );
      nextLink.hidden = false;
      downloadButton.disabled = true;
    } catch {
      setStatus(
        downloadStatus,
        'ダウンロードを開始できませんでした。入力は残っています。もう一度試せます。',
      );
    }
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    fileInput.disabled = false;
    fileInput.addEventListener('change', readFile);
    fileInput.addEventListener('cancel', () => {
      if (!pending)
        setStatus(
          fileStatus,
          active
            ? 'ファイル選びをやめました。いまの記録と入力はそのままです。'
            : 'ファイルは選ばれていません。',
        );
    });
    loadButton.addEventListener('click', applyPending);
    get('cancel').addEventListener('click', cancelPending);
    choice.addEventListener('change', renderSelection);
    for (const input of [description, category, slug]) {
      input.addEventListener('input', clearResult);
      input.addEventListener('change', clearResult);
    }
    prepareButton.addEventListener('click', prepare);
    downloadButton.addEventListener('click', download);
    get('reset').addEventListener('click', () => {
      loadVersion += 1;
      active = undefined;
      pending = undefined;
      rows = [];
      recordInputs.clear();
      choice.replaceChildren();
      clearSelection();
      get('records').hidden = true;
      pendingPanel.hidden = true;
      fileInput.value = '';
      setStatus(
        fileStatus,
        '読み込んだ記録を閉じました。元のファイルはそのままです。',
      );
      fileInput.focus();
    });
    window.addEventListener('pagehide', () => {
      for (const url of objectURLs) URL.revokeObjectURL(url);
      objectURLs.clear();
    });
  } else setStatus(fileStatus, 'この道具はローカルの確認用画面で使えます。');
}
