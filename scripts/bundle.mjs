#!/usr/bin/env node
/**
 * 打包成单文件 dist/worker.js
 *
 * 为什么要这个：Cloudflare 后台的在线编辑器只能粘一个文件，不能上传目录。
 * 所以我按固定顺序把四个模块拼成一个（data.b64 → data → core → worker），
 * 去掉 import 语句和 export 前缀——它们本来就在同一个作用域里，拼起来合法。
 *
 * 这只是给「不想装 wrangler」的人准备的便利通道，正常部署还是用 wrangler。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** 去掉模块间的 import（拼接后它们共享同一个作用域） */
const stripImports = (s) => s.replace(/^import\s[^\n]*?from\s['"]\.[^'"]*['"];?\s*$/gm, '');

/** 去掉 export 前缀，但保留 worker.mjs 的 export default */
const stripExports = (s) => s.replace(/^export\s+(const|let|var|function|class|async\s+function)\s/gm, '$1 ');

const b64 = read('src/data.b64.mjs').replace(/^export default /m, 'const B64 = ');
const data = stripImports(read('src/data.mjs')).replace(/^export default /m, 'const DATA = ');
const core = stripExports(stripImports(read('src/core.mjs')));
const worker = stripImports(read('src/worker.mjs'));

const out = `/**
 * kaomoji-mcp —— 单文件版（自动生成，勿手改）
 *
 * 由 scripts/bundle.mjs 从 src/ 下的四个模块合并而来。
 *
 * 用法：Cloudflare 后台 → Workers & Pages → 创建 Worker → 编辑代码 → 全选粘贴 → 部署
 * 数据来源：kaomoji-collection（MIT 许可）https://www.kaomojiya.org
 */

/* ====================== 内联数据（gzip + base64） ====================== */
${b64}

/* ============================ 解压加载 ============================ */
${data}

/* ======================= 核心：工具与协议 ======================= */
${core}

/* =========================== Worker 入口 =========================== */
${worker}`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const outPath = path.join(ROOT, 'dist/worker.js');
fs.writeFileSync(outPath, out, 'utf8');

// 拼错了要立刻知道，而不是等部署完在线上才发现
try {
  execFileSync(process.execPath, ['--check', outPath], { stdio: 'pipe' });
} catch (e) {
  console.error('❌ 生成的单文件语法有误：');
  console.error(e.stderr?.toString() || e.message);
  process.exit(1);
}

console.log(`✅ dist/worker.js  ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB，语法通过`);
