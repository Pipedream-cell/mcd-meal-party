const el = id => document.getElementById(id);
const yuan = fen => `¥${(fen / 100).toFixed(2)}`;
let lastPlan;
let copyText = '';
const node = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
function members(input) {
  el('members').replaceChildren(...input.members.map(m => {
    const row = node('div', undefined, 'member');
    row.append(node('span', m.name.slice(-1), 'avatar'), node('strong', m.name),
      node('small', (m.preferTags ?? []).join(' / ') || '随心搭配'));
    return row;
  }));
}
async function generate() {
  el('result-title').textContent = '正在安排这一餐…';
  el('plan').disabled = true;
  el('copy').disabled = el('download').disabled = true;
  lastPlan = undefined;
  el('assignments').replaceChildren();
  el('totals').replaceChildren();
  try {
    const input = JSON.parse(el('input').value);
    input.budgetFen = Math.round(Number(el('budget').value) * 100);
    const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const plan = await response.json();
    if (!response.ok) throw new Error(plan.error);
    members(input);
    if (plan.status !== 'planned') {
      el('result-title').textContent = plan.status === 'over-budget' ? '这次需要调整预算' : '还有信息需要核实';
      el('status').textContent = plan.reason + (plan.shortfallFen ? ` 还差 ${yuan(plan.shortfallFen)}` : ` 待核实：${plan.blocked.join('、')}`);
      return;
    }
    lastPlan = plan;
    el('result-title').textContent = '这一餐，安排好了';
    el('status').textContent = `已照顾 ${plan.assignments.length} 位成员 · 共命中 ${plan.fairness.totalMatchedPreferences} 项偏好 · ${plan.source.kind === 'demo' ? '虚构数据演示' : '查询估算，待官方试算'}`;
    document.querySelector('.demo').textContent = plan.source.kind === 'demo' ? '虚构数据演示' : '查询价 / 未核价';
    el('assignments').replaceChildren(...plan.assignments.map((r, i) => {
      const row = node('div', undefined, 'meal-row');
      const info = node('div');
      info.append(node('strong', `${r.member} · ${r.meal}`), node('small', `偏好命中：${r.matchedPreferences.join('、') || '无'}${r.checkedAvoidTags.length ? ` / 已核实回避：${r.checkedAvoidTags.join('、')}` : ''}`));
      row.append(node('span', String(i + 1).padStart(2, '0'), 'number'), info, node('span', yuan(r.priceFen), 'price'));
      return row;
    }));
    const total = node('div', undefined, 'total');
    const label = node('div'); label.append(node('div', '这一餐的预算明细'), node('small', `含配送 ${yuan(plan.deliveryFeeFen)} · 剩余 ${yuan(plan.remainingFen)}`));
    total.append(label, node('strong', yuan(plan.totalFen)));
    el('totals').replaceChildren(total);
    copyText = [plan.source.kind === 'demo' ? '麦麦开饭局【虚构数据演示】' : '麦麦开饭局【查询估算，待官方试算】', ...plan.assignments.map(r => `${r.member}：${r.meal} ${yuan(r.priceFen)}`), `合计 ${yuan(plan.totalFen)}，含配送 ${yuan(plan.deliveryFeeFen)}`, ...plan.notes].join('\n');
    el('copy').disabled = el('download').disabled = false;
  } catch (e) { el('result-title').textContent = '请检查输入信息'; el('status').textContent = e.message; }
  finally { el('plan').disabled = false; }
}
el('plan').addEventListener('click', generate);
el('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(copyText); el('status').textContent = '分餐清单已复制（包含数据来源说明）'; }
  catch { el('status').textContent = '浏览器未允许剪贴板，请下载方案 JSON。'; }
});
el('download').addEventListener('click', () => {
  if (!lastPlan) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastPlan, null, 2)], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'meal-party-plan.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  const input = await (await fetch('/example.json')).json();
  el('input').value = JSON.stringify(input, null, 2);
  members(input);
  await generate();
} catch (e) { el('status').textContent = e.message; }
