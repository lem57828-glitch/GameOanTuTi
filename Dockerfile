FROM node:24-bookworm-slim
# Python cho worker chạy bot (TV2). Sandbox riêng cho mã bot vẫn phải có, Docker của web không thay thế được (đặc tả 4.2).
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY worker ./worker
COPY web ./web
COPY scripts ./scripts
ENV NODE_ENV=production DATA_DIR=/data PYTHON_BIN=python3
EXPOSE 3000
CMD ["node", "server/index.js"]
