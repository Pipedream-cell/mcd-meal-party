import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const required = ['README.md', 'CONTEST_DECLARATION.md', 'MCP_INTEGRATION.md', 'mcp-config.example.json', 'skills/mcd-meal-party/SKILL.md', 'src/mcp.js', 'package-lock.json'];
try {
  for (const path of required) {
    if (!(await readFile(path)).length) throw new Error(`${path} 为空`);
  }
  const declaration = await readFile('CONTEST_DECLARATION.md');
  const hash = createHash('sha256').update(declaration).digest('hex');
  if (hash !== 'cd28101bcb29cc8fb24b372fe91ce6b42c4a1487a54e01f7ade0c8c6a84241b7') throw new Error('官方声明内容发生变化，需与官方原文核对');
  const config = JSON.parse(await readFile('mcp-config.example.json', 'utf8'));
  if (config.mcpServers['mcd-mcp'].headers.Authorization !== 'Bearer ${MCD_MCP_TOKEN}') throw new Error('MCP 示例配置必须仅含环境变量占位符');
  if (process.argv.includes('--require-live')) {
    const evidence = JSON.parse(await readFile('.local/live-check.json', 'utf8'));
    if (!evidence.success || evidence.server !== 'https://mcp.mcd.cn' || evidence.tool !== 'now-time-info' ||
      !Number.isFinite(Date.parse(evidence.verifiedAt))) throw new Error('缺少有效连接检查记录');
    console.log(`本地连接记录：${evidence.verifiedAt}（仍需门店业务核价验证）`);
  }
  console.log('参赛必需文件、官方声明 SHA256 与脱敏配置检查通过。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
