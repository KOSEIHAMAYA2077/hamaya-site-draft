const root = document.querySelector('[data-timeline-study]');
if (root) {
  const panels = [...root.querySelectorAll('[data-timeline-panel]')];
  const indexLinks = [...root.querySelectorAll('[data-timeline-index]')];
  const picker = root.querySelector('[data-timeline-picker]');
  const indexScroll = root.querySelector('[data-timeline-scroll]');
  const status = root.querySelector('[data-timeline-status]');
  const defaultId = panels.at(-1)?.dataset.timelinePanel;
  const narrow = matchMedia('(max-width: 899px)');
  let currentId;

  function showIndexSelection() {
    const link = indexLinks.find(
      (item) => item.dataset.timelineChoice === currentId,
    );
    if (!indexScroll || !link || !picker?.open) return;
    const area = indexScroll.getBoundingClientRect();
    const bounds = link.getBoundingClientRect();
    if (bounds.top < area.top || bounds.bottom > area.bottom)
      indexScroll.scrollTop +=
        bounds.top - area.top - (indexScroll.clientHeight - bounds.height) / 2;
  }

  function select(id, { focus = false, announce = false } = {}) {
    const selected = panels.find((panel) => panel.dataset.timelinePanel === id);
    if (!selected) return false;
    for (const panel of panels) panel.hidden = panel !== selected;
    for (const link of indexLinks) {
      if (link.dataset.timelineChoice === id)
        link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    currentId = id;
    showIndexSelection();
    if (focus) {
      if (picker && narrow.matches) picker.open = false;
      selected.focus({ preventScroll: true });
      const bounds = selected.getBoundingClientRect();
      if (bounds.top < 0 || bounds.top > window.innerHeight / 2)
        selected.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    if (announce && status) {
      const title = selected.querySelector('h2')?.textContent?.trim() || '';
      status.textContent = `${title}を開きました。`;
    }
    return true;
  }

  function hashId() {
    if (!location.hash) return defaultId;
    if (!location.hash.startsWith('#record-')) return null;
    try {
      return decodeURIComponent(location.hash.slice('#record-'.length));
    } catch {
      return null;
    }
  }

  if (panels.length) {
    if (picker && narrow.matches) picker.open = false;
    root.dataset.timelineEnhanced = 'true';
    select(hashId() || defaultId) || select(defaultId);
    picker?.addEventListener('toggle', showIndexSelection);
    root.addEventListener('click', (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest('a[data-timeline-choice]');
      if (!link || !root.contains(link)) return;
      const id = link.dataset.timelineChoice;
      if (!panels.some((panel) => panel.dataset.timelinePanel === id)) return;
      event.preventDefault();
      if (id !== currentId || location.hash !== `#record-${id}`)
        history.pushState(null, '', `#record-${encodeURIComponent(id)}`);
      select(id, { focus: true, announce: true });
    });
    window.addEventListener('hashchange', () => {
      const id = hashId();
      if (id && id !== currentId) select(id, { focus: true, announce: true });
    });
  }
}
