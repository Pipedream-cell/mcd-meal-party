import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { assertAllowed, discoverTools, callReadTool, withMcd } from '../src/mcp.js';

test('writes are rejected before tool discovery or network requests', async () => {
  for (const name of ['create-order', 'cancel-order', 'auto-bind-coupons', 'mall-create-order', 'draw-lottery']) {
    assert.throws(() => assertAllowed(name), /禁止/);
    await assert.rejects(callReadTool({}, name, {}), /禁止/);
  }
  await assert.rejects(withMcd(() => {}, { token: '' }), /缺少/);
});

test('real SDK over local Streamable HTTP: auth, pagination, schema validation, response and close', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    let body = ''; for await (const c of req) body += c;
    const msg = JSON.parse(body);
    requests.push({ method: msg.method, auth: req.headers.authorization, params: msg.params });
    if (msg.id === undefined) { res.writeHead(202); return res.end(); }
    let result;
    if (msg.method === 'initialize') result = { protocolVersion: msg.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: 'local-test-only', version: '1' } };
    if (msg.method === 'tools/list') result = msg.params?.cursor ? { tools: [{ name: 'query-meals', inputSchema: { type: 'object' } }] }
      : { tools: [
        { name: 'now-time-info', inputSchema: { type: 'object', properties: { style: { type: 'string' } }, additionalProperties: false } },
        { name: 'create-order', inputSchema: { type: 'object' } }], nextCursor: 'second' };
    if (msg.method === 'tools/call') result = msg.params.arguments.style === 'error' ? { isError: true, content: [{ type: 'text', text: 'not for quoting' }] }
      : { content: [{ type: 'text', text: 'LOCAL MOCK TIME' }] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}`), {
      requestInit: { headers: { Authorization: 'Bearer fake-test-credential' } }
    });
    await withMcd(async client => {
      assert.deepEqual((await discoverTools(client)).map(t => t.name), ['now-time-info', 'query-meals']);
      await assert.rejects(callReadTool(client, 'now-time-info', { unknown: true }), /schema/);
      const result = await callReadTool(client, 'now-time-info', {});
      assert.equal(result.result.content[0].text, 'LOCAL MOCK TIME');
      await assert.rejects(callReadTool(client, 'now-time-info', { style: 'error' }), /业务错误/);
    }, { token: 'fake-test-credential', client: new Client({ name: 'test', version: '1' }), transport });
    assert.ok(requests.every(r => r.auth === 'Bearer fake-test-credential'));
    assert.equal(requests.filter(r => r.method === 'tools/call').length, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('transport errors redact secrets and close clients', async () => {
  let closed = false;
  const client = { connect: async () => { throw new Error('bad fake-secret-token'); }, close: async () => { closed = true; } };
  await assert.rejects(withMcd(() => {}, { token: 'fake-secret-token', client, transport: {} }), e => !e.message.includes('fake-secret-token'));
  assert.equal(closed, true);
});
