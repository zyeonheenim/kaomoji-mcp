# 部署与上架

代码写好了，剩下三件事：推上去、绑域名、上 Registry。前两件是必须的，第三件是「被搜到」的关键。

## 一、部署

### 方式 A：粘贴（不用装任何东西）

```bash
npm run build        # 生成 dist/worker.js
```

1. Cloudflare 后台 → **Workers & Pages** → **Create** → **Worker**
2. 名字填 `kaomoji-mcp`
3. **Edit code**，把编辑器里的示例代码全选删掉
4. 打开 `dist/worker.js`（约 393 KB），全选复制，粘进去
5. 右上角 **Deploy**

> 这个文件是自包含的：数据 gzip+base64 内联在代码里，不需要额外上传什么。

### 方式 B：wrangler（命令行，适合反复改）

```bash
npm install -g wrangler
wrangler login            # 浏览器授权一次
npm run build
wrangler deploy
```

`wrangler.toml` 里已经配好自定义域，部署时自动绑上。

## 二、绑域名

workers.dev 那个域名在部分网络下连不上，所以要用自己的：

1. Workers 项目 → **Settings** → **Domains & Routes** → **Add** → **Custom domain**
2. 填 `kaomoji.zyeonheenim.stream`
3. 前提：`zyeonheenim.stream` 这个 zone 在同一个 Cloudflare 账号下（已经在，之前配过 gemini-relay）

端点就是 `https://kaomoji.zyeonheenim.stream/mcp`。

## 三、验证

```bash
curl -s https://kaomoji.zyeonheenim.stream/health

curl -s -X POST https://kaomoji.zyeonheenim.stream/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"pick_kaomoji","arguments":{"mood":"开心","count":3}}}'
```

## 四、上架 MCP Registry

Registry 只存元数据、不存代码，免费、无审核。发布后 Glama、PulseMCP、VS Code 的 `@mcp` 市场会自动同步。

**开源带来的最大简化**：命名空间可以用 GitHub 认证（`io.github.zyeonheenim/kaomoji`），不用再折腾 DNS TXT 记录。这是不开源时走不了的路。

### 前置：npm 包必须先发布

Registry 会去 npm 拉你做引用的包、读 `package.json` 里的 `mcpName` 字段，两者必须完全等于 `server.json` 的 `name`。所以顺序是：

```bash
npm publish --access public     # 需要先 npm login
```

包名 `kaomoji-mcp-server`。`package.json` 里的 `mcpName` 已经是 `io.github.zyeonheenim/kaomoji`，`server.json` 里的 `name` 也是，两边别改不一致。

> 想先上 Registry 但暂时不发 npm：把 `server.json` 里的 `packages` 整段删掉，只留 `remotes`。远程服务器不需要包，一样能上架。

### 发布

```bash
brew install mcp-publisher

cd ~/kaomoji-mcp-public
mcp-publisher init        # 读 package.json + server.json 做校验
mcp-publisher login github   # device flow，浏览器确认
mcp-publisher publish
```

确认已上架：

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=kaomoji"
```

### 三条硬规矩

- **`version` 发出去就锁死**，不可改不可删，升级只能递增
- **描述限 100 字符**（`server.json` 里那句 88 字符，别加长）
- **Registry 还在 preview**，接口可能变

## 五、运营上要知道的

| 事项 | 现状 |
|---|---|
| 免费额度 | Workers 免费版每天 10 万次请求。闲聊一天用不了几次，几千人没问题，被脚本刷就会超 |
| 限流 | **目前没有**。要防刷：开 Workers Paid（$5/月）用内置 Rate Limiting，或设 `MCP_TOKEN` 只给小范围用 |
| SSE 长连接 | Worker 无状态，只做 Streamable HTTP。主流客户端都支持；老客户端走本机 stdio 版 |
| 数据更新 | 改 `scripts/build-data.mjs` → `npm run build` → 重新部署 |

## 六、目录结构

```
src/core.mjs          数据派生、情绪路由、四个工具、JSON-RPC（平台无关）
src/data.mjs          解压加载内联数据
src/worker.mjs        Cloudflare Worker 入口
src/index.mjs         Node 入口（stdio + HTTP）
src/data.b64.mjs      压缩数据，构建产物，入库保证 clone 即跑
scripts/build-data.mjs  vendor/ → 情绪索引
scripts/bundle.mjs      合成单文件
test/test.mjs           25 项测试，覆盖三条入口
wrangler.toml           部署配置
server.json             MCP Registry 清单
```

## 七、和本地私有版的区别

`~/kaomoji-mcp/` 那份用的是韩式可爱风数据（snskeyboard 来源），条款禁止再分发，只自己用。

这份公开版换成了 MIT 许可的 kaomoji-collection（经典日式风：`(๑>ᴗ<๑)ﾃﾍｯ♡`、`ฅ^•ﻌ•^ฅ`），可以放心对外提供。两份互不干扰。
