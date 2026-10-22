import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCombo, defaultModification, responseData, assertQuote, planLive } from '../src/live.js';

const detail = { code: 'combo', rounds: [
  { id: 1, minQuantity: 1, maxQuantity: 1, choices: [
    { code: 'burger', name: '主食', quantity: 1, isDefault: 1 },
    { code: 'other', name: '其他', quantity: 0, isDefault: 0 }
  ] }
] };

test('combo defaults retain round, child codes and selected quantities', () => {
  const combo = defaultCombo(detail);
  assert.deepEqual(combo.item.roundList, [{ round: '1', comboItemList: [{ code: 'burger', quantity: 1 }] }]);
  assert.deepEqual(combo.names, ['主食']);
  const missing = structuredClone(detail); missing.rounds[0].choices[0].isDefault = 0;
  assert.throws(() => defaultCombo(missing), /不完整/);
  assert.throws(() => defaultCombo({}), /rounds/);
});

test('modifiers include selected keys and explicit unselected keys', () => {
  const actual = defaultModification({ items: [{ values: [
    { code: 'a', selectedKey: 'yes', unselectedKey: 'no', selectedQuantity: 1 },
    { code: 'b', selectedKey: 'yes', unselectedKey: 'no', selectedQuantity: 0 },
    { code: 'c', selectedKey: 'yes', selectedQuantity: 0 }
  ] }] });
  assert.deepEqual(actual.values, [{ code: 'a', key: 'yes', quantity: 1 }, { code: 'b', key: 'no', quantity: 1 }]);
});

test('business failures, unstructured results, invalid quotes and changed quantities are rejected', () => {
  for (const body of [{ success: false, data: {} }, { code: 500, data: {} }, {}]) {
    assert.throws(() => responseData({ tool: 'test', result: { structuredContent: body } }), /结构化/);
  }
  assert.throws(() => assertQuote({ price: '5', productList: [{}] }), /整数/);
  assert.throws(() => assertQuote({ price: 5, productList: [{ productCode: 'x', quantity: 1 }] }, [{ productCode: 'x', quantity: 2 }]), /份数/);
});

test('live pipeline quotes complete individual combos and final quantities using the same parameters', async () => {
  const calls = [];
  const schemas = ['query-meals', 'query-meal-detail', 'calculate-price'].map(name => ({ name, inputSchema: { type: 'object' } }));
  const client = {
    listTools: async () => ({ tools: schemas }),
    callTool: async ({ name, arguments: args }) => {
      calls.push({ name, args });
      let data;
      if (name === 'query-meals') data = { meals: { combo: { name: '套餐', canWithOrder: false } }, categories: [] };
      if (name === 'query-meal-detail') data = { ...detail, name: '套餐' };
      if (name === 'calculate-price') data = { price: args.items[0].quantity * 2000,
        productList: args.items.map(i => ({ productCode: i.productCode, quantity: i.quantity })) };
      return { structuredContent: { code: 200, success: true, data }, content: [] };
    }
  };
  const result = await planLive(client, { storeCode: 'public-test', candidateCodes: ['combo'], budgetFen: 5000,
    members: [{ name: 'A', preferTags: ['主食'] }, { name: 'B', preferTags: ['主食'] }] });
  assert.equal(result.verified, true);
  assert.equal(result.officialQuote.price, 4000);
  assert.equal(result.officialRemainingFen, 1000);
  assert.equal(calls.at(-1).args.items[0].quantity, 2);
  assert.deepEqual(calls.at(-1).args.items[0].roundList, defaultCombo(detail).item.roundList);
  assert.ok(calls.every(c => c.args.orderType === 1 && c.args.beType === 1 && !c.args.withOrder));
});
