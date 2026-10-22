// Money is always an integer number of fen. No coupon stacking assumptions.
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function strings(value) { return Array.isArray(value) && value.every(x => typeof x === 'string'); }
function preferenceTags(value) {
  return strings(value) && value.length <= 20 && new Set(value).size === value.length && value.every(x => x.length > 0 && x.length <= 50);
}

export function validateInput(input) {
  requireThat(input && typeof input === 'object', '请输入配餐对象');
  const { budgetFen, members, menu, source, deliveryFeeFen = 0 } = input;
  requireThat(Number.isSafeInteger(budgetFen) && budgetFen >= 0 && budgetFen <= 1000000, '预算必须是 0–1000000 分的整数');
  requireThat(Number.isSafeInteger(deliveryFeeFen) && deliveryFeeFen >= 0 && deliveryFeeFen <= 1000000, '配送费必须是非负整数分');
  requireThat(Array.isArray(members) && members.length > 0 && members.length <= 12, '支持 1–12 位成员');
  requireThat(Array.isArray(menu) && menu.length > 0 && menu.length <= 100, '需要 1–100 个完整餐品/套餐选项');
  requireThat(source && ['demo', 'mcp'].includes(source.kind), '必须标明 demo 或 mcp 数据来源');
  if (source.kind === 'mcp') {
    requireThat(typeof source.storeId === 'string' && source.storeId.trim() &&
      Number.isFinite(Date.parse(source.retrievedAt)) && source.tool === 'query-meals', 'MCP 菜单需包含门店、查询时间和 query-meals 来源');
  }
  for (const m of members) {
    requireThat(m && typeof m.name === 'string' && m.name.trim() && m.name.length <= 50, '成员需有 1–50 字姓名或代号');
    requireThat(preferenceTags(m.avoidTags ?? []) && preferenceTags(m.preferTags ?? []), '成员偏好与回避标签需为最多20个不重复的非空标签，每个最多50字');
  }
  requireThat(new Set(members.map(m => m.name)).size === members.length, '成员名称不能重复');
  for (const item of menu) {
    requireThat(item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim(), '餐品需有编号和名称');
    requireThat(Number.isSafeInteger(item.priceFen) && item.priceFen >= 0 && item.priceFen <= 1000000, '餐品价格必须是非负整数分');
    requireThat(strings(item.tags) && strings(item.knownAbsentTags ?? []), '餐品标签必须是字符串数组');
    requireThat(typeof item.available === 'boolean', '餐品必须明确是否可售');
  }
  requireThat(new Set(menu.map(m => m.id)).size === menu.length, '餐品编号不能重复');
  return input;
}

function optionsFor(member, menu) {
  return menu.filter(item => item.available && (member.avoidTags ?? []).every(tag =>
    !item.tags.includes(tag) && (item.knownAbsentTags ?? []).includes(tag)))
    .map(item => ({ item, score: (member.preferTags ?? []).filter(t => item.tags.includes(t)).length }));
}

export function planMeals(input) {
  validateInput(input);
  const { members, menu, budgetFen, deliveryFeeFen = 0, source } = input;
  const options = members.map(m => optionsFor(m, menu));
  const blocked = members.filter((_, i) => !options[i].length).map(m => m.name);
  if (blocked.length) return { status: 'needs-information', blocked,
    reason: '没有满足已知偏好回避条件的可售餐品；缺失成分信息不能视为安全，请核实官方信息或调整条件。', source };
  const minimumFen = options.reduce((sum, list) => sum + Math.min(...list.map(o => o.item.priceFen)), deliveryFeeFen);
  if (minimumFen > budgetFen) return { status: 'over-budget', minimumFen, shortfallFen: minimumFen - budgetFen,
    reason: '当前每人一份的最低可行金额仍超预算，不会悄悄减少人数或忽略偏好条件。', source };
  // DP by total preference score, retaining the cheapest assignment for each score.
  // Maximizing the least-satisfied member first avoids sacrificing one person for the group.
  const maxFloor = Math.min(...options.map(list => Math.max(...list.map(o => o.score))));
  let chosen;
  let fairFloor;
  for (let floor = maxFloor; floor >= 0; floor--) {
    let states = new Map([[0, { cost: deliveryFeeFen, rows: [] }]]);
    for (let i = 0; i < members.length; i++) {
      const next = new Map();
      for (const [score, state] of states) for (const opt of options[i].filter(o => o.score >= floor)) {
        const cost = state.cost + opt.item.priceFen;
        const totalScore = score + opt.score;
        if (cost <= budgetFen && (!next.has(totalScore) || cost < next.get(totalScore).cost)) {
          next.set(totalScore, { cost, rows: [...state.rows, { member: members[i].name,
            mealId: opt.item.id, meal: opt.item.name, priceFen: opt.item.priceFen,
            matchedPreferences: (members[i].preferTags ?? []).filter(t => opt.item.tags.includes(t)),
            checkedAvoidTags: members[i].avoidTags ?? [] }] });
        }
      }
      states = next;
    }
    if (states.size) {
      const bestScore = Math.max(...states.keys());
      chosen = { ...states.get(bestScore), score: bestScore };
      fairFloor = floor;
      break;
    }
  }
  const basket = new Map();
  for (const row of chosen.rows) {
    const line = basket.get(row.mealId) ?? { mealId: row.mealId, name: row.meal, quantity: 0, unitPriceFen: row.priceFen };
    line.quantity++;
    basket.set(row.mealId, line);
  }
  return { status: 'planned', source, pricingStatus: source.kind === 'demo' ? 'demo-only' : 'estimate-needs-calculate-price',
    totalFen: chosen.cost, deliveryFeeFen, remainingFen: budgetFen - chosen.cost, minimumFen,
    fairness: { minimumMatchedPreferences: fairFloor, totalMatchedPreferences: chosen.score },
    assignments: chosen.rows, basket: [...basket.values()],
    notes: ['一人一份完整餐品/套餐；同一选项可重复购买，库存与份数限制待官方核验。',
      '回避标签只是偏好筛选，不能证明过敏安全；过敏需求需咨询官方或门店。',
      source.kind === 'demo' ? '所有餐品、价格及标签为虚构演示数据。' : '查询价仅为估算，优惠互斥、配送费和最终应付以 calculate-price 为准。'] };
}

export const yuan = fen => `¥${(fen / 100).toFixed(2)}`;
export function formatPlan(plan) {
  if (plan.status !== 'planned') return `${plan.reason}\n${plan.shortfallFen ? `还差 ${yuan(plan.shortfallFen)}` : `待核实：${plan.blocked.join('、')}`}`;
  return [plan.source.kind === 'demo' ? '【演示数据 / 非真实报价】麦麦开饭局' : '【门店查询估算 / 待官方试算】麦麦开饭局',
    ...plan.assignments.map(r => `${r.member}：${r.meal} ${yuan(r.priceFen)} · 偏好命中 ${r.matchedPreferences.join('、') || '无'}`),
    `合计 ${yuan(plan.totalFen)}（含配送 ${yuan(plan.deliveryFeeFen)}），预算剩余 ${yuan(plan.remainingFen)}`,
    ...plan.notes].join('\n');
}
