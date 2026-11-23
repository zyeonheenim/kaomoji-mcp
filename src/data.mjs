/**
 * 数据加载
 *
 * 数据以 gzip + base64 内联在 data.b64.mjs 里，由 scripts/build-data.mjs 从
 * vendor/kaomoji.json 生成。绕这么一圈有两个原因：
 *   1. Cloudflare Worker 单文件版要能直接粘进后台，不能有外部文件依赖；
 *   2. 免费版 Worker 体积有上限，原始 JSON 1.37MB、gzip 后 280KB。
 *
 * Node 18+ 和 Workers 都原生支持 Blob / DecompressionStream / Response，
 * 所以两端不需要写两套解压代码。
 *
 * 为什么是惰性加载、而不是在模块顶层 await：
 * 模块顶层 await 要求整个模块图是 ESM。Vercel 打包 api/ 下的函数时用的是
 * esbuild 的 cjs 输出（它的 Runtime 已从 edge 迁回 Node.js），于是直接报
 * "Top-level await is currently not supported with the cjs output format"。
 * 改成导出 loadData() 之后，任何模块系统都能 import，解压时机也更可控——
 * 由 core.mjs 的 ready() 触发，一次就够。
 */
import B64 from './data.b64.mjs';

async function gunzipJson(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

let pending = null;

/** 解压并解析数据。重复调用只会真正执行一次，返回同一个 Promise。 */
export function loadData() {
  if (!pending) pending = gunzipJson(B64);
  return pending;
}
