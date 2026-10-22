import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { planMeals } from './planner.js';

const base = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['web/style.css', 'text/css; charset=utf-8']],
  ['/example.json', ['examples/team.json', 'application/json; charset=utf-8']]
]);

export function makeServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.headers.host !== `127.0.0.1:${res.socket.localPort}` && req.headers.host !== `localhost:${res.socket.localPort}`) {
        res.writeHead(403); return res.end('Forbidden host');
      }
      if (req.method === 'POST' && req.url === '/api/plan') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) { res.writeHead(403); return res.end('Forbidden origin'); }
        if (!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415); return res.end('JSON required'); }
        req.setEncoding('utf8');
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 131072) { res.writeHead(413); return res.end('Input too large'); }
        }
        const result = planMeals(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }
      const file = files.get(req.url);
      if (req.method !== 'GET' || !file) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': file[1] });
      res.end(await readFile(new URL(file[0], base)));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  makeServer().listen(port, '127.0.0.1', () => console.log(`麦麦开饭局：http://127.0.0.1:${port}（本地演示，不连接账户）`));
}
