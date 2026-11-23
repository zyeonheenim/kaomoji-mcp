# kaomoji-mcp

**给 AI 一个「按心情挑颜文字」的能力。22,408 条颜文字，38 个情绪分类，零依赖。**

An MCP server that picks kaomoji by mood — 22,408 emoticons across 38 emotion categories, zero dependencies.

[![CI](https://github.com/zyeonheenim/kaomoji-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/zyeonheenim/kaomoji-mcp/actions/workflows/ci.yml)

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

## 三种接法

### ① 远程，零安装

支持远程 MCP（Streamable HTTP）的客户端，直接填这个地址：

```
https://kaomoji.zyeonheenim.stream/mcp
```

Claude 网页版/手机版的自定义连接器、Kelivo、Cursor 都吃这一套。

### ② 本机 stdio

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

### ③ 源码跑

```bash
git clone https://github.com/zyeonheenim/kaomoji-mcp.git
cd kaomoji-mcp
node src/index.mjs                 # stdio
node src/index.mjs --http          # HTTP，默认 0.0.0.0:8790
node src/index.mjs --http --port 9000 --host 127.0.0.1
```

HTTP 模式同时支持两种传输：`POST /mcp`（Streamable HTTP）和 `GET /sse`（老式 SSE）。手机、平板跟电脑不在同一网络时，可以走 [Tailscale](https://tailscale.com) 的 100.x 地址。

设了 `MCP_TOKEN` 环境变量就会校验凭证（`Authorization: Bearer <token>` 或 `?token=`）。

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

## 自建部署

### Cloudflare Worker（免费额度每天 10 万请求）

```bash
npm install -g wrangler
wrangler deploy
```

`wrangler.toml` 里改 `name` 和 `routes` 成你自己的域名。日常没有依赖，Worker 体积约 390 KB（未过 1 MB 的免费上限）。

### 或者不装任何工具

```bash
npm run build
```

生成 `dist/worker.js`——一个自包含的单文件（数据 gzip + base64 内联）。打开 Cloudflare 后台 → Workers & Pages → 创建 Worker → 编辑代码 → 全选粘贴 → 部署。

## 开发

```bash
npm run build   # vendor/kaomoji.json → src/data.b64.mjs（+ dist/worker.js）
npm test        # 25 项，覆盖核心/Worker/stdio 三条入口
```

`src/` 分层：

| 文件 | 职责 |
|---|---|
| `core.mjs` | 数据派生、情绪路由、四个工具、JSON-RPC 分发。平台无关 |
| `data.mjs` | 解压加载内联数据 |
| `worker.mjs` | Cloudflare Worker 入口（fetch handler） |
| `index.mjs` | Node 入口（stdio + HTTP） |

`src/data.b64.mjs` 是构建产物但**入库**了：这样 clone 下来不用 build 就能跑。CI 会验证它和 `vendor/` 一致，手改会被拦。

## 许可

代码 MIT。颜文字数据来自 [kaomoji-collection](https://www.kaomojiya.org)（MIT，41,596 条 / 535 个分类），经 `scripts/build-data.mjs` 映射为 38 个中文情绪分类。原始快照在 `vendor/`，完整处理步骤公开，可复现。

第三方署名的完整说明见 [NOTICE](NOTICE)。
