import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planMeals, formatPlan } from '../src/planner.js';

const example = JSON.parse(await readFile(new URL('../examples/team.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(example);

test('demo: budget, one meal per person, preference matching and basket totals agree', () => {
  const result = planMeals(copy());
  assert.equal(result.status, 'planned');
  assert.equal(result.totalFen, 10400);
  assert.equal(result.remainingFen, 1600);
  assert.equal(result.assignments.length, 4);
  assert.equal(result.fairness.totalMatchedPreferences, 5);
  assert.equal(result.basket.reduce((s, r) => s + r.unitPriceFen * r.quantity, 600), result.totalFen);
  assert.equal(result.pricingStatus, 'demo-only');
  assert.match(formatPlan(result), /演示数据/);
});

test('unknown excluded ingredients never imply absence', () => {
  const input = copy();
  input.menu.forEach(m => m.knownAbsentTags = []);
  const result = planMeals(input);
  assert.equal(result.status, 'needs-information');
  assert.deepEqual(result.blocked, ['小林', '小陈']);
});

test('unavailable products cannot enter basket even when cheaper', () => {
  const input = copy();
  input.menu.forEach(m => m.available = false);
  assert.equal(planMeals(input).status, 'needs-information');
});

test('minimum budget includes delivery and shortfall is exact', () => {
  const input = copy(); input.budgetFen = 1;
  const result = planMeals(input);
  assert.equal(result.status, 'over-budget');
  assert.equal(result.minimumFen, 8900);
  assert.equal(result.shortfallFen, 8899);
  input.budgetFen = result.minimumFen;
  assert.equal(planMeals(input).remainingFen, 0);
});

test('fairness prioritizes least satisfied person before overall score', () => {
  const input = { source: { kind: 'demo' }, budgetFen: 3,
    members: [{ name: 'A', preferTags: ['a', 'b'], avoidTags: [] }, { name: 'B', preferTags: ['c'], avoidTags: [] }],
    menu: [
      { id: '0', name: 'basic', priceFen: 0, tags: [], available: true },
      { id: '1', name: 'one', priceFen: 1, tags: ['a'], available: true },
      { id: '2', name: 'two', priceFen: 2, tags: ['a', 'b'], available: true },
      { id: '3', name: 'other', priceFen: 2, tags: ['c'], available: true }
    ] };
  const r = planMeals(input);
  assert.equal(r.fairness.minimumMatchedPreferences, 1);
  assert.deepEqual(r.assignments.map(a => a.mealId), ['1', '3']);
});

test('integer money, identities, provenance and structural bounds are validated', () => {
  for (const bad of [-1, 2.5, NaN, 1000001]) {
    const input = copy(); input.budgetFen = bad;
    assert.throws(() => planMeals(input), /预算/);
  }
  const input = copy(); input.menu[0].priceFen = 3.5;
  assert.throws(() => planMeals(input), /价格/);
  const dupe = copy(); dupe.members[1].name = dupe.members[0].name;
  assert.throws(() => planMeals(dupe), /重复/);
  const live = copy(); live.source = { kind: 'mcp' };
  assert.throws(() => planMeals(live), /门店/);
  live.source = { kind: 'mcp', storeId: 'example-id', tool: 'query-meals', retrievedAt: '2026-10-22T04:00:00Z' };
  assert.equal(planMeals(live).pricingStatus, 'estimate-needs-calculate-price');
});

test('deterministic generated small cases match independent exhaustive search', () => {
  let seed = 23;
  const rand = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let t = 0; t < 120; t++) {
    const input = { source: { kind: 'demo' }, budgetFen: rand(25), deliveryFeeFen: rand(3),
      members: Array.from({ length: 3 }, (_, i) => ({ name: `person${i}`, preferTags: ['a', 'b', 'c'].filter(() => rand(2)), avoidTags: [] })),
      menu: Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, name: `meal${i}`, priceFen: rand(10), tags: ['a', 'b', 'c'].filter(() => rand(2)), available: true })) };
    const possibilities = [];
    for (const a of input.menu) for (const b of input.menu) for (const c of input.menu) {
      const choices = [a, b, c];
      const cost = choices.reduce((s, x) => s + x.priceFen, input.deliveryFeeFen);
      if (cost > input.budgetFen) continue;
      const scores = choices.map((x, i) => input.members[i].preferTags.filter(v => x.tags.includes(v)).length);
      possibilities.push({ cost, min: Math.min(...scores), score: scores.reduce((s, x) => s + x, 0) });
    }
    possibilities.sort((a, b) => b.min - a.min || b.score - a.score || a.cost - b.cost);
    const result = planMeals(input);
    if (!possibilities.length) assert.equal(result.status, 'over-budget');
    else {
      assert.equal(result.totalFen, possibilities[0].cost);
      assert.equal(result.fairness.minimumMatchedPreferences, possibilities[0].min);
      assert.equal(result.fairness.totalMatchedPreferences, possibilities[0].score);
    }
  }
});
