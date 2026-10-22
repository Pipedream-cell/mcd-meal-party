import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv';

export const MCD_ENDPOINT = 'https://mcp.mcd.cn';
export const ALLOWED_TOOLS = new Set(['now-time-info', 'campaign-calendar', 'query-nearby-stores',
  'query-meals', 'query-meal-detail', 'query-store-coupons', 'calculate-price', 'list-nutrition-foods']);

export function assertAllowed(name) {
  if (!ALLOWED_TOOLS.has(name)) throw new Error(`此项目仅允许配餐所需的查询和试算，禁止调用：${name}`);
}

export async function withMcd(action, { token = process.env.MCD_MCP_TOKEN, client, transport } = {}) {
  if (!token?.trim()) throw new Error('缺少 MCD_MCP_TOKEN。请在本地 .env 填入 Token，不要发到聊天或提交 Git。');
  client ??= new Client({ name: 'mcd-meal-party', version: '1.0.0' });
  transport ??= new StreamableHTTPClientTransport(new URL(MCD_ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token.trim()}` } }
  });
  try {
    await client.connect(transport);
    return await action(client);
  } catch (error) {
    // SDK/server errors may contain HTTP details. Never echo the credential.
    throw new Error(String(error.message).split(token.trim()).join('[REDACTED]'));
  } finally { await client.close().catch(() => {}); }
}

export async function discoverTools(client) {
  const all = [];
  const seen = new Set();
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    all.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('服务端工具分页游标重复');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return all.filter(t => ALLOWED_TOOLS.has(t.name));
}

export async function callReadTool(client, name, args) {
  assertAllowed(name);
  const tool = (await discoverTools(client)).find(t => t.name === name);
  if (!tool) throw new Error(`当前服务端未提供 ${name}`);
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(tool.inputSchema);
  if (!validate(args)) throw new Error(`参数与服务端 schema 不符：${ajv.errorsText(validate.errors)}`);
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  const body = result.structuredContent;
  if (result.isError || body?.success === false || (body?.code !== undefined && ![200, '200'].includes(body.code))) {
    throw new Error(`${name} 返回业务错误；请核对参数和账户状态，本次结果不可用于报价。`);
  }
  return { server: MCD_ENDPOINT, tool: name, retrievedAt: new Date().toISOString(), result };
}
