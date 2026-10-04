import test from 'node:test';
import assert from 'node:assert/strict';
import { Experiment, RULES, TRACE_FRAMES } from './model.mjs';
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const movement = model => ({ player: model.snapshot().player, distance: model.distance, elapsed: model.elapsed });
function replay(mode, deltas = [1 / 60]) {
  const model = new Experiment(mode); model.beginReplay();
  for (let i = 0; i < 1000 && model.replay.status === 'running'; i++) model.advanceReplay(deltas[i % deltas.length]);
  assert.equal(model.replay.status, 'completed');
  return model;
}

test('Acceleration leads right; cargo lags, reversal decelerates before moving left', () => {
  const model = new Experiment();
  model.step(.16, 1);
  assert.ok(model.velocity > 0 && model.angle > 0 && model.cargo < 0);
  model.step(.5, 1);
  near(model.velocity, RULES.maxSpeed);
  model.step(.1, -1);
  assert.ok(model.velocity > 0 && model.acceleration < 0, 'opposite input is initially braking');
  model.step(.45, -1);
  assert.ok(model.velocity < 0, 'sustained opposite input reverses movement');
});

test('Released input stops motion; both reactions decay during rest', () => {
  const model = new Experiment(); model.step(.65, 1); model.step(.5, 0);
  near(model.velocity, 0);
  const x = model.x, initial = Math.abs(model.angle) + Math.abs(model.cargo);
  assert.ok(initial > .001);
  model.step(2, 0);
  near(model.x, x); near(model.velocity, 0);
  assert.ok(Math.abs(model.angle) + Math.abs(model.cargo) < initial * .01);
});

test('Generated and rigid replay share exact movement; 30 Hz and uneven display frames share exact trace', () => {
  const generated = replay('generated', [1 / 30]);
  const rigid = replay('rigid', [.011, .027, .042]);
  assert.deepEqual(movement(generated), movement(rigid));
  assert.equal(generated.replay.frames, TRACE_FRAMES);
  near(generated.elapsed, 2.75);
  near(generated.velocity, 0);
  assert.ok(generated.traceResult.peakDisplayedAngle > .1);
  assert.ok(generated.traceResult.peakDisplayedCargo > .1);
  assert.equal(rigid.traceResult.peakDisplayedAngle, 0);
  assert.equal(rigid.traceResult.peakDisplayedCargo, 0);
  assert.deepEqual(generated.snapshot().reaction, rigid.snapshot().reaction);
});

test('Presentation queries return copies and never change physical or reaction state', () => {
  for (const mode of ['generated', 'rigid']) {
    const model = new Experiment(mode); model.step(.12, 1);
    const before = model.snapshot();
    for (let i = 0; i < 200; i++) { const output = model.presentation(); output.angle = 999; output.cargo = 999; }
    assert.deepEqual(model.snapshot(), before);
    if (mode === 'rigid') assert.deepEqual(model.presentation(), { angle: 0, cargo: 0 });
  }
});

test('Boundary impact and long alternations stay finite, bounded, and inside the floor', () => {
  for (const mode of ['generated', 'rigid']) {
    const model = new Experiment(mode);
    for (let i = 0; i < 14; i++) {
      model.step(2, i % 2 ? -1 : 1);
      const { player, reaction } = model.snapshot();
      for (const number of [...Object.values(player), ...Object.values(reaction), model.distance]) assert.ok(Number.isFinite(number));
      assert.ok(model.x >= RULES.radius && model.x <= RULES.width - RULES.radius);
      assert.ok(Math.abs(model.velocity) <= RULES.maxSpeed);
      assert.ok(Math.abs(model.angle) <= RULES.maxAngle && Math.abs(model.cargo) <= RULES.maxCargo);
    }
    model.step(5, -1); near(model.x, RULES.radius); near(model.velocity, 0);
  }
});

test('Reset clears movement, springs, replay accumulation and result; trace can restart', () => {
  const model = new Experiment(); model.beginReplay(); model.advanceReplay(.417); model.reset('rigid');
  assert.deepEqual(model.snapshot(), new Experiment('rigid').snapshot());
  model.beginReplay(); model.advanceReplay(.009); assert.equal(model.replay.frames, 1);
  model.cancelReplay(); const before = model.snapshot(); model.advanceReplay(1);
  assert.deepEqual(model.snapshot(), before);
  model.reset(); assert.equal(model.replay.status, 'idle'); assert.equal(model.traceResult, null);
});

test('Invalid time/input fails before mutation; zero-time query is safe', () => {
  const model = new Experiment(), before = model.snapshot();
  for (const seconds of [-1, NaN, Infinity, 5.01]) assert.throws(() => model.step(seconds, 1), RangeError);
  assert.throws(() => model.step(.1, NaN), RangeError);
  assert.deepEqual(model.snapshot(), before);
  model.step(0, 0); assert.deepEqual(model.snapshot(), before);
});
