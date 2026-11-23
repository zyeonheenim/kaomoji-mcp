/**
 * Cloudflare Worker 入口
 *
 * Workers 无常驻进程，SSE 长连接要 Durable Objects，不值当——所以这里只走
 * Streamable HTTP，且完全无状态：每次请求独立处理。
 *
 * 部署：wrangler deploy，或者把 dist/worker.js（单文件版）粘进 Cloudflare 后台。
 */
import { dispatch, homePage, jsonResponse, CORS, STATS, VERSION } from './core.mjs';

const ENDPOINT = 'https://kaomoji.zyeonheenim.stream/mcp';
const REPO = 'https://github.com/zyeonheenim/kaomoji-mcp';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // 可选 token 保护：设置了 MCP_TOKEN 就只放行带凭证的请求
    if (env.MCP_TOKEN) {
      const h = request.headers.get('authorization') || '';
      if (h !== `Bearer ${env.MCP_TOKEN}` && url.searchParams.get('token') !== env.MCP_TOKEN) {
        return jsonResponse({ error: '未授权' }, 401);
      }
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, ...STATS, version: VERSION });
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(homePage(ENDPOINT, REPO), {
        headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // 规范路径是 POST /mcp；根路径也接受，省得客户端少打一段就报错
    if ((url.pathname === '/mcp' || url.pathname === '/') && request.method === 'POST') {
      let raw;
      try {
        raw = await request.text();
      } catch {
        return jsonResponse({ error: '读不到请求体' }, 400);
      }
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
      }
      const out = dispatch(msg);
      if (!out) return new Response(null, { status: 202, headers: CORS });

      // 有些客户端只吃 SSE 响应，按 Accept 分流
      const accept = request.headers.get('accept') || '';
      const wantsSse = accept.includes('text/event-stream') && !accept.includes('application/json');
      if (wantsSse) {
        const body = `event: message\ndata: ${JSON.stringify(out)}\n\n`;
        return new Response(body, {
          headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        });
      }
      return jsonResponse(out);
    }

    return jsonResponse({ error: '没有这个路径', hint: 'POST /mcp 调用工具，GET / 看说明' }, 404);
  },
};
