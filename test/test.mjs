#!/usr/bin/env node
/**
 * 测试：三个入口都要验一遍。
 *
 *   1. 核心层   —— 直接调 dispatch，验协议与情绪路由
 *   2. Worker   —— 喂 fetch handler 真 Request，验 HTTP 分流
 *   3. Vercel   —— 两种入参形态都验：Node 的 (req,res) 与 Edge 的 Request
 *   4. stdio    —— 真起一个子进程，验 JSON-RPC 行协议
 *
 * 不用任何测试框架，node 自带 assert 够用。CI 里跑 `npm test`。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { dispatch, ready, STATS, TOOLS } from '../src/core.mjs';
import worker from '../src/worker.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 数据是惰性加载的（模块顶层不能有 await），所以测试开始前先把它就位
await ready();
let pass = 0;
let fail = 0;

async function t(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message.split('\n')[0]}`);
    fail++;
  }
}

const rpc = (method, params, id = 1) => dispatch({ jsonrpc: '2.0', id, method, params });
const callTool = (name, args) => {
  const r = rpc('tools/call', { name, arguments: args });
  return { text: r.result.content[0].text, data: r.result.structuredContent, isError: r.result.isError };
};

/* ---------------------------------------------------------- 1. 核心层 */

console.log('\n核心层');

await t('数据规模在合理区间', () => {
  assert.ok(STATS.total > 20000, `条数 ${STATS.total} 偏少`);
  assert.equal(STATS.categories, 38);
});

await t('initialize 返回协议版本与用法说明', () => {
  const r = rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.equal(r.result.serverInfo.name, 'kaomoji');
  assert.match(r.result.instructions, /颜文字库/);
});

await t('未知协议版本回退到当前版本', () => {
  assert.equal(rpc('initialize', { protocolVersion: '1999-01-01' }).result.protocolVersion, '2025-06-18');
});

await t('tools/list 列出 4 个工具且都有 inputSchema', () => {
  const r = rpc('tools/list');
  assert.equal(r.result.tools.length, 4);
  for (const tool of r.result.tools) assert.equal(tool.inputSchema.type, 'object');
});

await t('通知类消息不产生响应', () => {
  assert.equal(dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

await t('不支持的方法返回 -32601', () => {
  assert.equal(rpc('nope/nope').error.code, -32601);
});

await t('批量请求按条返回', () => {
  const out = dispatch([
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  assert.equal(out.length, 2);
});

await t('pick_kaomoji 把「开心」路由到 happy', () => {
  const { data } = callTool('pick_kaomoji', { mood: '开心', count: 3 });
  assert.equal(data.matched[0].id, 'happy');
  assert.equal(data.items.length, 3);
});

await t('情绪词权重高于场景词：下班了超开心 → happy 而非困倦', () => {
  const { data } = callTool('pick_kaomoji', { mood: '下班了超开心', count: 3 });
  assert.equal(data.matched[0].id, 'happy', `实际路由到 ${data.matched[0].id}`);
});

await t('返回的颜文字不含控制字符与 HTML 实体', () => {
  for (const mood of ['开心', '难过', '生气', '猫', '困']) {
    for (const s of callTool('pick_kaomoji', { mood, count: 6 }).data.items) {
      assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s), `含控制字符：${s}`);
      assert.ok(!/&(#x?[0-9a-f]+|[a-z]+);/i.test(s), `含 HTML 实体：${s}`);
    }
  }
});

await t('同一批结果不重复', () => {
  for (let i = 0; i < 20; i++) {
    const items = callTool('pick_kaomoji', { mood: '开心', count: 8 }).data.items;
    assert.equal(new Set(items).size, items.length);
  }
});

await t('count 超出范围被夹紧', () => {
  assert.equal(callTool('pick_kaomoji', { mood: '开心', count: 999 }).data.items.length, 10);
  assert.equal(callTool('pick_kaomoji', { mood: '开心', count: 0 }).data.items.length, 5);
});

await t('exclude 参数能避开已用过的条目', () => {
  const first = callTool('pick_kaomoji', { mood: '猫', count: 3 }).data.items;
  const second = callTool('pick_kaomoji', { mood: '猫', count: 5, exclude: first }).data.items;
  for (const s of second) assert.ok(!first.includes(s), `没避开：${s}`);
});

await t('不存在的分类给出可用列表而不是崩', () => {
  const r = callTool('pick_kaomoji', { mood: 'x', category: 'nope' });
  assert.equal(r.isError, true);
  assert.match(r.text, /cat/);
});

await t('search_kaomoji 能按符号搜到爱心', () => {
  const { data } = callTool('search_kaomoji', { query: '♡', count: 5 });
  assert.ok(data.items.length > 0);
});

await t('decorate 判得出情绪并给出成品', () => {
  const { data } = callTool('decorate', { text: '终于考完啦！！' });
  assert.ok(data.mood, '应该有情绪判断');
  assert.ok(data.decorated.startsWith('终于考完啦！！'));
});

await t('decorate 信号不足时不硬猜', () => {
  const { data } = callTool('decorate', { text: '这句话没什么情绪' });
  assert.equal(data.mood, null);
});

await t('list_categories 覆盖全部分类', () => {
  const lines = callTool('list_categories', {}).text.split('\n');
  assert.ok(lines.length >= STATS.categories + 3);
});

/* --------------------------------------------------------- 2. Worker */

console.log('\nWorker');

const fetchWorker = async (p, init) => {
  const res = await worker.fetch(new Request('https://kaomoji.test' + p, init), {}, {});
  return { status: res.status, headers: res.headers, body: await res.text() };
};

await t('GET /health 返回条数', async () => {
  const r = await fetchWorker('/health');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).total, STATS.total);
});

await t('POST /mcp 能调工具', async () => {
  const r = await fetchWorker('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_categories', arguments: {} } }),
  });
  assert.equal(r.status, 200);
  assert.match(JSON.parse(r.body).result.content[0].text, /情绪分类/);
});

await t('通知消息返回 202', async () => {
  const r = await fetchWorker('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(r.status, 202);
});

await t('Accept 只写 SSE 时回事件流', async () => {
  const r = await fetchWorker('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  assert.match(r.headers.get('content-type'), /event-stream/);
  assert.match(r.body, /^event: message/);
});

await t('坏 JSON 返回 -32700', async () => {
  const r = await fetchWorker('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(JSON.parse(r.body).error.code, -32700);
});

await t('OPTIONS 预检与 404 兜底', async () => {
  assert.equal((await fetchWorker('/', { method: 'OPTIONS' })).status, 204);
  assert.equal((await fetchWorker('/nope')).status, 404);
});

/* -------------------------------------------------------- 3. Vercel */

console.log('\nVercel');

const edge = (await import('../api/mcp.mjs')).default;

/** 模拟 Vercel 现在真正传进来的东西：Node 的 req / res，url 是相对路径 */
async function callNode({ method = 'POST', path: reqPath = '/api/mcp', body, headers = {} } = {}) {
  const req = {
    method,
    url: reqPath,
    headers: { host: 'demo.vercel.app', 'content-type': 'application/json', ...headers },
    body,
  };
  let status = 0;
  let payload = '';
  const outHeaders = {};
  const res = {
    setHeader(k, v) {
      outHeaders[k.toLowerCase()] = v;
    },
    end(b) {
      payload = b ? b.toString('utf8') : '';
    },
    set statusCode(v) {
      status = v;
    },
    get statusCode() {
      return status;
    },
  };
  await edge(req, res);
  return { status, headers: outHeaders, body: payload };
}

await t('Node 形态 POST /api/mcp 能调工具（Vercel 现在的真实入参）', async () => {
  const r = await callNode({
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'pick_kaomoji', arguments: { mood: '开心', count: 2 } },
    }),
  });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).result.structuredContent.items.length, 2);
});

await t('Node 形态的相对路径能补成绝对 URL，端点按部署域名推导', async () => {
  const r = await callNode({ method: 'GET', path: '/' });
  assert.equal(r.status, 200);
  assert.match(r.body, /demo\.vercel\.app\/mcp/, '应显示部署者自己的域名');
  assert.ok(!r.body.includes('zyeonheenim.stream'), '不该出现作者域名');
});

await t('Node 形态能透传请求头与预解析过的 body', async () => {
  const r = await callNode({
    headers: { authorization: 'Bearer x' },
    body: { jsonrpc: '2.0', id: 7, method: 'tools/list' },
  });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).result.tools.length, 4);
});

await t('Edge 形态（直接传 Request）仍可用作兜底', async () => {
  const r = await edge(
    new Request('https://someone-else.vercel.app/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).result.tools.length, 4);
});

await t('源码里没有顶层 await（打成 CJS 会构建失败）', () => {
  for (const f of ['src/data.mjs', 'src/core.mjs', 'src/worker.mjs', 'api/mcp.mjs']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/^await\s/m.test(s), `${f} 含顶层 await`);
    assert.ok(!/^export default await/m.test(s), `${f} 含顶层 await`);
  }
});

/* ------------------------------------------------------------ 4. stdio */

console.log('\nstdio');

await t('子进程能完成 initialize → tools/call 往返', async () => {
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pick_kaomoji', arguments: { mood: '想撒娇', count: 2 } } },
  ];

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'src/index.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.on('error', reject);
    p.on('close', () => resolve(buf.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))));
    p.stdin.end(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  });

  assert.equal(out.length, 2, '通知不该产生响应行');
  assert.equal(out[0].result.serverInfo.name, 'kaomoji');
  assert.equal(out[1].result.structuredContent.items.length, 2);
});

/* ---------------------------------------------------------------- 汇总 */

console.log(`\n${fail ? '❌' : '✅'} ${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
