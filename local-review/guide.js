const form = document.querySelector('[data-choice-form]');
if (form) {
  const note = document.querySelector('#choice-note');
  const status = document.querySelector('[data-copy-status]');
  const fallback = document.querySelector('[data-copy-fallback]');
  const output = document.querySelector('#copy-text');
  let version = 0;
  const resetOutput = () => {
    version++;
    fallback.hidden = true;
    output.value = '';
    status.textContent = 'この画面を再読み込みすると選択は消えます。';
  };
  form.reset();
  form.hidden = false;
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('change', resetOutput);
  form.addEventListener('input', resetOutput);
  form.addEventListener('reset', resetOutput);
  document.querySelector('[data-copy]').addEventListener('click', async () => {
    const fields = new FormData(form);
    const text = [
      'サイト案の相談用メモ',
      `ホーム：${fields.get('home')}`,
      `作品の開き方：${fields.get('reading')}`,
      `実験を見る入口：${fields.get('experiments')}`,
      note.value.trim() ? `気になったこと：${note.value.trim()}` : '',
      '作品ごとの掲載採否は別途確認。',
      'このメモだけで実装への反映・統合・公開は行いません。',
    ]
      .filter(Boolean)
      .join('\n');
    const atVersion = version;
    try {
      await navigator.clipboard.writeText(text);
      if (atVersion === version)
        status.textContent =
          '相談用メモをコピーしました。実装・公開設定は変わりません。';
    } catch {
      if (atVersion !== version) return;
      output.value = text;
      fallback.hidden = false;
      output.focus();
      output.select();
      status.textContent = '一覧を選択しました。コピーして持ち帰れます。';
    }
  });
}
