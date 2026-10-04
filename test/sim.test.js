// Tests for simulate(). Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Until the refactor: pull <script id="sim"> out of index.html and run it in a VM context.
function loadSim() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const src = html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1];
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.simulate=simulate; this.shares=shares; this.COMP=COMP;', ctx);
  return ctx;
}
const { simulate, shares, COMP } = loadSim();

const BASE = { dripper: 'v60', filter: 'v60', pours: 3, grind: 'medium', temp: 90, bloom: 2, ratio: 15, process: 'natural' };
const run = (over = {}) => simulate({ ...BASE, ...over });
const idx = id => COMP.findIndex(c => c.id === id);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: got ${a}, expected ${b} ±${eps}`);

// ---------- reference configs (CLAUDE.md) ----------
test('default → EY ~19%, total time ~2:30', () => {
  const R = run();
  close(R.EY, 19, 0.5, 'EY');
  close(R.totalTime, 150, 10, 'totalTime (s)');
  assert.deepEqual([...R.steps.map(s => s.kind)], ['bloom', 'pour', 'pour', 'drawdown']);
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
  // Non-valve dripper drains during bloom when bloom water exceeds what the bed absorbs.
  assert.ok(run({ bloom: 4 }).steps[0].dDrained > 0);
});

test('ratio 1:5 → low EY, high TDS', () => {
  const d = run(), R = run({ ratio: 5 });
  assert.ok(R.EY < d.EY - 5, `EY ${R.EY}`);
  assert.ok(R.TDS > 2 * d.TDS, `TDS ${R.TDS}`);
});

test('pours = 1 → single step + drawdown', () => {
  const R = run({ pours: 1 });
  assert.deepEqual([...R.steps.map(s => s.kind)], ['single', 'drawdown']);
  assert.deepEqual([...R.pours], [225]);
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
  assert.deepEqual([...shares([0, 0, 0, 0, 0])], [0, 0, 0, 0, 0]);
});

// ---------- golden numbers (locks current behaviour for the refactor) ----------
// [config override, EY, TDS, totalTime, bev, steps, frames]
const GOLDEN = [
  [{}, 19.110899624089683, 1.4700692018530523, 153, 195.00000000000003, 4, 310],
  [{ grind: 'fine', temp: 94 }, 22.726833840490507, 1.7482179877300372, 243.5, 195.0000000000002, 4, 491],
  [{ grind: 'coarse', temp: 86 }, 14.18780405564102, 1.091369542741617, 124, 195, 4, 252],
  [{ dripper: 'switch' }, 19.439536575797014, 1.4953489673690021, 161, 194.99999999999986, 4, 326],
  [{ ratio: 5 }, 9.664523888495937, 3.2215079628319794, 77.5, 44.99999999999999, 4, 159],
  [{ pours: 1 }, 15.55918105221699, 1.196860080939768, 108.5, 195.00000000000009, 2, 219],
  [{ dripper: 'switch', bloom: 4 }, 19.7514755300966, 1.5193442715458927, 163, 194.99999999999994, 4, 330],
  [{ dripper: 'ufo_sw' }, 19.3552570272127, 1.4888659251702079, 155, 195.00000000000003, 4, 314],
  [{ dripper: 'ufo' }, 19.01428120087456, 1.4626370154518888, 147, 195.00000000000009, 4, 298],
  [{ dripper: 'ct62_sw' }, 19.502171949957578, 1.50016707307366, 166, 194.99999999999997, 4, 336],
  [{ dripper: 'ct62' }, 19.205943566884354, 1.477380274375721, 159.5, 194.9999999999998, 4, 323],
  [{ dripper: 'origami' }, 18.965785183140067, 1.458906552549237, 144, 194.99999999999986, 4, 292],
  [{ filter: 'kalita' }, 19.389242137050648, 1.4914801643885118, 172, 194.99999999999994, 4, 348],
  [{ process: 'washed', temp: 94 }, 18.48090279598649, 1.421607907383576, 153, 195.00000000000003, 4, 310],
  [{ process: 'anaerobic', temp: 86 }, 19.524085984466527, 1.5018527680358864, 153, 195.00000000000003, 4, 310],
  [{ ratio: 20, pours: 6, bloom: 1.5 }, 21.024610650841986, 1.168033925046777, 216, 269.99999999999994, 7, 439],
  [{ pours: 10, bloom: 1 }, 18.988363256201755, 1.4606828972260688, 194, 194.99471745984584, 11, 399],
  [{ ratio: 10, pours: 2, bloom: 3 }, 15.134623314439997, 1.8918279143049999, 105, 119.99999999999999, 3, 213],
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
