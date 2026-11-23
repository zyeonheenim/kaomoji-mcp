#!/usr/bin/env node
/**
 * Node 入口
 *
 *   node src/index.mjs                  → stdio，给本机客户端（Claude Desktop / Cherry / Cursor）
 *   node src/index.mjs --http           → HTTP，给局域网和手机（默认 8790 端口）
 *   node src/index.mjs --http --port 9000 --host 127.0.0.1
 *
 * 为什么两种都要：iPad 上的客户端没法启动你 Mac 上的进程，stdio 传不过去。
 * HTTP 这边同时兼容 Streamable HTTP（POST /mcp）和老式 HTTP+SSE（GET /sse）。
 */
import readline from 'node:readline';
import http from 'node:http';
import os from 'node:os';
import { dispatch, ready, homePage, jsonResponse, CORS, STATS, VERSION } from './core.mjs';

const TOKEN = process.env.MCP_TOKEN || '';
const REPO = 'https://github.com/zyeonheenim/kaomoji-mcp';

/* ---------------------------------------------------------------- stdio */

async function runStdio() {
  // 先把数据解压好再开始读 stdin，避免第一条消息还没东西可查
  await ready();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try {
      msg = JSON.parse(s);
    } catch {
      process.stderr.write('[kaomoji-mcp] 收到非 JSON 行，已忽略\n');
      return;
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      const out = dispatch(m);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  });

  rl.on('close', () => process.exit(0));
  process.stderr.write(`[kaomoji-mcp] v${VERSION} stdio 就绪，${STATS.total} 条颜文字待命\n`);
}

/* ----------------------------------------------------------------- HTTP */

async function pipe(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2e6) reject(new Error('请求体过大'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function runHttp(port, host) {
  await ready();
  const sessions = new Map(); // sessionId -> ServerResponse

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (TOKEN) {
      const h = req.headers.authorization || '';
      if (h !== `Bearer ${TOKEN}` && url.searchParams.get('token') !== TOKEN) {
        return pipe(res, jsonResponse({ error: '未授权：需要 Bearer token 或 ?token=' }, 401));
      }
    }

    if (url.pathname === '/health') {
      return pipe(res, jsonResponse({ ok: true, ...STATS, version: VERSION, sseSessions: sessions.size }));
    }

    if (url.pathname === '/' && req.method === 'GET') {
      const endpoint = `http://${req.headers.host || `127.0.0.1:${port}`}/mcp`;
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(homePage(endpoint, REPO));
    }

    /* --- Streamable HTTP --- */
    if (url.pathname === '/mcp' && req.method === 'POST') {
      let raw;
      try {
        raw = await readBody(req);
      } catch (e) {
        return pipe(res, jsonResponse({ error: e.message }, 413));
      }
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return pipe(res, jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400));
      }

      const out = dispatch(msg);
      if (!out) {
        res.writeHead(202, CORS);
        return res.end();
      }

      const accept = req.headers.accept || '';
      if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        return res.end(`event: message\ndata: ${JSON.stringify(out)}\n\n`);
      }
      return pipe(res, jsonResponse(out));
    }

    /* --- 老式 HTTP + SSE --- */
    if (url.pathname === '/sse' && req.method === 'GET') {
      const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      res.writeHead(200, {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const endpoint = `/messages?sessionId=${sid}${TOKEN ? `&token=${TOKEN}` : ''}`;
      res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
      sessions.set(sid, res);

      // 心跳：防止中间设备把空闲连接掐掉
      const beat = setInterval(() => res.write(': ping\n\n'), 25000);
      const bye = () => {
        clearInterval(beat);
        sessions.delete(sid);
      };
      req.on('close', bye);
      res.on('error', bye);
      return;
    }

    if (url.pathname === '/messages' && req.method === 'POST') {
      const stream = sessions.get(url.searchParams.get('sessionId'));
      if (!stream) return pipe(res, jsonResponse({ error: '会话不存在或已断开' }, 404));
      let msg;
      try {
        msg = JSON.parse(await readBody(req));
      } catch {
        return pipe(res, jsonResponse({ error: 'Parse error' }, 400));
      }
      const out = dispatch(msg);
      if (out) stream.write(`event: message\ndata: ${JSON.stringify(out)}\n\n`);
      res.writeHead(202, CORS);
      return res.end();
    }

    pipe(res, jsonResponse({ error: '没有这个路径', hint: 'POST /mcp 调用工具，GET / 看说明' }, 404));
  });

  server.listen(port, host, () => {
    const addrs = [`http://127.0.0.1:${port}`];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list || []) {
        // 100.x 是 Tailscale 网段，手机/平板在自己网络外也能连上
        if (ni.family === 'IPv4' && !ni.internal) {
          addrs.push(`http://${ni.address}:${port}${ni.address.startsWith('100.') ? '   ← Tailscale' : ''}`);
        }
      }
    }
    process.stderr.write(
      `[kaomoji-mcp] v${VERSION} HTTP 就绪，${STATS.total} 条颜文字\n` +
        addrs.map((a) => `   ${a}`).join('\n') +
        `\n   端点：POST /mcp（Streamable HTTP）· GET /sse（老式 SSE）\n` +
        (TOKEN ? '   已启用 token 校验\n' : '   未设 MCP_TOKEN，同网段可直接访问\n')
    );
  });

  server.on('error', (e) => {
    process.stderr.write(`[kaomoji-mcp] 启动失败：${e.message}\n`);
    process.exit(1);
  });
}

/* ----------------------------------------------------------------- 入口 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

// 启动失败（比如数据解压不出来）要说清楚原因，别无声退出
const fatal = (e) => {
  process.stderr.write(`[kaomoji-mcp] 启动失败：${e.message}\n`);
  process.exit(1);
};

if (args.includes('--http') || args.includes('http')) {
  runHttp(Number(flag('--port', process.env.PORT)) || 8790, flag('--host', process.env.HOST || '0.0.0.0')).catch(fatal);
} else {
  runStdio().catch(fatal);
}
