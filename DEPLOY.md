# 部署指南

手机 / 平板上的 MCP 客户端（Kelivo、RikkaHub、Cherry Studio Mobile）只能连远程地址，
所以那边需要一个部署好的实例。桌面客户端不用看这里，直接 `npx -y github:zyeonheenim/kaomoji-mcp` 就完事。

**先选路：**

| 你有 | 走这条 | 花多久 |
|---|---|---|
| 什么都没有，就想两分钟内用上 | [Vercel](#vercel最快) | 2 分钟 |
| 想要个不会睡着的 | [Render](#render) | 5 分钟 |
| 有台常开的电脑 / NAS / 服务器 | [Docker](#docker--任何有-docker-的机器) | 3 分钟 |
| 只想自己的设备能连，不想暴露到公网 | [Tailscale](#tailscale只给自己用) | 1 分钟 |
| 已经在用 Cloudflare | [Workers](#cloudflare-workers) | 3 分钟 |

---

## 先说清楚：成本落在谁身上

这个项目**不提供官方公共实例**。作者不替所有人的请求付账单，所以：

- 你部署，跑在**你的**账号、**你的**免费额度上
- 免费额度用完，是你那边被限流，不是作者的
- 被脚本刷了，也是你那边爆——所以[建议设个 token](#加个门只给自己用)

这不是抠门，是开源项目能长期活下去的常见做法：代码共享，运行成本各自承担。

---

## Vercel（最快）

### 步骤

1. 点 README 顶部的 **Deploy with Vercel**，或者直接打开：
   ```
   https://vercel.com/new/clone?repository-url=https://github.com/zyeonheenim/kaomoji-mcp
   ```
2. 用 GitHub 账号登录，Vercel 会把这个仓库复制一份到你名下
3. 项目名随便起，Framework Preset 保持默认，直接 **Deploy**
4. 一分钟左右完成，得到一个 `https://<项目名>.vercel.app`

### 地址

```
https://<项目名>.vercel.app/mcp
```

`vercel.json` 已经把 `/mcp` 重写到 `/api/mcp`，两个地址都能用。浏览器打开根路径能看到状态页，
上面显示的是你自己的域名——不是作者的。

### 验证部署成功

```bash
curl -s -X POST https://<项目名>.vercel.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pick_kaomoji","arguments":{"mood":"开心","count":3}}}' \
  | head -c 300
```

看到一堆颜文字就成了。

### 要注意

- **Hobby 条款限「个人非商业用途」。** 自己用、给朋友用没问题；要是拿它做收费产品的一部分，条款上得升 Pro。
- **老式 SSE 用不了**（`GET /sse` 那种挂一条连接等推送的）。Vercel 的函数是无状态的，连接留不住。Streamable HTTP 够用，现在主流客户端都吃这套。
- `vercel.app` 在大陆网络下时好时坏。真要稳定就绑自己的域名，在 Vercel 那边加就行，不用动别处。

---

## Render

1. 点 README 里的 **Deploy to Render**，或打开：
   ```
   https://render.com/deploy?repo=https://github.com/zyeonheenim/kaomoji-mcp
   ```
2. 登录 Render，它会读仓库里的 `render.yaml` 自动建服务
3. 等 Docker 构建完（第一次两三分钟），得到 `https://<服务名>.onrender.com`
4. 地址是 `https://<服务名>.onrender.com/mcp`

### 要注意

- **免费版 15 分钟没请求会休眠**，下次唤醒有几秒冷启动。第一次调用慢一下是正常的，不是坏了。
- 真进程，所以 `GET /sse` 老式传输也能用。

---

## Docker / 任何有 Docker 的机器

```bash
git clone https://github.com/zyeonheenim/kaomoji-mcp.git
cd kaomoji-mcp
docker build -t kaomoji-mcp .
docker run -d -p 8080:8080 --name kaomoji kaomoji-mcp
```

地址：`http://<机器地址>:8080/mcp`

镜像很小——零依赖，不需要 `npm install`，里面只有 Node 运行时和几十 KB 源码。

Railway / Zeabur / Fly.io / 群晖 / 树莓派都一样：识别到 `Dockerfile` 就能跑。

想加个 token：

```bash
docker run -d -p 8080:8080 -e MCP_TOKEN=你的随机串 kaomoji-mcp
```

---

## Tailscale（只给自己用）

不想暴露到公网、但手机和电脑不在同一个 WiFi 时，这条路最省事，而且不需要任何云服务。

在跑服务的机器上：

```bash
node src/index.mjs --http --port 8790
tailscale ip -4        # 记下这个 100.x 地址
```

手机上也装 Tailscale 并登录同一个账号，客户端里填：

```
http://100.x.x.x:8790/mcp
```

不用域名、不用备案、不用开端口。缺点就是服务那台机器得开着。

如果想让**不在你 tailnet 里的人**也能临时连，可以用 `tailscale funnel 8790` 拿到一个
`https://<你的机器>.<tailnet>.ts.net` 的公网地址。注意 Funnel 是 beta、带宽上限不公开，
适合临时分享，不适合当长期公共服务。

---

## Cloudflare Workers

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

`wrangler.toml` 里的 `name` 和 `routes` 改成你自己的，否则会跟别人的部署撞名。

不想装 wrangler：

```bash
npm run build     # 生成 dist/worker.js，自包含单文件
```

然后 Cloudflare 后台 → Workers & Pages → 创建 → 编辑代码 → 全选粘贴 → 部署。

免费额度每天 10 万请求。Worker 体积约 390 KB，在 1 MB 免费上限内。

---

## 加个门（只给自己用）

开放式部署谁都连得上，被脚本刷了额度就爆——而且地址本身是猜得到的（`项目名.vercel.app`）。设个令牌挡住：

| 平台 | 怎么设 |
|---|---|
| Vercel | Settings → Environment Variables → 加 `MCP_TOKEN=随机长串` → **必须 Redeploy 一次**（环境变量只在构建时注入，不重新部署不生效） |
| Render | Dashboard → Environment → 加 `MCP_TOKEN`，服务会自动重启 |
| Docker | `-e MCP_TOKEN=随机长串` |
| Cloudflare | `wrangler secret put MCP_TOKEN` |

然后客户端用下面**任意一种**方式带令牌（三种服务端都认）：

| 带法 | 写法 | 什么时候用 |
|---|---|---|
| 拼在地址里 | `https://xxx.vercel.app/mcp?token=你的串` | **手机客户端首选**——Kelivo、Rikki 这类基本只让填一个 URL |
| 标准头 | `Authorization: Bearer 你的串` | 支持自定义请求头的桌面客户端 |
| 短头 | `X-MCP-Token: 你的串` | 有些客户端只给一个"密钥"输入框，却不让改 header 名 |

设好之后：

- 不带令牌，`/mcp`、`/health`、首页全部返回 **401**
- 带令牌打开首页，页面会直接告诉你「本实例已启用令牌校验」
- 预检请求（`OPTIONS`）不校验，否则浏览器端全废
- 令牌在 `?token=` 里会落到访问日志，自己用无所谓；要更干净就用 `Authorization` 头

生成一个随机串：

```bash
openssl rand -hex 16
```

> 令牌别写进仓库、别贴进 README。写成占位符 `<你的令牌>` 就行。

---

## 排错

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 404 | 地址少了 `/mcp` | Vercel 是 `/mcp` 或 `/api/mcp`，Render 是 `/mcp` |
| 401 | 设了 `MCP_TOKEN` 但没带凭证，或 Vercel 加了变量却没 Redeploy | 地址后加 `?token=<串>`，或 `Authorization: Bearer <串>` |
| 加了 `MCP_TOKEN` 还是谁都能连 | Vercel 环境变量只在构建时注入，改完必须 Redeploy | Deployments → 最新 → Redeploy（取消勾选 Use existing build cache） |
| 客户端说传输不支持 | 类型选成了 STDIO | 远程一律选 **Streamable HTTP** |
| 第一次调用很慢 | Render 免费版休眠唤醒 | 正常，之后就快了 |
| Vercel 部署报体积超限 | 极少见（本服务约 400 KB） | 改用 Render 或 Docker |
| 构建失败：`Top-level await is currently not supported with the "cjs" output format` | 早期提交的代码在 `data.mjs` 里用了顶层 await，而 Vercel 会把函数打成 CJS | 拉最新代码重新部署——数据已改成惰性加载（`ready()`） |
| 手机连不上但电脑能 | 两端不在同一网络 / DNS 污染 | 用 Tailscale，或换个域名 |

部署完先跑一次上面的 `curl`，通了再去折腾客户端——不然分不清是服务挂了还是客户端配错了。
