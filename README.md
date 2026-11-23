# kaomoji-mcp

**给 AI 一个「按心情挑颜文字」的能力。22,408 条颜文字，38 个情绪分类，零依赖。**

An MCP server that picks kaomoji by mood — 22,408 emoticons across 38 emotion categories, zero dependencies.

[![CI](https://github.com/zyeonheenim/kaomoji-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/zyeonheenim/kaomoji-mcp/actions/workflows/ci.yml)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/zyeonheenim/kaomoji-mcp)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/zyeonheenim/kaomoji-mcp)

> **没有官方公共实例。** 这个项目只提供代码，不替所有人付服务器账单。
> 手机端的远程 MCP 需要你自己部署一个——点上面任意一个按钮，两分钟，用你自己的免费额度，不用买域名。

---

## 它解决什么问题

AI 本来就会读情绪，缺的只是一个仓库——能听懂「被夸了有点不好意思」是什么意思，然后从两万条里捞出三条真正贴的。

把整个库塞进上下文是不现实的。所以这里的做法反过来：**AI 说心情，服务端秒回 3-5 条候选**，AI 挑一条贴到句尾。

## 效果

```
「开心」          → 开心(happy)
                    (っ ᵔ◡ᵔ)っ    ´ ᯅ ` ✩♡     (^m^)ｸｽｯ♪

「被夸了有点不好意思」 → 害羞(shy)
                    テヘ(//ω照♥    ☆～(´>ω∂｀)ﾃﾍﾍﾟﾛ    (´>ω∂`)

「困得要死」        → 困(sleepy)
                    Zz(´-ω-`*)    ( ᵕᴗᵕ )*･☪︎ おやすみ    (●ＵωU)

「我要生气了」       → 生气(angry)
                    ヾ(°∇°*)ゞｶﾞｵｰ!    (－ε－)むぅ    (｀･ω･´)

「猫」             → 猫(cat)
                    (=^・ω・^=)    ฅ^._.^ฅ    (^≗ω≗^)
```

`decorate` 更省事，丢一整句进去：

```
decorate("今天被夸了有点飘嘿嘿")
→ 判断情绪：开心（happy）
   加料示例：今天被夸了有点飘嘿嘿 ꉂꉂ(⁰▿⁰)ｱﾊﾊ
   也像：害羞（shy）
```

## 怎么用

| 你的情况 | 走哪条 | 部署成本 |
|---|---|---|
| 桌面客户端（Claude Desktop / Cherry / Cursor） | **① npx**，进程跑在你本机 | 零部署 |
| 手机 / 平板客户端（Kelivo / RikkaHub） | **② 自己一键部署**，拿到一个 HTTPS 地址 | 点一下按钮 |
| 有服务器 / 喜欢掌控 | **③ Docker 或源码** | 你自己的机器 |

### ① 本机 stdio —— 桌面端最省事

```bash
npx -y kaomoji-mcp-server
```

Claude Desktop 的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "kaomoji": {
      "command": "npx",
      "args": ["-y", "kaomoji-mcp-server"]
    }
  }
}
```

Claude Code 一条命令：

```bash
claude mcp add kaomoji -- npx -y kaomoji-mcp-server
```

这条路不需要任何服务器、任何账号。缺点只有一个：手机客户端启动不了你电脑上的进程，那边得用远程方式。

### ② 远程 —— 部署一个自己的实例

手机上（Kelivo、RikkaHub、Cherry Studio Mobile）只能连远程地址。点顶部的 **Deploy with Vercel** 或 **Deploy to Render**，用你自己的账号：

```
Vercel 部署完 → https://<你的项目>.vercel.app/mcp
Render 部署完 → https://<你的服务>.onrender.com/mcp
```

然后在客户端里「添加远程 MCP 服务器」：

| 字段 | 填什么 |
|---|---|
| 类型 / 传输 | **Streamable HTTP**（不要选 STDIO） |
| 地址 / URL | 上面那个 `/mcp` 结尾的地址 |
| 认证 | 留空。想只给自己用就设 `MCP_TOKEN`，再填 `Authorization: Bearer <那个串>` |

**不用买域名。** 平台给的免费子域够用，想绑自己的域名是后话。

> Render 免费版 15 分钟没请求会休眠，下次唤醒几秒冷启动。Vercel 的 Edge 函数不会睡，但 Hobby 条款限「个人非商业」用途。两边都免费，按在意什么挑。

### ③ 自己的机器 —— Docker 或源码

```bash
docker build -t kaomoji-mcp .
docker run -p 8080:8080 kaomoji-mcp
# → http://127.0.0.1:8080/mcp
```

或者不装 Docker：

```bash
git clone https://github.com/zyeonheenim/kaomoji-mcp.git
cd kaomoji-mcp
node src/index.mjs                 # stdio
node src/index.mjs --http          # HTTP，默认 0.0.0.0:8790
node src/index.mjs --http --port 9000 --host 127.0.0.1
```

HTTP 模式同时支持两种传输：`POST /mcp`（Streamable HTTP）和 `GET /sse`（老式 SSE）。手机跟电脑不在同一网络时，可以走 [Tailscale](https://tailscale.com) 的 100.x 地址，不用暴露到公网。

设了 `MCP_TOKEN` 环境变量就会校验凭证（`Authorization: Bearer <token>` 或 `?token=`）。

其他平台也行：Railway / Zeabur / Fly.io 直接识别 `Dockerfile`；Cloudflare Workers 用 `wrangler deploy`（仓库里有 `wrangler.toml`），或者把 `dist/worker.js` 单文件粘进后台。

## 四个工具

| 工具 | 干什么 |
|---|---|
| `pick_kaomoji` | 核心。描述心情/场景，取候选。支持指定分类、要几条、避重 |
| `decorate` | 丢一整句话进去，服务端判情绪 + 配好成品 |
| `search_kaomoji` | 按关键词或符号搜（「猫」「♡」「星星」） |
| `list_categories` | 列出 38 个分类的家底 |

```
pick_kaomoji(mood: "被夸了不好意思", count: 3)
pick_kaomoji(mood: "", category: "cat", quality: "any")
pick_kaomoji(mood: "开心", exclude: ["(^m^)ｸｽｯ♪"])   // 避开上一轮用过的
decorate(text: "终于考完啦！！")
search_kaomoji(query: "♡")
```

## 为什么挑出来的不会糊

两万多条里混着大量依赖特殊字体的条目——埃及圣书体、生僻组合符，发到微信里会显示成一排方框。所以每条都打了质量分：

| 档位 | 判定 | 条数 |
|---|---|---|
| `clean` | 结构简单、任何客户端都不糊（默认） | 14,186 |
| `fancy` | 更花哨，依赖字体 | 3,674 |
| `heavy` | 长或组合符多，容易糊 | 4,548 |

默认只给 `clean`。想要好看的用 `fancy` 或 `clean+fancy`，`any` 全给。另外每个分类只从质量前 60% 里抽——长尾真的很难看。

## 一个踩过的坑

情绪词和场景词一开始权重一样，结果「下班了超开心」被判成「困倦」——因为「下班」也命中了睡觉分类。现在情绪词的权重压在场景词之上，「累死了但还要笑」会同时给「开心」和「困」两个方向。

`decorate` 信号不足时不会硬猜：早期版本把「加班回家一个人」配成了「加油」，语义直接反了。现在会明说没读到情绪，给几条通用款，让你改用 `pick_kaomoji`。

## 各平台跑法对照

同一个 `core.mjs`，四种外壳。想换平台不用改逻辑，只换入口那几十行。

| 平台 | 入口 | 传输能力 | 备注 |
|---|---|---|---|
| Vercel | `api/mcp.mjs`（Edge Runtime） | Streamable HTTP | 无状态，`/mcp` 由 `vercel.json` 重写到 `/api/mcp`；Hobby 条款限个人非商业 |
| Render / Railway / Zeabur / VPS | `Dockerfile` | HTTP + 老式 SSE | 真进程，长连接可用；Render 免费版会休眠 |
| Cloudflare Workers | `src/worker.mjs` | Streamable HTTP | 免费额度每天 10 万请求；仓库带 `wrangler.toml` |
| 本机 | `src/index.mjs` | stdio / HTTP / SSE | 三种全支持 |

Cloudflare 想省掉装 wrangler 的话：`npm run build` 会生成 `dist/worker.js`——自包含单文件，粘进后台就能跑。

> 想加访问控制就在环境变量里设 `MCP_TOKEN`。三个入口都认，不设就是谁都能连。

## 开发

```bash
npm run build   # vendor/kaomoji.json → src/data.b64.mjs（+ dist/worker.js）
npm run check   # 验证提交的内联数据能由 vendor/ 完全重建
npm test        # 28 项，覆盖核心 / Worker / Edge / stdio 四条入口
```

`src/` 分层：

| 文件 | 职责 |
|---|---|
| `core.mjs` | 数据派生、情绪路由、四个工具、JSON-RPC 分发。**平台无关**，只用 Web 标准 API |
| `data.mjs` | 解压加载内联数据（`DecompressionStream`，Node 和边缘运行时通吃） |
| `worker.mjs` | fetch handler 外壳：CF Worker、Vercel Edge 都走这里 |
| `index.mjs` | Node 外壳：stdio + HTTP（含老式 SSE） |
| `api/mcp.mjs` | Vercel Edge 适配层，就十几行 |

平台无关那层是关键：`core.mjs` 里没有一行 `node:` 导入，所以同一个文件能在 Worker、Vercel Edge、Deno、Node 上直接跑。这也是为什么加一个平台只需要写个十几行的外壳。

`src/data.b64.mjs` 是构建产物但**入库**了：这样 clone 下来不用 build 就能跑。CI 会验证它和 `vendor/` 一致，手改会被拦。

## 许可

代码 MIT。颜文字数据来自 [kaomoji-collection](https://www.kaomojiya.org)（MIT，41,596 条 / 535 个分类），经 `scripts/build-data.mjs` 映射为 38 个中文情绪分类。原始快照在 `vendor/`，完整处理步骤公开，可复现。

第三方署名的完整说明见 [NOTICE](NOTICE)。
