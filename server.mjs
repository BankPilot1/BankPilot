import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/bank.mjs';
import { aiConfig, aiAvailable, aiChat } from './src/ai.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root,'.env')); } catch(e) { if(e.code!=='ENOENT') throw e; }
const modelConfig=aiConfig();
await mkdir(path.join(root, '.data'), { recursive: true });
const statePath = path.join(root, '.data/state.json');
let saved;
try { saved = JSON.parse(await readFile(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const bank = createStore(saved);
if (saved && !saved.dataset) await writeFile(path.join(root, '.data', `state-before-sparkov-${Date.now()}.json`), JSON.stringify(saved));
await writeFile(statePath, JSON.stringify(bank.state));
let writes = Promise.resolve();
const persist = () => { const snapshot = JSON.stringify(bank.state); writes = writes.then(() => writeFile(statePath, snapshot)); return writes; };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 16000) throw new Error('请求内容过长'); }
        body = JSON.parse(raw || '{}');
      }
      let result;
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') result = {...bank.bootstrap(),ai:{configured:aiAvailable(modelConfig),model:aiAvailable(modelConfig)?modelConfig.model:null}};
      else if (req.method === 'GET' && url.pathname === '/api/transactions') result = bank.transactions(url.searchParams.get('scope') || 'all');
      else if (req.method === 'POST' && url.pathname === '/api/chat') result = await aiChat(bank,body,modelConfig);
      else if (req.method === 'POST' && url.pathname === '/api/tasks/confirm') result = bank.confirm(body);
      else if (req.method === 'POST' && url.pathname === '/api/tasks/cancel') result = bank.cancel(body);
      else if (req.method === 'POST' && url.pathname === '/api/demo/reset') result = bank.reset();
      else return json(res, 404, { error: '接口不存在' });
      if (req.method === 'POST') await persist();
      return json(res, 200, result);
    }
    if (req.method !== 'GET') return json(res, 405, { error: '不支持的请求方式' });
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filename = path.resolve(root, 'public', relative);
    if (!filename.startsWith(path.join(root, 'public') + path.sep)) return json(res, 403, { error: '拒绝访问' });
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[path.extname(filename)] || 'application/octet-stream' });
    res.end(content);
  } catch (e) { json(res, e.code === 'ENOENT' ? 404 : 400, { error: e.message || '请求失败' }); }
});
server.listen(Number(process.env.PORT || 3107), '127.0.0.1', () => console.log(`BankPilot MVP running at http://localhost:${process.env.PORT || 3107}`));
