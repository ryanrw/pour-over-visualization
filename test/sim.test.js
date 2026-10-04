// Tests for simulate(). Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shares, COMP } from '../src/sim.js';

const BASE = { dripper: 'v60', filter: 'v60', pours: 3, grind: 'medium', temp: 90, bloom: 2, ratio: 15, process: 'natural' };
const run = (over = {}) => simulate({ ...BASE, ...over });
const idx = id => COMP.findIndex(c => c.id === id);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: got ${a}, expected ${b} ±${eps}`);

// ---------- reference configs (CLAUDE.md) ----------
test('default → EY ~19%, total time ~2:30', () => {
  const R = run();
  close(R.EY, 19, 0.5, 'EY');
  close(R.totalTime, 150, 10, 'totalTime (s)');
  assert.deepEqual(R.steps.map(s => s.kind), ['bloom', 'pour', 'pour', 'drawdown']);
});

test('fine grind + 94 °C → EY ~22–23%, astringent/burnt shares go up', () => {
  const d = run(), R = run({ grind: 'fine', temp: 94 });
  assert.ok(R.EY >= 22 && R.EY <= 23.5, `EY ${R.EY}`);
  const s0 = shares(d.cup), s1 = shares(R.cup);
  assert.ok(s1[idx('astr')] > s0[idx('astr')], 'astringent share up');
  assert.ok(s1[idx('burnt')] > s0[idx('burnt')], 'burnt share up');
});

test('coarse grind + 86 °C → EY ~14%, sour-led', () => {
  const R = run({ grind: 'coarse', temp: 86 });
  close(R.EY, 14, 0.7, 'EY');
  const s = shares(R.cup);
  assert.equal(s.indexOf(Math.max(...s)), idx('sour'), 'sour is the largest share');
});

test('Hario Switch → valve closed through bloom (45 s), no drain during bloom', () => {
  for (const bloom of [2, 4]) {
    const R = run({ dripper: 'switch', bloom });
    const b = R.steps[0];
    assert.equal(b.kind, 'bloom');
    assert.equal(b.imm, true);
    assert.equal(b.valveOpenAt, 45);
    const during = R.frames.slice(b.f0, b.f1 + 1).filter(f => f.t <= 45);
    assert.ok(during.every(f => !f.valveOpen && f.q === 0 && f.drained === 0), `bloom ${bloom}×: nothing drains before 45 s`);
    assert.ok(b.t1 - b.t0 >= 45);
  }
});

test('V60 drips during bloom (dry grounds can\'t absorb as fast as the pour)', () => {
  for (const bloom of [1, 2, 4]) {
    const b = run({ bloom }).steps[0];
    assert.ok(b.dDrained > 0, `bloom ${bloom}×: drained ${b.dDrained}`);
  }
  const b = run().steps[0];
  close(b.dDrained, 7, 1.5, 'bloom 2× drains a few grams');
});

test('ratio 1:5 → low EY, high TDS', () => {
  const d = run(), R = run({ ratio: 5 });
  assert.ok(R.EY < d.EY - 5, `EY ${R.EY}`);
  assert.ok(R.TDS > 1.5 * d.TDS, `TDS ${R.TDS}`);
});

test('pours = 1 → single step + drawdown', () => {
  const R = run({ pours: 1 });
  assert.deepEqual(R.steps.map(s => s.kind), ['single', 'drawdown']);
  assert.deepEqual(R.pours, [225]);
});

// ---------- invariants ----------
test('mass balance: all water poured, beverage = water − absorbed', () => {
  for (const over of [{}, { ratio: 5 }, { pours: 1 }, { dripper: 'switch' }, { ratio: 20, pours: 10, bloom: 1 }]) {
    const R = run(over);
    const last = R.frames[R.frames.length - 1];
    close(last.poured, R.water, 1e-9, 'poured');
    close(R.pours.reduce((a, b) => a + b, 0), R.water, 1e-9, 'pour split');
    close(R.bev + last.abs + last.free, R.water, 1e-9, 'water balance');
    assert.ok(last.free <= 0.3, 'drained to ≤0.3 g');
    for (let c = 0; c < 5; c++) {
      assert.ok(R.cup[c] >= 0 && R.Em[c] <= 1 && R.Ef[c] <= 1);
    }
  }
});

test('steps tile the frames with no gaps', () => {
  const R = run();
  assert.equal(R.steps[0].f0, 0);
  for (let i = 1; i < R.steps.length; i++) assert.equal(R.steps[i].f0, R.steps[i - 1].f1 + 1);
  assert.equal(R.steps.at(-1).f1, R.frames.length - 1);
  close(R.steps.at(-1).t1, R.totalTime, 1e-9, 'last step ends at totalTime');
});

test('shares sum to 1', () => {
  const s = shares(run().cup);
  close(s.reduce((a, b) => a + b, 0), 1, 1e-12, 'sum');
  assert.deepEqual(shares([0, 0, 0, 0, 0]), [0, 0, 0, 0, 0]);
});

// ---------- golden numbers (locks current behaviour for the refactor) ----------
// [config override, EY, TDS, totalTime, bev, steps, frames]
const GOLDEN = [
  [{}, 18.60510088978729, 1.4311615896719436, 152, 195.00000234828852, 4, 308],
  [{ grind: 'fine', temp: 94 }, 22.576718022794406, 1.736670617137965, 241.5, 195.00000000000745, 4, 487],
  [{ grind: 'coarse', temp: 86 }, 13.465861366975048, 1.0358347322556447, 123, 195.00014260457814, 4, 250],
  [{ dripper: 'switch' }, 19.318784614663755, 1.4860603548859108, 161, 195.00000001157673, 4, 326],
  [{ ratio: 5 }, 8.428891693777487, 2.802722095140629, 73.5, 45.110921138372234, 4, 151],
  [{ pours: 1 }, 15.09717282338305, 1.1613208743021999, 107, 195.00001882495806, 2, 216],
  [{ dripper: 'switch', bloom: 4 }, 19.5926649832733, 1.5071280755636616, 162.5, 195.00000000941225, 4, 329],
  [{ dripper: 'ufo_sw' }, 19.229864647547423, 1.479220357288318, 155, 195.00000002838613, 4, 314],
  [{ dripper: 'ufo' }, 18.470322860693692, 1.4207940255520362, 145.5, 195.00000557980835, 4, 295],
  [{ dripper: 'ct62_sw' }, 19.38491928515236, 1.491147637271834, 166, 195.00000000622188, 4, 336],
  [{ dripper: 'ct62' }, 18.71987041780294, 1.4399900250664894, 158, 195.0000009577002, 4, 320],
  [{ dripper: 'origami' }, 18.400301570924825, 1.415407750460675, 142.5, 195.00000863640935, 4, 289],
  [{ filter: 'kalita' }, 18.94346789919169, 1.4571898371240062, 170, 195.0000001706669, 4, 344],
  [{ process: 'washed', temp: 94 }, 18.015282568428976, 1.3857909501138341, 152, 195.00000234828852, 4, 308],
  [{ process: 'anaerobic', temp: 86 }, 19.002594824527776, 1.4617380458222256, 152, 195.00000234828852, 4, 308],
  [{ ratio: 20, pours: 6, bloom: 1.5 }, 20.73862603556184, 1.1521458908612738, 213.5, 270.00000000076693, 7, 434],
  [{ pours: 10, bloom: 1 }, 18.66983833652535, 1.4361414103068288, 191.5, 195.00000002649364, 11, 394],
  [{ ratio: 10, pours: 2, bloom: 3 }, 14.702741686571338, 1.8378354154897427, 104.5, 120.00047634287247, 3, 212],
];

test('golden numbers unchanged', () => {
  for (const [over, EY, TDS, totalTime, bev, nSteps, nFrames] of GOLDEN) {
    const R = run(over), k = JSON.stringify(over);
    close(R.EY, EY, 1e-9, `${k} EY`);
    close(R.TDS, TDS, 1e-9, `${k} TDS`);
    close(R.totalTime, totalTime, 1e-9, `${k} totalTime`);
    close(R.bev, bev, 1e-9, `${k} bev`);
    assert.equal(R.steps.length, nSteps, `${k} steps`);
    assert.equal(R.frames.length, nFrames, `${k} frames`);
  }
});
