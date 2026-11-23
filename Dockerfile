# 零依赖：不需要 npm install，镜像里只有 Node 运行时加几十 KB 源码
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

# 容器里必须监听所有网卡，否则外面连不进来
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

# --http 起 Streamable HTTP + 老式 SSE，两种客户端都能连
CMD ["node", "src/index.mjs", "--http"]
