/**
 * Cloudflare Worker / 任何 fetch 风格运行时的入口
 *
 * Workers 无常驻进程，SSE 长连接要 Durable Objects，不值当——所以这里只走
 * Streamable HTTP，且完全无状态：每次请求独立处理。
 *
 * 部署：wrangler deploy / Vercel Edge（api/mcp.mjs）/ Docker，三者共用这一份。
 */
import { checkToken, dispatch, ready, homePage, jsonResponse, CORS, STATS, VERSION } from './core.mjs';

const REPO = 'https://github.com/zyeonheenim/kaomoji-picker-mcp';

/** MCP 端点候选路径。/api/mcp 是为了 Vercel 这类把函数挂在 /api 下的平台 */
const MCP_PATHS = new Set(['/mcp', '/', '/api/mcp']);

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    // 首次请求时解压数据，之后命中缓存（同一个 isolate 内常驻）
    await ready();

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // 可选令牌保护：设了 MCP_TOKEN 就只放行带凭证的请求（CORS 预检在上一行已放行）
    if (!checkToken(request, env.MCP_TOKEN)) {
      return jsonResponse(
        { error: '未授权', hint: '在地址末尾加 ?token=你的令牌，或用 Authorization: Bearer 你的令牌' },
        401
      );
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, ...STATS, version: VERSION });
    }

    // 首页：端点地址按实际部署位置推导，别人部署后不会显示成作者的域名
    // 浏览器直接打开 /mcp 也走这里——否则分享出去的端点链接点开是一屏 JSON 报错
    if (MCP_PATHS.has(url.pathname) && request.method === 'GET') {
      const endpoint = env.ENDPOINT_HINT || `${url.origin}/mcp`;
      return new Response(homePage(endpoint, REPO, Boolean(env.MCP_TOKEN)), {
        headers: {
          ...CORS,
          'Content-Type': 'text/html; charset=utf-8',
          // 开了令牌就是私人页面，别让 CDN 缓存后绕过校验发给别人
          'Cache-Control': env.MCP_TOKEN ? 'private, no-store' : 'public, max-age=3600',
        },
      });
    }

    // 规范路径是 POST /mcp；根路径也接受，省得客户端少打一段就报错
    if (MCP_PATHS.has(url.pathname) && request.method === 'POST') {
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
