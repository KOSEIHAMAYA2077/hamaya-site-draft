import test from 'node:test';
import assert from 'node:assert/strict';
import { Experiment, RULES, TRACE, TRACE_FRAMES, PRESETS, traceInput, hazardsAt } from './model.mjs';
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const world = model => {
  const s = model.snapshot();
  return { player: s.player, worldTime: s.worldTime, distance: s.distance, hazards: s.hazards,
    contactCount: s.contactCount, activeContacts: s.activeContacts, contactEvents: s.contactEvents, visitedGoal: s.visitedGoal };
};
function replay(mode, deltas, preset = 'short') {
  const model = new Experiment(mode); model.beginReplay(preset);
  for (let i = 0; i < 2000 && model.replay.status === 'running'; i++) model.advanceReplay(deltas[i % deltas.length]);
  assert.equal(model.replay.status, 'completed');
  return model;
}

test('Stationary movement clock freezes the world exactly; realtime hazards advance without input', () => {
  const movement = new Experiment(), before = world(movement);
  for (let i = 0; i < 100; i++) movement.step(.01);
  assert.deepEqual(world(movement), before); near(movement.physicalTime, 1);
  const realtime = new Experiment('realtime'), hazards = realtime.snapshot().hazards;
  realtime.step(1); near(realtime.worldTime, 1);
  assert.notDeepEqual(realtime.snapshot().hazards, hazards);
  assert.deepEqual(realtime.player, RULES.start); near(realtime.distance, 0);
});

test('Wall collision is resolved before measuring; continued wall push advances no movement clock', () => {
  const movement = new Experiment(); movement.step(2, { x: 1, y: 0 });
  near(movement.player.x, RULES.wall.x - RULES.radius);
  near(movement.distance, RULES.wall.x - RULES.radius - RULES.start.x);
  near(movement.worldTime, movement.distance / RULES.speed);
  movement.step(.1, { x: 1, y: 0 }); const before = world(movement);
  movement.step(1, { x: 1, y: 0 });
  assert.deepEqual(world(movement), before); near(movement.lastTravel, 0); near(movement.worldRate, 0);
  // A diagonal wall push pays only for its surviving wall-parallel component.
  movement.step(.2, { x: 1, y: -1 });
  near(movement.lastTravel, RULES.speed * .2 / Math.sqrt(2));
  // Manual corner motion uses a bounded maximum step, not a fixed trace.
  // Smaller tails can change the rounded corner by a fraction of one canvas pixel.
  const coarse = new Experiment(), fine = new Experiment();
  coarse.player = { x: 4.18, y: 2.4 }; fine.player = { ...coarse.player };
  coarse.step(.5, { x: 1, y: -1 });
  for (let i = 0; i < 500; i++) fine.step(.001, { x: 1, y: -1 });
  assert.ok(Math.hypot(coarse.player.x - fine.player.x, coarse.player.y - fine.player.y) < .02);
  assert.ok(Math.abs(coarse.worldTime - fine.worldTime) < .01);
});

test('Free-space cardinal and diagonal speed match; out-and-back distance is preserved', () => {
  const cardinal = new Experiment(), diagonal = new Experiment();
  cardinal.step(1, { x: 0, y: 1 }); diagonal.step(1, { x: 1, y: -1 });
  near(cardinal.distance, RULES.speed); near(diagonal.distance, RULES.speed);
  near(cardinal.worldTime, 1); near(diagonal.worldTime, 1);
  const roundTrip = new Experiment(); roundTrip.step(.5, { x: 1, y: 0 }); roundTrip.step(.5, { x: -1, y: 0 });
  near(roundTrip.player.x, RULES.start.x); near(roundTrip.distance, RULES.speed); near(roundTrip.worldTime, 1);
});

test('Hazards depend only on worldTime and returned copies do not mutate the model', () => {
  const model = new Experiment(); model.step(.6, { x: 0, y: -1 });
  assert.deepEqual(model.snapshot().hazards, hazardsAt(model.worldTime));
  const before = model.snapshot(), copy = model.snapshot();
  copy.player.x = 999; copy.hazards[0].y = 999; copy.input.x = 999;
  assert.deepEqual(model.snapshot(), before);
  assert.throws(() => hazardsAt(NaN), RangeError);
});

test('One sustained contact is one entry, frozen contact stays one, exit/reentry adds one', () => {
  const model = new Experiment();
  // Fixture places the circle inside one hazard to isolate contact lifetime.
  const hazard = hazardsAt(0)[0]; model.player = { x: hazard.x, y: hazard.y };
  model.step(RULES.maxStep, { x: 1, y: 0 });
  assert.equal(model.contactCount, 1); assert.deepEqual([...model.activeContacts], ['vertical']);
  const frozen = world(model);
  for (let i = 0; i < 100; i++) model.step(.01);
  assert.deepEqual(world(model), frozen);
  model.step(.5, { x: -1, y: 0 }); assert.equal(model.activeContacts.size, 0);
  const current = hazardsAt(model.worldTime)[0]; model.player = { x: current.x, y: current.y };
  model.step(RULES.maxStep, { x: 1, y: 0 }); assert.equal(model.contactCount, 2);
  assert.equal(model.contactEvents.length, 2);
});

test('Realtime hazard enters a stationary circle; sustained-contact count does not depend on outer dt', () => {
  const realtime = new Experiment('realtime'); realtime.player = { x: 7, y: 4.7 };
  realtime.step(.65); assert.equal(realtime.contactCount, 1); assert.ok(realtime.activeContacts.has('vertical'));
  realtime.step(.15); assert.equal(realtime.contactCount, 1);
  const coarse = new Experiment(), fine = new Experiment(), initial = hazardsAt(0)[0];
  coarse.player = { x: initial.x, y: initial.y }; fine.player = { ...coarse.player };
  coarse.step(.08, { x: 1, y: 0 });
  for (let i = 0; i < 8; i++) fine.step(.01, { x: 1, y: 0 });
  assert.equal(coarse.contactCount, 1); assert.equal(fine.contactCount, 1);
});

test('Common fixed trace has identical player/distance but different clocks; display frame partitions do not change it', () => {
  const movement = replay('movement', [1 / 30]);
  const uneven = replay('movement', [.011, .027, .043]);
  const realtime = replay('realtime', [1 / 60]);
  assert.deepEqual(movement.traceResult, uneven.traceResult);
  assert.deepEqual(movement.player, realtime.player); assert.equal(movement.distance, realtime.distance);
  assert.equal(movement.replay.frames, TRACE_FRAMES); near(movement.physicalTime, 5.75);
  near(movement.player.x, 8.98); near(movement.player.y, 1); near(movement.distance, 10.48);
  near(movement.worldTime, movement.distance / RULES.speed); near(realtime.worldTime, 5.75);
  assert.ok(movement.worldTime < realtime.worldTime);
  assert.notDeepEqual(movement.snapshot().hazards, realtime.snapshot().hazards);
});

test('Three-second pause preserves the route, changes only clock phase, and exposes one realtime contact', () => {
  const shortMovement = replay('movement', [1 / 60]);
  const shortRealtime = replay('realtime', [1 / 60]);
  const longMovement = replay('movement', [1 / 30], 'long');
  const longRealtime = replay('realtime', [.013, .041, .023], 'long');
  assert.deepEqual(longMovement.player, longRealtime.player);
  assert.deepEqual(longMovement.player, shortMovement.player);
  assert.equal(longMovement.distance, longRealtime.distance);
  assert.equal(longMovement.distance, shortMovement.distance);
  assert.equal(longMovement.worldTime, shortMovement.worldTime);
  near(longRealtime.worldTime - shortRealtime.worldTime, 2);
  near(longMovement.physicalTime, 7.75); near(longRealtime.physicalTime, 7.75);
  assert.equal(longMovement.traceResult.preset, 'long'); assert.equal(longRealtime.traceResult.preset, 'long');
  assert.equal(longMovement.traceResult.frames, 930); assert.equal(longMovement.replay.totalFrames, 930);
  assert.equal(longMovement.traceResult.contactCount, 0); assert.equal(longRealtime.traceResult.contactCount, 1);
  assert.equal(shortMovement.traceResult.contactCount, 0); assert.equal(shortRealtime.traceResult.contactCount, 0);
  assert.deepEqual(longRealtime.traceResult, replay('realtime', [1 / 60], 'long').traceResult);
});

test('Replay preset validation preserves state; reset keeps valid selection and default APIs stay short', () => {
  assert.equal(TRACE_FRAMES, 690); assert.equal(TRACE[1].frames, 120);
  assert.equal(PRESETS.long.frames, 930); assert.equal(PRESETS.short.trace, TRACE);
  const model = replay('realtime', [1 / 60], 'long'), before = model.snapshot();
  for (const invalid of ['unknown', '', null, 3, 'toString']) {
    assert.throws(() => model.beginReplay(invalid), RangeError);
    assert.deepEqual(model.snapshot(), before);
    assert.throws(() => model.reset('movement', invalid), RangeError);
    assert.deepEqual(model.snapshot(), before);
    assert.throws(() => traceInput(0, invalid), RangeError);
  }
  model.reset(); assert.deepEqual(model.snapshot(), new Experiment('realtime', 'long').snapshot());
  assert.equal(model.traceResult, null); assert.equal(model.contactEvents.length, 0);
  assert.equal(model.snapshot().replay.preset, 'long'); assert.equal(model.snapshot().replay.totalFrames, 930);
  model.beginReplay(); assert.equal(model.preset, 'short'); assert.equal(model.replay.totalFrames, 690);
  assert.equal(traceInput(180).label, '離して観察 · 1.00秒');
  assert.equal(traceInput(180, 'long').label, '離して観察 · 3.00秒');
});

test('Reset clears contacts/clocks/replay; invalid dt/input fails before mutation; long input stays finite and bounded', () => {
  const model = new Experiment(); model.beginReplay(); model.advanceReplay(.42); model.reset('realtime');
  assert.deepEqual(model.snapshot(), new Experiment('realtime').snapshot());
  const before = model.snapshot();
  for (const seconds of [-1, NaN, Infinity, 5.01]) assert.throws(() => model.step(seconds), RangeError);
  assert.throws(() => model.step(.1, { x: Infinity, y: 0 }), RangeError);
  assert.deepEqual(model.snapshot(), before);
  for (let i = 0; i < 12; i++) model.step(3, { x: i % 2 ? -1e308 : 1e308, y: i % 3 ? 1 : -1 });
  for (const value of [model.player.x, model.player.y, model.worldTime, model.distance, model.physicalTime]) assert.ok(Number.isFinite(value));
  assert.ok(model.player.x >= RULES.radius && model.player.x <= RULES.width - RULES.radius);
  assert.ok(model.player.y >= RULES.radius && model.player.y <= RULES.height - RULES.radius);
  model.beginReplay(); model.advanceReplay(.01); model.cancelReplay(); const cancelled = model.snapshot(); model.advanceReplay(1);
  assert.deepEqual(model.snapshot(), cancelled);
});

test('Normal route can reach G and continue; contact never kills or resets the player', () => {
  const model = new Experiment(); model.step(1.25, { x: 0, y: -1 }); model.step(5, { x: 1, y: 0 });
  assert.equal(model.visitedGoal, true); assert.ok(model.player.x > RULES.goal.x);
  const x = model.player.x; model.step(.1, { x: -1, y: 0 }); assert.ok(model.player.x < x);
  assert.equal(model.visitedGoal, true); assert.ok(model.distance > 12);
});
