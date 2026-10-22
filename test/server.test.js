import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../src/server.js';

test('local demo serves UI, computes plans and rejects bad input and cross-origin requests', async () => {
  const server = makeServer().listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url); assert.equal(page.status, 200);
    assert.match(await page.text(), /麦麦开饭局/);
    const example = await (await fetch(`${url}/example.json`)).json();
    const post = (body, headers = {}) => fetch(`${url}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const result = await post(example); assert.equal((await result.json()).totalFen, 10400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post(example, { origin: 'https://unexpected.example' })).status, 403);
    assert.equal((await fetch(`${url}/.env`)).status, 404);
    assert.equal((await fetch(`${url}/api/plan`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
