/**
 * Vercel Edge Function 适配层
 *
 * 部署后端点：https://<你的项目>.vercel.app/mcp
 * （vercel.json 里把 /mcp 重写到了 /api/mcp，两个地址都能用）
 *
 * 为什么能这么薄：core.mjs 只用 Web 标准 API（Request / Response /
 * DecompressionStream / atob），没有一行 Node 专有代码。所以这里既不用
 * 起 http 服务，也不用把 Node 的 req/res 转成 Web 的。
 *
 * 注意：Vercel 的 Edge Runtime 是无状态的，老式 HTTP+SSE 传输（GET /sse
 * 挂着等推送）在这里不成立。Streamable HTTP（POST /mcp）完全够用，
 * 现在主流客户端都支持。
 */
import worker from '../src/worker.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
  const origin = new URL(request.url).origin;
  return worker.fetch(request, { ENDPOINT_HINT: `${origin}/mcp` });
}
