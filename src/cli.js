import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { planMeals, formatPlan } from './planner.js';
import { withMcd, discoverTools, callReadTool } from './mcp.js';
import { planLive } from './live.js';

const [command, ...args] = process.argv.slice(2);
const jsonFile = async path => JSON.parse(await readFile(path, 'utf8'));
try {
  if (command === 'demo' || command === 'plan') {
    const input = await jsonFile(command === 'demo' ? fileURLToPath(new URL('../examples/team.json', import.meta.url)) : args[0]);
    const plan = planMeals(input);
    console.log(args.includes('--json') ? JSON.stringify(plan, null, 2) : formatPlan(plan));
    if (plan.status !== 'planned') process.exitCode = 2;
  } else if (command === 'live') {
    if (!args[0]) throw new Error('用法：live <团队请求.json>');
    const request = await jsonFile(args[0]);
    await mkdir('.local', { recursive: true });
    const result = await withMcd(client => planLive(client, request));
    await writeFile('.local/live-plan.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    if (!result.verified || !result.withinBudget) process.exitCode = 2;
  } else if (command === 'tools') {
    console.log(JSON.stringify(await withMcd(discoverTools), null, 2));
  } else if (command === 'call') {
    if (!args[0] || !args[1]) throw new Error('用法：call <工具名> <参数.json> [私有输出.json]');
    const jsonArgs = await jsonFile(args[1]);
    const result = await withMcd(client => callReadTool(client, args[0], jsonArgs));
    if (args[2]) {
      await writeFile(args[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      console.log('查询结果已写入指定私有文件，请勿提交账户或位置数据。');
    } else console.log(JSON.stringify(result, null, 2));
  } else if (command === 'smoke') {
    const result = await withMcd(async client => {
      const tools = await discoverTools(client);
      const tool = tools.find(t => t.name === 'now-time-info');
      if (!tool) throw new Error('未发现 now-time-info');
      const call = await callReadTool(client, tool.name, {});
      // Evidence deliberately excludes account, menu, location, and tool content.
      return { server: call.server, tool: call.tool, verifiedAt: call.retrievedAt,
        success: true, contentBlocks: call.result.content?.length ?? 0,
        discoveredTools: tools.map(t => t.name) };
    });
    await mkdir('.local', { recursive: true });
    await writeFile('.local/live-check.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('麦麦开饭局\n  npm run demo\n  npm start\n  node src/cli.js plan <团队菜单.json> [--json]\n  npm run mcp:tools\n  node --env-file-if-exists=.env src/cli.js call <工具名> <参数.json> [私有输出.json]\n  node --env-file-if-exists=.env src/cli.js smoke');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
