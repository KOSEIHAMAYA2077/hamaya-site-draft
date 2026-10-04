export const RULES = Object.freeze({
  width: 14, height: 8, speed: 2.4, radius: .22,
  maxStep: 1 / 120, maxAdvance: 5,
  start: Object.freeze({ x: 1.5, y: 4 }),
  wall: Object.freeze({ x: 4.4, y: 2.4, width: .65, height: 3.2 }),
  goal: Object.freeze({ x: 12.5, y: 1, radius: .4 }),
});
export const TRACE = Object.freeze([
  Object.freeze({ input: Object.freeze({ x: 1, y: 0 }), frames: 180, label: '右へ・壁で止まる · 1.50秒' }),
  Object.freeze({ input: Object.freeze({ x: 0, y: 0 }), frames: 120, label: '離して観察 · 1.00秒' }),
  Object.freeze({ input: Object.freeze({ x: 0, y: -1 }), frames: 150, label: '上へ・壁を回る · 1.25秒' }),
  Object.freeze({ input: Object.freeze({ x: 1, y: 0 }), frames: 240, label: '右へ · 2.00秒' }),
]);
export const TRACE_FRAMES = TRACE.reduce((sum, part) => sum + part.frames, 0);
export const LONG_TRACE = Object.freeze([
  TRACE[0],
  Object.freeze({ input: TRACE[1].input, frames: 360, label: '離して観察 · 3.00秒' }),
  TRACE[2], TRACE[3],
]);
export const PRESETS = Object.freeze({
  short: Object.freeze({ trace: TRACE, frames: TRACE_FRAMES, pauseSeconds: 1, label: '停止1秒' }),
  long: Object.freeze({ trace: LONG_TRACE, frames: LONG_TRACE.reduce((sum, part) => sum + part.frames, 0), pauseSeconds: 3, label: '停止3秒' }),
});
const modes = new Set(['movement', 'realtime']);
const presets = new Set(['short', 'long']);
function presetInfo(preset) {
  if (!presets.has(preset)) throw new RangeError('Unknown replay preset');
  return PRESETS[preset];
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function validTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > RULES.maxAdvance) throw new RangeError('Time must be finite and between 0 and 5 seconds');
}
export function triangle(seconds, period) {
  const fraction = ((seconds % period) + period) % period / period;
  return fraction <= .5 ? fraction * 2 : (1 - fraction) * 2;
}
export function hazardsAt(worldTime) {
  if (!Number.isFinite(worldTime) || worldTime < 0) throw new RangeError('Invalid world time');
  return [
    { id: 'vertical', x: 7, y: 1 + 6 * triangle(worldTime + .5, 3.6), radius: .35 },
    { id: 'horizontal', x: 9 + 3.5 * triangle(worldTime + 1.3, 4.8), y: 3.8, radius: .38 },
  ];
}
export function traceInput(frame, preset = 'short') {
  let left = frame;
  for (const part of presetInfo(preset).trace) { if (left < part.frames) return part; left -= part.frames; }
  return { input: { x: 0, y: 0 }, label: '再生完了' };
}

export class Experiment {
  constructor(mode = 'movement', preset = 'short') { this.reset(mode, preset); }
  reset(mode = this.mode, preset = this.preset) {
    if (!modes.has(mode)) throw new RangeError('Unknown clock mode');
    const info = presetInfo(preset);
    this.mode = mode;
    this.preset = preset;
    this.player = { ...RULES.start };
    this.physicalTime = 0;
    this.worldTime = 0;
    this.distance = 0;
    this.lastTravel = 0;
    this.worldRate = 0;
    this.input = { x: 0, y: 0 };
    this.contactCount = 0;
    this.activeContacts = new Set();
    this.contactEvents = [];
    this.visitedGoal = false;
    this.replay = { status: 'idle', frames: 0, totalFrames: info.frames, preset, accumulator: 0 };
    this.traceResult = null;
  }
  moveX(delta) {
    const before = this.player.x, w = RULES.wall, r = RULES.radius;
    let next = clamp(before + delta, r, RULES.width - r);
    const dy = Math.max(w.y - this.player.y, 0, this.player.y - (w.y + w.height));
    if (dy < r) {
      const spread = Math.sqrt(Math.max(0, r * r - dy * dy));
      const left = w.x - spread, right = w.x + w.width + spread;
      if (before <= left && next > left) next = left;
      if (before >= right && next < right) next = right;
    }
    this.player.x = next;
  }
  moveY(delta) {
    const before = this.player.y, w = RULES.wall, r = RULES.radius;
    let next = clamp(before + delta, r, RULES.height - r);
    const dx = Math.max(w.x - this.player.x, 0, this.player.x - (w.x + w.width));
    if (dx < r) {
      const spread = Math.sqrt(Math.max(0, r * r - dx * dx));
      const top = w.y - spread, bottom = w.y + w.height + spread;
      if (before <= top && next > top) next = top;
      if (before >= bottom && next < bottom) next = bottom;
    }
    this.player.y = next;
  }
  observeContacts() {
    const next = new Set();
    for (const hazard of hazardsAt(this.worldTime)) {
      if (Math.hypot(this.player.x - hazard.x, this.player.y - hazard.y) <= RULES.radius + hazard.radius) {
        next.add(hazard.id);
        if (!this.activeContacts.has(hazard.id)) {
          this.contactCount += 1;
          this.contactEvents.push({ id: hazard.id, worldTime: this.worldTime, physicalTime: this.physicalTime, player: { ...this.player } });
          if (this.contactEvents.length > 20) this.contactEvents.shift();
        }
      }
    }
    this.activeContacts = next;
  }
  step(seconds, input = { x: 0, y: 0 }) {
    validTime(seconds);
    if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new RangeError('Input must have finite x and y');
    // Clamp before normalizing, avoiding overflow for finite but enormous inputs.
    const ix = clamp(input.x, -1, 1), iy = clamp(input.y, -1, 1), length = Math.hypot(ix, iy);
    const dx = length ? ix / length : 0, dy = length ? iy / length : 0;
    this.input = { x: dx, y: dy };
    this.lastTravel = 0;
    this.worldRate = 0;
    if (seconds === 0) return;
    if (this.mode === 'movement' && !length) {
      // Physical observation time advances; every part of the world stays exact.
      this.physicalTime += seconds;
      return;
    }
    const worldBefore = this.worldTime;
    let left = seconds;
    while (left > 1e-10) {
      const dt = Math.min(RULES.maxStep, left), before = { ...this.player };
      this.moveX(dx * RULES.speed * dt);
      this.moveY(dy * RULES.speed * dt);
      // Measure the resulting segment once, after both axes and collision.
      // Net displacement across the whole action would lose out-and-back motion.
      const travel = Math.hypot(this.player.x - before.x, this.player.y - before.y);
      this.distance += travel;
      this.lastTravel += travel;
      this.physicalTime += dt;
      const worldDelta = this.mode === 'movement' ? travel / RULES.speed : dt;
      this.worldTime += worldDelta;
      if (travel > 0 || worldDelta > 0) this.observeContacts();
      if (Math.hypot(this.player.x - RULES.goal.x, this.player.y - RULES.goal.y) <= RULES.goal.radius + RULES.radius) this.visitedGoal = true;
      left -= dt;
    }
    this.worldRate = (this.worldTime - worldBefore) / seconds;
  }
  // Keep the original no-argument API as the short trace, even after a long run.
  beginReplay(preset = 'short') {
    presetInfo(preset); // Validate before reset so invalid requests cannot mutate state.
    this.reset(this.mode, preset); this.replay.status = 'running';
  }
  cancelReplay() {
    if (this.replay.status === 'running') this.replay.status = 'cancelled';
    this.replay.accumulator = 0;
  }
  advanceReplay(seconds) {
    validTime(seconds);
    if (this.replay.status !== 'running') return;
    this.replay.accumulator += seconds;
    while (this.replay.accumulator + 1e-10 >= RULES.maxStep && this.replay.frames < this.replay.totalFrames) {
      this.step(RULES.maxStep, traceInput(this.replay.frames, this.replay.preset).input);
      this.replay.frames += 1;
      this.replay.accumulator = Math.max(0, this.replay.accumulator - RULES.maxStep);
    }
    if (this.replay.frames === this.replay.totalFrames) {
      this.replay.status = 'completed'; this.replay.accumulator = 0;
      this.traceResult = { mode: this.mode, preset: this.preset, frames: this.replay.totalFrames, totalFrames: this.replay.totalFrames,
        seconds: this.replay.totalFrames * RULES.maxStep, pauseSeconds: presetInfo(this.preset).pauseSeconds,
        player: { ...this.player }, distance: this.distance, worldTime: this.worldTime,
        contactCount: this.contactCount, hazards: hazardsAt(this.worldTime) };
    }
  }
  snapshot() {
    return {
      mode: this.mode, preset: this.preset, player: { ...this.player }, input: { ...this.input },
      physicalTime: this.physicalTime, worldTime: this.worldTime, distance: this.distance,
      lastTravel: this.lastTravel, worldRate: this.worldRate, hazards: hazardsAt(this.worldTime),
      contactCount: this.contactCount, activeContacts: [...this.activeContacts].sort(),
      contactEvents: this.contactEvents.map(event => ({ ...event, player: { ...event.player } })),
      visitedGoal: this.visitedGoal, replay: { ...this.replay, label: traceInput(this.replay.frames, this.replay.preset).label },
      traceResult: this.traceResult ? { ...this.traceResult, player: { ...this.traceResult.player }, hazards: this.traceResult.hazards.map(hazard => ({ ...hazard })) } : null,
    };
  }
}
