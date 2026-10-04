import {
  Experiment as Clock,
  RULES as clockRules,
} from './vendor/action-clock/model.mjs';
import {
  Experiment as Motion,
  RULES as motionRules,
} from './vendor/motion-reaction/model.mjs';

function initializeExperiment() {
  const id = document.body.dataset.experiment;
  const isClock = id === 'clock';
  const model = isClock ? new Clock() : new Motion();
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  const modeSelect = document.querySelector('#mode');
  const presetSelect = document.querySelector('#preset');
  const pauseButton = document.querySelector('#pause');
  const stateElement = document.querySelector('#experiment-state');
  const statusElement = document.querySelector('#status');
  const statsElement = document.querySelector('#stats');
  const keys = new Set();
  const pointers = new Map();
  let running = false;
  let available = false;
  let pageActive = true;
  let raf = 0;
  let lastTime = 0;
  let startedAt = 0;
  let frameCount = 0;
  let reason = 'initial';
  const directions = new Map([
    ['arrowleft', 'left'],
    ['a', 'left'],
    ['arrowright', 'right'],
    ['d', 'right'],
    ['arrowup', 'up'],
    ['w', 'up'],
    ['arrowdown', 'down'],
    ['s', 'down'],
  ]);
  const reasons = {
    initial:
      '停止中です。方向キーや方向ボタン、または「同じ入力を再生」で始められます。',
    pause: '停止中です。止めたときの状態を保っています。',
    parent: 'ページ側から停止しました。',
    hidden: '非表示になったため停止しました。',
    blur: '操作画面を離れたため停止しました。',
    limit: '12秒経ったため停止しました。「続ける」を押すと再開できます。',
    complete: '再生が終わりました。結果を表示しています。',
    idle: '動きが止まりました。方向キーや方向ボタンで再開できます。',
    reset: '初期位置へ戻しました。停止中です。',
    step: '1コマ進めました。停止中です。',
  };

  function tell(type, details = {}) {
    parent.postMessage({ type, id, ...details }, '*');
  }
  function activeDirections() {
    return new Set(
      [...keys]
        .map((key) => directions.get(key))
        .concat([...pointers.values()].map(({ direction }) => direction)),
    );
  }
  function inputValue() {
    const held = activeDirections();
    const x = Number(held.has('right')) - Number(held.has('left'));
    return isClock
      ? { x, y: Number(held.has('down')) - Number(held.has('up')) }
      : x;
  }
  function clearInput() {
    keys.clear();
    const heldPointers = [...pointers.entries()];
    pointers.clear();
    for (const [pointerId, { button }] of heldPointers) {
      if (button.hasPointerCapture(pointerId))
        button.releasePointerCapture(pointerId);
    }
    for (const button of document.querySelectorAll('[data-direction]'))
      button.removeAttribute('data-held');
  }
  function stop(nextReason) {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
    clearInput();
    reason = nextReason;
    render();
    tell('experiment:paused', { reason });
  }
  function start() {
    if (running || !canAdvance()) return;
    running = true;
    tell('experiment:running');
    reason = 'running';
    startedAt = performance.now();
    lastTime = 0;
    render();
    raf = requestAnimationFrame(tick);
  }
  function manualInput() {
    if (!canAdvance()) return;
    if (model.replay.status === 'running') model.cancelReplay();
    start();
  }
  function tick(now) {
    if (!running) return;
    if (!canAdvance()) {
      stop('hidden');
      return;
    }
    if (now - startedAt >= 12000) {
      stop('limit');
      return;
    }
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    if (delta > 0) {
      if (model.replay.status === 'running') {
        model.advanceReplay(delta);
        frameCount += 1;
        if (model.replay.status === 'completed') {
          stop('complete');
          return;
        }
      } else {
        model.step(delta, inputValue());
        frameCount += 1;
        if (activeDirections().size === 0) {
          const snapshot = model.snapshot();
          const settled = isClock
            ? snapshot.mode === 'movement'
            : Math.abs(snapshot.player.velocity) +
                Object.values(snapshot.reaction).reduce(
                  (sum, value) => sum + Math.abs(value),
                  0,
                ) <
              0.0001;
          if (settled) {
            stop('idle');
            return;
          }
        }
      }
      render();
    }
    raf = requestAnimationFrame(tick);
  }
  function line(x1, y1, x2, y2, color = '#cecfc6', width = 1) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
  function circle(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  function drawClock(state) {
    const scale = 46;
    const ox = 28;
    const oy = 22;
    context.save();
    context.translate(ox, oy);
    context.fillStyle = '#e9ebe2';
    context.fillRect(0, 0, clockRules.width * scale, clockRules.height * scale);
    for (let x = 0; x <= clockRules.width; x++)
      line(x * scale, 0, x * scale, clockRules.height * scale);
    for (let y = 0; y <= clockRules.height; y++)
      line(0, y * scale, clockRules.width * scale, y * scale);
    const wall = clockRules.wall;
    context.fillStyle = '#777d73';
    context.fillRect(
      wall.x * scale,
      wall.y * scale,
      wall.width * scale,
      wall.height * scale,
    );
    circle(
      clockRules.goal.x * scale,
      clockRules.goal.y * scale,
      clockRules.goal.radius * scale,
      '#d4e88a',
    );
    context.fillStyle = '#253329';
    context.font = 'bold 17px system-ui';
    context.textAlign = 'center';
    context.fillText(
      'G',
      clockRules.goal.x * scale,
      clockRules.goal.y * scale + 6,
    );
    for (const hazard of state.hazards) {
      circle(
        hazard.x * scale,
        hazard.y * scale,
        (hazard.radius + 0.09) * scale,
        '#f9f8f2',
      );
      circle(
        hazard.x * scale,
        hazard.y * scale,
        hazard.radius * scale,
        '#b95a40',
      );
    }
    circle(
      state.player.x * scale,
      state.player.y * scale,
      (clockRules.radius + 0.06) * scale,
      '#f9f8f2',
    );
    circle(
      state.player.x * scale,
      state.player.y * scale,
      clockRules.radius * scale,
      '#243b37',
    );
    context.restore();
  }
  function drawMotion(state) {
    const scale = 54;
    const ox = 28;
    const ground = 232;
    const x = ox + state.player.x * scale;
    for (let i = 0; i <= motionRules.width; i++) {
      line(ox + i * scale, 48, ox + i * scale, ground, '#e0e2d8');
      context.fillStyle = '#6e756c';
      context.font = '13px system-ui';
      context.textAlign = 'center';
      context.fillText(String(i), ox + i * scale, ground + 24);
    }
    line(ox, ground, ox + motionRules.width * scale, ground, '#7b8575', 2);
    context.fillStyle = '#dae0d0';
    context.beginPath();
    context.ellipse(x, ground + 3, 35, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(x, ground - 10);
    context.rotate(state.displayed.angle);
    context.fillStyle = '#2c4540';
    context.fillRect(-15, -67, 30, 57);
    circle(0, -83, 15, '#2c4540');
    context.fillStyle = '#b8cd72';
    context.fillRect(-23 + state.displayed.cargo * scale, -51, 46, 30);
    context.strokeStyle = '#6c7b43';
    context.lineWidth = 2;
    context.strokeRect(-23 + state.displayed.cargo * scale, -51, 46, 30);
    context.restore();
    const arrow = state.player.velocity * 22;
    if (Math.abs(arrow) > 1) {
      line(x, 76, x + arrow, 76, '#7b8c48', 3);
      line(x + arrow, 76, x + arrow - Math.sign(arrow) * 8, 70, '#7b8c48', 3);
      line(x + arrow, 76, x + arrow - Math.sign(arrow) * 8, 82, '#7b8c48', 3);
    }
  }
  function canAdvance() {
    return available && pageActive && !document.hidden;
  }
  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }
  function setBodyData(key, value) {
    if (document.body.dataset[key] !== value)
      document.body.dataset[key] = value;
  }
  function render() {
    const state = model.snapshot();
    context.fillStyle = '#f5f6ee';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (isClock) drawClock(state);
    else drawMotion(state);
    setBodyData('running', String(running));
    setBodyData('frameCount', String(frameCount));
    setText(pauseButton, running ? '停止' : '続ける');
    const pauseLabel = running ? '実験を停止する' : '現在の状態から続ける';
    if (pauseButton.getAttribute('aria-label') !== pauseLabel)
      pauseButton.setAttribute('aria-label', pauseLabel);
    const status = running
      ? state.replay.status === 'running'
        ? state.replay.label
        : '操作中です。12秒でいったん停止します。'
      : reasons[reason];
    setText(statusElement, status);
    setText(
      statsElement,
      isClock
        ? `世界の時間 ${state.worldTime.toFixed(2)}秒　移動距離 ${state.distance.toFixed(2)}　接触 ${state.contactCount}回`
        : `位置 ${state.player.x.toFixed(2)}　速度 ${state.player.velocity.toFixed(2)}　傾き ${((state.displayed.angle * 180) / Math.PI).toFixed(1)}°`,
    );
    setText(
      stateElement,
      JSON.stringify({
        id,
        running,
        reason,
        frameCount,
        activeDirections: [...activeDirections()],
        state,
      }),
    );
  }
  function reset() {
    stop('reset');
    if (isClock) model.reset(modeSelect.value, presetSelect.value);
    else model.reset(modeSelect.value);
    frameCount = 0;
    render();
  }
  modeSelect.addEventListener('change', reset);
  presetSelect?.addEventListener('change', reset);
  document.querySelector('#reset').addEventListener('click', reset);
  document
    .querySelector('#pause')
    .addEventListener('click', () => (running ? stop('pause') : start()));
  document.querySelector('#replay').addEventListener('click', () => {
    if (!canAdvance()) return;
    stop('reset');
    if (isClock) model.beginReplay(presetSelect.value);
    else model.beginReplay();
    frameCount = 0;
    start();
  });
  document.querySelector('#step').addEventListener('click', () => {
    if (!canAdvance()) return;
    stop('step');
    if (model.replay.status !== 'running') {
      if (isClock) model.beginReplay(presetSelect.value);
      else model.beginReplay();
      frameCount = 0;
    }
    model.advanceReplay(1 / 30);
    frameCount += 1;
    if (model.replay.status === 'completed') reason = 'complete';
    render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      stop('pause');
      return;
    }
    if (
      event.target.closest('select, input, textarea') ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    // Shift/Caps Lock can change event.key between press and release.
    const key = event.key.toLowerCase();
    const direction = directions.get(key);
    if (!direction || (!isClock && ['up', 'down'].includes(direction))) return;
    event.preventDefault();
    if (!canAdvance() || (event.repeat && !running)) return;
    keys.add(key);
    manualInput();
  });
  document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (keys.has(key)) {
      event.preventDefault();
      keys.delete(key);
    }
  });
  for (const button of document.querySelectorAll('[data-direction]')) {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !canAdvance()) return;
      event.preventDefault();
      button.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        direction: button.dataset.direction,
        button,
      });
      button.dataset.held = 'true';
      manualInput();
    });
    const release = (event) => {
      pointers.delete(event.pointerId);
      button.removeAttribute('data-held');
      if (button.hasPointerCapture(event.pointerId))
        button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    // Enter/Space activation of a focused direction button takes a short finite step.
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || !canAdvance()) return;
      stop('step');
      model.cancelReplay();
      const direction = button.dataset.direction;
      const x = Number(direction === 'right') - Number(direction === 'left');
      model.step(
        0.12,
        isClock
          ? { x, y: Number(direction === 'down') - Number(direction === 'up') }
          : x,
      );
      frameCount += 1;
      render();
    });
  }
  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    if (event.data?.type === 'experiment:pause') stop('parent');
    if (
      event.data?.type === 'experiment:availability' &&
      typeof event.data.available === 'boolean'
    ) {
      available = event.data.available && !document.hidden;
      if (!available) stop('parent');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      available = false;
      stop('hidden');
    } else tell('experiment:availability-request');
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    available = false;
    stop('hidden');
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    tell('experiment:availability-request');
  });
  window.addEventListener('blur', () => stop('blur'));
  let lastHeight = 0;
  new ResizeObserver(() => {
    const height = Math.ceil(document.body.scrollHeight);
    if (height !== lastHeight) {
      lastHeight = height;
      tell('experiment:resize', { height });
    }
  }).observe(document.body);
  render();
  tell('experiment:ready');
}

try {
  initializeExperiment();
} catch {
  parent.postMessage(
    { type: 'experiment:error', id: document.body.dataset.experiment },
    '*',
  );
}
