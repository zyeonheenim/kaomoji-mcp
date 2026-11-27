/**
 * kaomoji-picker-mcp 核心层
 *
 * 数据派生、情绪路由、四个工具、JSON-RPC 分发，全在这里。
 * 这一层不碰任何平台 API（只用标准 Response，Node 18+ 和 Workers 都有），
 * 所以三种跑法共用同一份逻辑：
 *   · src/index.mjs   Node：stdio（给本机客户端）+ HTTP（给局域网/iPad）
 *   · src/worker.mjs  Cloudflare Worker：fetch handler
 */
import { loadData } from './data.mjs';

export const VERSION = '1.0.0';
export const SERVER = { name: 'kaomoji-picker', version: VERSION };

/**
 * 数据与派生索引，由 ready() 填充。
 *
 * 用 let 而不是 const：这个模块本身不能有顶层 await（Vercel 打包成 CJS 会报错），
 * 所以数据晚于模块求值就位。`export let` 的实时绑定保证 importer 拿到的始终是
 * 填充后的值——不需要把 CATS 改成函数。
 */
let DATA = null;
export let CATS = [];
export let BY_ID = new Map();
export let STATS = { total: 0, categories: 0 };
export let INSTRUCTIONS = '';

let readyPromise = null;

/** 加载数据并派生索引。可重复调用，只真正执行一次。 */
export function ready() {
  if (!readyPromise) {
    readyPromise = loadData().then((d) => {
      DATA = d;
      CATS = d.categories;
      BY_ID = new Map(CATS.map((c) => [c.id, c]));
      STATS = { total: d.total, categories: CATS.length };
      INSTRUCTIONS = `颜文字库，共 ${d.total} 条，分 ${CATS.length} 个情绪分类（开心、生气、难过、撒娇、困、猫猫狗狗都有）。
用法：当回复带情绪、且场合轻松时，用 pick_kaomoji 描述当下的心情，取 3-5 条候选，挑一条最贴的贴到句尾。
一条就够，不要堆；正式场合、坏消息、用户明显在难过的时候一律不要用。`;
    });
  }
  return readyPromise;
}

/* ---------------------------------------------------------------- 工具函数 */

export const clean = (s) => String(s).replace(/[\u0000-\u001F\u007F\u200B\uFEFF]/g, '').trim();
const QUALITY_RANK = { clean: 1, fancy: 2, heavy: 3 };

const poolCache = new Map();
function pool(cat, quality) {
  const key = cat.id + '|' + quality;
  let p = poolCache.get(key);
  if (p) return p;
  let filtered;
  if (quality === 'any') filtered = cat.items;
  else {
    const cap = quality === 'clean+fancy' ? 2 : QUALITY_RANK[quality] || 1;
    filtered = cat.items.filter((i) => QUALITY_RANK[i.q] <= cap);
  }
  // 只取前 60%：长尾质量明显下滑，宁缺毋滥
  const keep = Math.max(20, Math.ceil(filtered.length * 0.6));
  p = filtered.slice(0, keep);
  poolCache.set(key, p);
  return p;
}

/** 部分洗牌 + 按内容去重，允许池里同一项有多份来表达权重 */
function sample(arr, n, exclude = new Set()) {
  const avail = arr.filter((x) => !exclude.has(x.t));
  if (!avail.length) return [];
  const uniqCount = new Set(avail.map((x) => x.t)).size;
  const want = Math.min(n, uniqCount);

  const a = avail.slice();
  const picked = [];
  const got = new Set();
  for (let i = 0; i < a.length && picked.length < want; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
    if (got.has(a[i].t)) continue;
    got.add(a[i].t);
    picked.push(a[i]);
  }
  return picked;
}

/* -------------------------------------------------------------- 情绪路由 */

/**
 * 把一句自然语言情绪路由到分类。
 *
 * 打分是启发式的：精确命中 > 包含命中，情绪词 > 别名。
 * 这里踩过坑：早期版本对场景词和情绪词一视同仁，结果「下班了超开心」
 * 被判成「困倦」——因为「下班」命中了睡觉分类。情绪词必须更重。
 */
function resolveMood(mood) {
  const q = String(mood).trim().toLowerCase();
  if (!q) return [];
  if (BY_ID.has(q)) return [{ cat: BY_ID.get(q), score: 100 }];

  const hits = [];
  for (const c of CATS) {
    let score = 0;
    if (c.zh === mood) score = Math.max(score, 100);
    else if (q.includes(c.zh)) score = Math.max(score, 72);
    if (c.en === q) score = Math.max(score, 95);

    for (const e of c.emo) {
      const el = String(e).toLowerCase();
      if (el === q) score = Math.max(score, 88);
      else if (q.length >= 2 && q.includes(el) && el.length >= 2) score = Math.max(score, 68);
    }
    for (const a of c.ali) {
      const al = String(a).toLowerCase();
      if (al === q) score = Math.max(score, 85);
      else if (q.length >= 2 && q.includes(al)) score = Math.max(score, 55);
      else if (al.length >= 3 && al.includes(q)) score = Math.max(score, 55);
    }
    if (score > 0) hits.push({ cat: c, score });
  }

  hits.sort((a, b) => b.score - a.score || a.cat.id.localeCompare(b.cat.id));
  const top = hits[0]?.score || 0;
  return hits.filter((h) => h.score >= Math.max(55, top * 0.85)).slice(0, 3);
}

/* -------------------------------------------------------------- 工具实现 */

function toolListCategories() {
  const lines = [`${CATS.length} 个情绪分类 / ${DATA.total} 条颜文字`, '格式：id · 中文名 · 条数 · 示例', ''];
  for (const c of CATS) lines.push(`${c.id} · ${c.zh} · ${c.items.length} · ${clean(c.sample)}`);
  return lines.join('\n');
}

function toolPick({ mood, count = 5, quality = 'clean', category, exclude = [] }) {
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);
  const ex = new Set((exclude || []).map(String));

  let route = [];
  if (category) {
    const c = BY_ID.get(String(category).trim());
    if (!c) return { text: `没有 "${category}" 这个分类。可用：${CATS.map((x) => x.id).join(', ')}`, isError: true };
    route = [{ cat: c, score: 100 }];
  } else {
    route = resolveMood(mood);
  }

  if (!route.length) {
    const all = CATS.filter((c) => c.id !== 'weird');
    const picked = sample(all.flatMap((c) => pool(c, quality)).slice(0, 3000), n, ex);
    return {
      text:
        `没看懂 "${mood}" 想表达什么情绪，先随手给几条：\n` +
        picked.map((i) => `· ${clean(i.t)}`).join('\n') +
        `\n\n（可以用 list_categories 看全部分类，或换个更常见的情绪词）`,
      data: { matched: null, items: picked.map((i) => i.t) },
    };
  }

  // 首选分类给三倍权重，次选给一倍
  const weighted = [];
  route.forEach((r, idx) => {
    const times = idx === 0 ? 3 : 1;
    for (let k = 0; k < times; k++) weighted.push(...pool(r.cat, quality));
  });
  const picked = sample(weighted, n, ex);

  const label = route.map((r) => `${r.cat.zh}(${r.cat.id})`).join(' / ');
  return {
    text:
      `${label} ｜ 挑出 ${picked.length} 条${quality === 'any' ? '' : `（${quality} 档）`}\n` +
      picked.map((i) => `· ${clean(i.t)}${i.g ? `   [${i.g}]` : ''}`).join('\n') +
      `\n\n挑一条最贴当下语气的用，别全用上。`,
    data: { matched: route.map((r) => ({ id: r.cat.id, zh: r.cat.zh, score: r.score })), items: picked.map((i) => i.t) },
  };
}

function toolSearch({ query, count = 8, quality = 'clean' }) {
  const q = String(query || '').trim();
  if (!q) return { text: '请给个关键词', isError: true };
  const n = Math.min(Math.max(Number(count) || 8, 1), 20);

  const found = [];
  const seen = new Set();
  for (const r of resolveMood(q)) {
    for (const i of pool(r.cat, quality)) {
      if (seen.has(i.t)) continue;
      seen.add(i.t);
      found.push({ ...i, from: r.cat.zh });
    }
  }
  // 情绪路由没喂饱，再按字面/标签找一遍
  if (found.length < n) {
    for (const c of CATS) {
      for (const i of pool(c, quality)) {
        if (seen.has(i.t)) continue;
        if (i.t.includes(q) || (i.g && i.g.includes(q.toLowerCase()))) {
          seen.add(i.t);
          found.push({ ...i, from: c.zh });
          if (found.length >= n * 6) break;
        }
      }
      if (found.length >= n * 6) break;
    }
  }
  if (!found.length) return { text: `没搜到和 "${q}" 相关的颜文字，换个词试试？` };

  const picked = found.slice(0, n);
  return {
    text:
      `「${q}」相关 ${found.length}${found.length > n ? '+' : ''} 条，取前 ${picked.length}：\n` +
      picked.map((i) => `· ${clean(i.t)}   (${i.from})`).join('\n'),
    data: { query: q, items: picked.map((i) => i.t) },
  };
}

function toolDecorate({ text, count = 3, quality = 'clean' }) {
  const src = String(text || '').trim();
  if (!src) return { text: '给我一句话', isError: true };
  const n = Math.min(Math.max(Number(count) || 3, 1), 6);

  const lower = src.toLowerCase();
  const scores = new Map();
  const add = (id, v) => {
    if (BY_ID.has(id)) scores.set(id, (scores.get(id) || 0) + v);
  };

  for (const c of CATS) {
    let s = 0;
    for (const w of [...c.ali, ...c.emo, c.zh]) {
      const wl = String(w).toLowerCase();
      if (wl.length < 2) continue;
      if (lower.includes(wl)) s += wl.length >= 3 ? 3 : 2;
    }
    if (s) add(c.id, s);
  }

  // 标点和语气助词是强信号，比词表更可靠
  if (/[!！]{2,}|哈{2,}|嘿嘿|嘻嘻|太棒|耶/.test(src)) add('happy', 4);
  if (/[?？]/.test(src)) add('confused', 2);
  if (/(\.\.\.|…|。。。)/.test(src)) add('sad', 2);
  if (/[♡♥]/.test(src)) add('love', 5);
  if (/ㅠ|TT|呜呜|哭|泪/.test(src)) add('sad', 4);

  const ranked = [...scores.entries()].filter(([id]) => BY_ID.has(id)).sort((a, b) => b[1] - a[1]);
  const topScore = ranked[0]?.[1] || 0;

  // 信号不够就不硬猜——早期版本会把「加班回家一个人」配成「加油」，语义直接反了
  if (!ranked.length || topScore < 3) {
    const generic = sample(pool(BY_ID.get('greeting'), quality), n);
    return {
      text:
        `这句话没读到明确的情绪信号，就不硬猜了。\n\n几条通用款（放哪都不算出错）：\n` +
        generic.map((i) => `· ${clean(i.t)}`).join('\n') +
        `\n\n想要更贴的话，直接用 pick_kaomoji 说心情，比如「有点累」「被夸了有点飘」「想撒娇」。`,
      data: { mood: null, items: generic.map((i) => i.t) },
    };
  }

  const best = BY_ID.get(ranked[0][0]);
  const picked = sample(pool(best, quality), n);
  const tail = picked[0]?.t ? ` ${clean(picked[0].t)}` : '';
  const second = ranked[1] && BY_ID.get(ranked[1][0]);

  return {
    text:
      `判断情绪：${best.zh}（${best.id}）\n` +
      `加料示例：${src}${tail}\n\n` +
      `备选 ${picked.length} 条：\n` +
      picked.map((i) => `· ${clean(i.t)}${i.g ? `   [${i.g}]` : ''}`).join('\n') +
      (second && ranked[1][1] >= 3 ? `\n\n也像：${second.zh}（${second.id}）` : ''),
    data: { mood: { id: best.id, zh: best.zh }, decorated: src + tail, items: picked.map((i) => i.t) },
  };
}

/* ---------------------------------------------------------------- 工具注册 */

export const TOOLS = [
  {
    name: 'pick_kaomoji',
    description:
      '按情绪或场景挑选颜文字。心情、感受、场景都能描述，中英文皆可，比如「开心」「有点难过」「被夸了不好意思」「困得要死」「想撒娇」「猫」。' +
      '返回若干条候选和特征标签（heart=带爱心, crying=在哭, sparkle=闪亮, animal=小动物…）。' +
      '聊天里情绪合适时，可以主动挑一条贴到句尾——但一条就够，别堆。',
    inputSchema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: '情绪或场景的自然语言描述，如「有点累但还行」「被夸了很开心」' },
        count: { type: 'integer', description: '要几条，1-10，默认 5', minimum: 1, maximum: 10, default: 5 },
        quality: {
          type: 'string',
          enum: ['clean', 'fancy', 'clean+fancy', 'any'],
          description: 'clean=结构简单、任何客户端都不糊（默认）；fancy=更花哨但依赖字体；any=全部',
          default: 'clean',
        },
        category: { type: 'string', description: '直接指定分类 id（如 cat / sad / love）' },
        exclude: { type: 'array', items: { type: 'string' }, description: '已经用过的颜文字，传进来避免重复' },
      },
      required: ['mood'],
    },
  },
  {
    name: 'search_kaomoji',
    description: '按关键词搜颜文字。既能搜语义（「猫」「爱心」「下雨」），也能搜符号特征（「♡」「星星」）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词或符号' },
        count: { type: 'integer', description: '要几条，1-20，默认 8', minimum: 1, maximum: 20, default: 8 },
        quality: { type: 'string', enum: ['clean', 'fancy', 'clean+fancy', 'any'], default: 'clean' },
      },
      required: ['query'],
    },
  },
  {
    name: 'decorate',
    description: '把一句话丢进来，服务端自己判断情绪并配好颜文字，直接返回「原句 + 颜文字」的成品。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要配颜文字的原句' },
        count: { type: 'integer', description: '备选几条，1-6，默认 3', minimum: 1, maximum: 6, default: 3 },
        quality: { type: 'string', enum: ['clean', 'fancy', 'clean+fancy', 'any'], default: 'clean' },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_categories',
    description: '列出全部情绪分类（id + 中文名 + 条数 + 示例）。想知道这个库有什么时用。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const HANDLERS = {
  pick_kaomoji: toolPick,
  search_kaomoji: toolSearch,
  decorate: toolDecorate,
  list_categories: toolListCategories,
};

/* -------------------------------------------------------------- JSON-RPC */

function processMessage(msg) {
  // 数据没就位时不要给出「没看懂这个情绪」这种误导性结果，直接报错更诚实
  if (!DATA) throw new Error('数据尚未加载：调用 dispatch 前请先 await ready()');
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      const supported = ['2025-06-18', '2025-03-26', '2024-11-05'];
      return ok({
        protocolVersion: supported.includes(asked) ? asked : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return isNotification ? null : ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const fn = HANDLERS[params?.name];
      if (!fn) return fail(-32602, `未知工具: ${params?.name}`);
      let out;
      try {
        const raw = fn(params?.arguments || {});
        out = typeof raw === 'string' ? { text: raw } : raw;
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `工具执行出错：${e.message}` }], isError: true });
      }
      const result = { content: [{ type: 'text', text: out.text }] };
      if (out.data) result.structuredContent = out.data;
      if (out.isError) result.isError = true;
      return ok(result);
    }
    case 'prompts/list':
      return ok({ prompts: [] });
    case 'resources/list':
      return ok({ resources: [] });
    default:
      return isNotification ? null : fail(-32601, `不支持的方法: ${method}`);
  }
}

function safeProcess(m) {
  try {
    return processMessage(m);
  } catch (e) {
    return m?.id != null ? { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: e.message } } : null;
  }
}

/** 处理一条或一批 JSON-RPC 消息，返回要发回的对象（通知返回 null） */
export function dispatch(msg) {
  if (Array.isArray(msg)) {
    const out = msg.map(safeProcess).filter(Boolean);
    return out.length ? out : null;
  }
  return safeProcess(msg);
}

/* ------------------------------------------------------------------ HTTP */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-MCP-Token, Mcp-Session-Id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

/**
 * 校验调用方是否持有令牌。
 *
 * 三种带法都收，因为客户端能力差别很大：
 *   · Authorization: Bearer xxx   标准做法，Kelivo/Cursor 这类支持自定义头的用
 *   · X-MCP-Token: xxx            有些客户端只让填"密钥"字段，不给改 header 名
 *   · ?token=xxx                  手机客户端基本都只让填一个 URL，最保险的一条路
 *
 * 没设 MCP_TOKEN 就是公开实例，一律放行。
 */
export function checkToken(request, expected) {
  if (!expected) return true;
  const given = [
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim(),
    (request.headers.get('x-mcp-token') || '').trim(),
    (new URL(request.url).searchParams.get('token') || '').trim(),
  ];
  // 定时比较，避免通过响应时间逐位试出令牌
  return given.some((g) => g.length === expected.length && safeEqual(g, expected));
}

function safeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 首页：给人看的说明，省得点开一片空白 */
export function homePage(endpoint, repoUrl, needToken = false) {
  const sample = CATS.slice(0, 14)
    .map((c) => `<li><b>${c.zh}</b> <code>${c.id}</code> · ${c.items.length} 条 · ${clean(c.sample)}</li>`)
    .join('');
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><title>kaomoji-picker-mcp</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.7 -apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#222}
code{background:#f2f2f0;padding:1px 5px;border-radius:4px;font-size:13px}
li{margin:4px 0;color:#444}h1{font-size:22px;margin-bottom:4px}.ok{color:#2a9d5c;font-size:13px}
pre{background:#f7f6f3;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6}
a{color:#0b6bcb}</style>
<h1>kaomoji-picker-mcp <span class="ok">● 运行中</span></h1>
<p>${DATA.total} 条颜文字，分 ${CATS.length} 个情绪分类。给 AI 一个「按心情挑颜文字」的能力。</p>
<p>MCP 端点：<code>POST /mcp</code>（Streamable HTTP）</p>
<h3>接进客户端</h3>
<p>Claude / Cursor / Kelivo / Cherry Studio 里添加远程 MCP，填这个地址：</p>
<pre>${endpoint || '/mcp'}</pre>
${
    needToken
      ? `<p style="background:#fff8e6;border:1px solid #f0d9a0;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.7;margin:10px 0">
本实例已启用令牌校验。地址末尾加 <code>?token=你的令牌</code>，或请求头带
<code>Authorization: Bearer 你的令牌</code>。没带令牌会返回 401。</p>`
      : ''
  }
<p>工具：<code>pick_kaomoji</code> · <code>search_kaomoji</code> · <code>decorate</code> · <code>list_categories</code></p>
<h3>分类示例</h3><ul>${sample}</ul>
<p style="color:#888;font-size:12px;margin-top:32px">颜文字数据来自
<a href="https://www.kaomojiya.org">kaomoji-collection</a>（MIT 许可）${
    repoUrl ? ` · 代码 <a href="${repoUrl}">${repoUrl.replace('https://', '')}</a>` : ''
  }</p>`;
}
