import { callReadTool } from './mcp.js';
import { planMeals, validateInput } from './planner.js';

export function responseData(envelope) {
  const body = envelope.result?.structuredContent;
  if (!body || typeof body !== 'object' || !body.data || body.success === false ||
      (body.code !== undefined && ![200, '200'].includes(body.code))) {
    throw new Error(`${envelope.tool} 缺少成功的结构化数据；拒绝猜测响应结构。`);
  }
  return body.data;
}

export function defaultModification(modification) {
  if (!modification?.items?.length) return undefined;
  const values = [];
  for (const group of modification.items) {
    for (const v of group.values ?? []) {
      const quantity = v.selectedQuantity;
      if (quantity > 0) {
        if (!v.code || !v.selectedKey || !Number.isInteger(quantity)) throw new Error('特调默认项信息不完整');
        values.push({ code: v.code, key: v.selectedKey, quantity });
      } else if (v.unselectedKey) values.push({ code: v.code, key: v.unselectedKey, quantity: 1 });
    }
  }
  return values.length ? { values } : undefined;
}

export function defaultCombo(detail) {
  if (!Array.isArray(detail.rounds) || !detail.rounds.length) throw new Error('自动流程仅接受有完整 rounds 的套餐');
  const names = [];
  const roundList = detail.rounds.map(round => {
    const selected = round.choices?.filter(c => c.isDefault === 1 && c.quantity > 0) ?? [];
    const quantity = selected.reduce((s, c) => s + c.quantity, 0);
    if (!Number.isInteger(quantity) || quantity < (round.minQuantity ?? round.quantity ?? 0) ||
        (round.maxQuantity >= 0 && quantity > round.maxQuantity)) throw new Error('套餐默认必选项不完整，请通过 Skill 手动核实');
    names.push(...selected.map(c => c.name));
    return { round: String(round.id), comboItemList: selected.map(c => {
      if (!c.code || !Number.isInteger(c.quantity)) throw new Error('套餐子项缺少编码或数量');
      const modification = defaultModification(c.modification);
      return { code: c.code, quantity: c.quantity, ...(modification ? { modification } : {}) };
    }) };
  });
  return { item: { productCode: detail.code, quantity: 1, roundList }, names };
}

export function assertQuote(quote, requestedItems) {
  if (!Number.isSafeInteger(quote.price) || quote.price < 0 || !Array.isArray(quote.productList) || !quote.productList.length) {
    throw new Error('官方试算缺少有效整数分价格或商品列表');
  }
  if (requestedItems) {
    const requested = new Map(requestedItems.map(i => [i.productCode, i.quantity]));
    const actual = new Map();
    for (const row of quote.productList) {
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new Error('官方试算的商品数量无效');
      actual.set(row.productCode, (actual.get(row.productCode) ?? 0) + row.quantity);
    }
    if (actual.size !== requested.size || [...requested].some(([code, q]) => actual.get(code) !== q)) {
      throw new Error('官方试算的餐品或份数与候选篮子不一致');
    }
  }
  return quote;
}

// Deliberately restricted to pickup, default complete combos, no coupons or memberships.
export async function planLive(client, request, { record = async () => {} } = {}) {
  const { storeCode, candidateCodes, members, budgetFen } = request;
  if (typeof storeCode !== 'string' || !storeCode.trim() || !Array.isArray(candidateCodes) ||
      candidateCodes.length < 1 || candidateCodes.length > 8 ||
      candidateCodes.some(c => typeof c !== 'string' || !c) || new Set(candidateCodes).size !== candidateCodes.length) {
    throw new Error('需要门店编码和1–8个不重复的套餐候选编码');
  }
  validateInput({ budgetFen, members, source: { kind: 'demo' }, menu: [
    { id: 'validation', name: 'validation', priceFen: 0, tags: [], available: true }
  ] });
  const context = { storeCode, orderType: 1, beType: 1 };
  const call = async (name, args) => {
    const envelope = await callReadTool(client, name, args);
    await record(envelope);
    return { envelope, data: responseData(envelope) };
  };
  const { data: menu, envelope: menuEnvelope } = await call('query-meals', context);
  const candidates = [];
  const mapping = new Map();
  for (const code of candidateCodes) {
    const listed = menu.meals?.[code];
    if (!listed || listed.canWithOrder || listed.withOrder) throw new Error(`候选 ${code} 不在可售列表或涉及随单购权益，需手动核实`);
    const { data: detail } = await call('query-meal-detail', { ...context, code });
    if (detail.code !== code) throw new Error('详情返回的餐品编码与请求不符');
    const combo = defaultCombo(detail);
    const { data: quote } = await call('calculate-price', { ...context, needTableware: false, items: [combo.item] });
    assertQuote(quote, [combo.item]);
    const officialTags = (menu.categories ?? []).flatMap(c => c.meals ?? []).filter(m => m.code === code).flatMap(m => m.tags ?? []);
    candidates.push({ id: code, name: detail.name, priceFen: quote.price,
      tags: [...new Set([...officialTags, detail.name, ...combo.names])], knownAbsentTags: [], available: true });
    mapping.set(code, combo);
  }
  const plan = planMeals({ members, budgetFen, deliveryFeeFen: 0, menu: candidates,
    source: { kind: 'mcp', storeId: storeCode, tool: 'query-meals', retrievedAt: menuEnvelope.retrievedAt } });
  if (plan.status !== 'planned') return { plan, verified: false };
  const items = plan.basket.map(row => ({ ...mapping.get(row.mealId).item, quantity: row.quantity }));
  const { data: quote, envelope } = await call('calculate-price', { ...context, needTableware: false, items });
  assertQuote(quote, items);
  const selectedCompositions = plan.basket.map(row => ({ mealId: row.mealId, quantity: row.quantity, components: mapping.get(row.mealId).names }));
  return { plan, verified: true, withinBudget: quote.price <= budgetFen, officialQuote: quote,
    officialQuoteAt: envelope.retrievedAt, officialRemainingFen: budgetFen - quote.price, selectedCompositions,
    note: '到店自取、套餐默认组成；候选用单份试算价规划，优惠与费用非线性时不保证组合全局最优，实际应付以最后官方试算为准。未下单。' };
}
