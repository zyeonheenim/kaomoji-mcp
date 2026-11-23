/**
 * 数据加载
 *
 * 数据以 gzip + base64 内联在 data.b64.mjs 里，由 scripts/build-data.mjs 从
 * vendor/kaomoji.json 生成。绕这么一圈有两个原因：
 *   1. Cloudflare Worker 单文件版要能直接粘进后台，不能有外部文件依赖；
 *   2. 免费版 Worker 有 3MB 体积上限，原始 JSON 1.37MB、gzip 后 280KB。
 *
 * Node 18+ 和 Workers 都原生支持 Blob / DecompressionStream / Response，
 * 所以两端不需要写两套解压代码。
 */
import B64 from './data.b64.mjs';

async function gunzipJson(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// 模块顶层 await：冷启动时解压一次，之后常驻内存
export default await gunzipJson(B64);
