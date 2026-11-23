/**
 * Vercel 适配层
 *
 * 部署后端点：https://<你的项目>.vercel.app/mcp
 * （vercel.json 里把 /mcp 重写到 /api/mcp，两个地址都能用）
 *
 * 为什么能这么薄：core.mjs 只用 Web 标准 API（Request / Response /
 * DecompressionStream / atob），没有一行 Node 专有代码。所以这里不用实现
 * 任何业务逻辑，只做一次入参形态转换。
 *
 * 关于 Runtime：Vercel 正在弃用 Edge Runtime（官方文档已建议迁回 Node.js，
 * Next.js 16.3 起 `runtime = 'edge'` 直接不支持）。实测在非框架项目里声明
 * `export const config = { runtime: 'edge' }` 也不再生效——函数会被当成 Node
 * 函数、用 esbuild 打成 CJS，于是 src/data.mjs 原来的顶层 await 直接构建失败。
 * 所以这里按 Node 函数写：入参是 (req, res)，出参自己往 res 里写。
 *
 * 两种形态都兼容：如果哪天 Vercel 又传进标准 Request（Edge 风格，没有 res），
 * 就直接把 Response 返回去。
 */
import worker from '../src/worker.mjs';

const HEADER_KEYS_SKIP = new Set(['connection', 'keep-alive', 'transfer-encoding']);

/** Node 的 req.headers → Web Headers */
function toHeaders(raw = {}) {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null || HEADER_KEYS_SKIP.has(k.toLowerCase())) continue;
    if (Array.isArray(v)) v.forEach((x) => h.append(k, String(x)));
    else h.set(k, String(v));
  }
  return h;
}

/** 拿请求体。平台可能已经解析过（req.body），也可能只给流 */
async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;

  const b = req.body;
  if (typeof b === 'string') return b;
  if (b instanceof Uint8Array) return b; // Buffer 也是 Uint8Array
  if (b && typeof b === 'object') return JSON.stringify(b); // 平台已按 JSON 解析

  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

/** request.url 在 Node 里是 "/api/mcp" 这种相对路径，要补全成绝对地址 */
function absoluteUrl(req) {
  const headers = req.headers || {};
  const proto = headers['x-forwarded-proto'] || 'https';
  const host = headers['x-forwarded-host'] || headers.host || 'localhost';
  return new URL(req.url || '/', `${proto}://${host}`);
}

export default async function handler(req, res) {
  const isNode = Boolean(res && typeof res.setHeader === 'function');

  let request;
  if (isNode) {
    request = new Request(absoluteUrl(req), {
      method: req.method || 'GET',
      headers: toHeaders(req.headers),
      body: await readBody(req),
    });
  } else {
    request = req; // Edge 风格：直接就是标准 Request
  }

  const origin = new URL(request.url).origin;
  const response = await worker.fetch(request, { ENDPOINT_HINT: `${origin}/mcp` });

  if (!isNode) return response;

  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}
