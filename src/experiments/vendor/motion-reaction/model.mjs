export const RULES = Object.freeze({
  width: 12, startX: 4, radius: .35, maxSpeed: 3.2,
  acceleration: 9, braking: 7, maxStep: 1 / 120, maxAdvance: 5,
  maxAngle: .30, maxCargo: .55,
});
export const TRACE = Object.freeze([
  Object.freeze({ input: 1, frames: 96, label: '右へ · 0.80秒' }),
  Object.freeze({ input: -1, frames: 66, label: '左へ · 0.55秒' }),
  Object.freeze({ input: 0, frames: 168, label: '離して停止 · 1.40秒' }),
]);
export const TRACE_FRAMES = TRACE.reduce((sum, part) => sum + part.frames, 0);
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const approach = (value, target, amount) => value + clamp(target - value, amount);
const modes = new Set(['generated', 'rigid']);

function validTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > RULES.maxAdvance) {
    throw new RangeError('Time must be finite and between 0 and 5 seconds');
  }
}
export function traceInput(frame) {
  let left = frame;
  for (const part of TRACE) {
    if (left < part.frames) return part;
    left -= part.frames;
  }
  return { input: 0, label: '再生完了' };
}

export class Experiment {
  constructor(mode = 'generated') { this.reset(mode); }
  reset(mode = this.mode) {
    if (!modes.has(mode)) throw new RangeError('Unknown presentation mode');
    this.mode = mode;
    this.x = RULES.startX;
    this.velocity = 0;
    this.acceleration = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.input = 0;
    // These reactions never feed back into position, velocity, or collision.
    this.angle = 0;
    this.angleVelocity = 0;
    this.cargo = 0;
    this.cargoVelocity = 0;
    this.peakAngle = 0;
    this.peakCargo = 0;
    this.replay = { status: 'idle', frames: 0, accumulator: 0 };
    this.traceResult = null;
  }
  step(seconds, input = 0) {
    validTime(seconds);
    if (!Number.isFinite(input)) throw new RangeError('Input must be finite');
    this.input = clamp(input, 1);
    let left = seconds;
    while (left > 1e-10) {
      const dt = Math.min(RULES.maxStep, left);
      const oldVelocity = this.velocity;
      const target = this.input * RULES.maxSpeed;
      this.velocity = approach(this.velocity, target, (this.input ? RULES.acceleration : RULES.braking) * dt);
      const before = this.x;
      this.x = Math.max(RULES.radius, Math.min(RULES.width - RULES.radius, this.x + this.velocity * dt));
      if ((this.x === RULES.radius && this.velocity < 0) ||
          (this.x === RULES.width - RULES.radius && this.velocity > 0)) this.velocity = 0;
      this.acceleration = (this.velocity - oldVelocity) / dt;
      this.distance += Math.abs(this.x - before);
      this.elapsed += dt;
      // Velocity + acceleration gives a small anticipatory torso lean.
      // The bounded spring is an original 2D simplification, not Wolfire code.
      const targetAngle = clamp(this.velocity * .018 + this.acceleration * .025, RULES.maxAngle);
      this.angleVelocity += (100 * (targetAngle - this.angle) - 17 * this.angleVelocity) * dt;
      this.angle += this.angleVelocity * dt;
      if (Math.abs(this.angle) > RULES.maxAngle) {
        this.angle = clamp(this.angle, RULES.maxAngle);
        this.angleVelocity = 0;
      }
      // Inertial cargo lags opposite acceleration and settles with damping.
      this.cargoVelocity += (-52 * this.cargo - 9 * this.cargoVelocity - 1.8 * this.acceleration) * dt;
      this.cargo += this.cargoVelocity * dt;
      if (Math.abs(this.cargo) > RULES.maxCargo) {
        this.cargo = clamp(this.cargo, RULES.maxCargo);
        this.cargoVelocity = 0;
      }
      this.peakAngle = Math.max(this.peakAngle, Math.abs(this.angle));
      this.peakCargo = Math.max(this.peakCargo, Math.abs(this.cargo));
      left -= dt;
    }
  }
  presentation() {
    return { angle: this.mode === 'generated' ? this.angle : 0, cargo: this.mode === 'generated' ? this.cargo : 0 };
  }
  beginReplay() {
    this.reset();
    this.replay.status = 'running';
  }
  cancelReplay() {
    if (this.replay.status === 'running') this.replay.status = 'cancelled';
    this.replay.accumulator = 0;
  }
  advanceReplay(seconds) {
    validTime(seconds);
    if (this.replay.status !== 'running') return;
    this.replay.accumulator += seconds;
    // Fixed 120 Hz input trace makes its result independent of display frames.
    while (this.replay.accumulator + 1e-10 >= RULES.maxStep && this.replay.frames < TRACE_FRAMES) {
      this.step(RULES.maxStep, traceInput(this.replay.frames).input);
      this.replay.frames += 1;
      this.replay.accumulator = Math.max(0, this.replay.accumulator - RULES.maxStep);
    }
    if (this.replay.frames === TRACE_FRAMES) {
      this.replay.status = 'completed';
      this.replay.accumulator = 0;
      this.traceResult = {
        mode: this.mode, frames: TRACE_FRAMES, seconds: TRACE_FRAMES * RULES.maxStep,
        x: this.x, velocity: this.velocity, distance: this.distance,
        peakDisplayedAngle: this.mode === 'generated' ? this.peakAngle : 0,
        peakDisplayedCargo: this.mode === 'generated' ? this.peakCargo : 0,
      };
    }
  }
  snapshot() {
    return {
      mode: this.mode, player: { x: this.x, velocity: this.velocity, acceleration: this.acceleration },
      input: this.input, distance: this.distance, elapsed: this.elapsed,
      reaction: { angle: this.angle, angleVelocity: this.angleVelocity, cargo: this.cargo, cargoVelocity: this.cargoVelocity },
      displayed: this.presentation(),
      replay: { ...this.replay, label: traceInput(this.replay.frames).label },
      traceResult: this.traceResult ? { ...this.traceResult } : null,
    };
  }
}
