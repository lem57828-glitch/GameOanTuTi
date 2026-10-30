# Bản demo Bot Arena trên Fly.io: một image chạy Redis (hàng đợi) + API (phục vụ cả web đã build) + worker.
# Bot Python chạy bằng user "bot" không quyền (deploy/fly/sandbox-python.sh) vì máy Fly không có Docker.
# Build: fly deploy (Fly build từ xa, không cần Docker trên máy). Thử local: docker build -t bot-arena .

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
COPY . .
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @arena/api db:generate \
  && pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
# redis-server chạy ngay trong máy: chỉ giữ hàng đợi tạm (trạng thái thật ở PostgreSQL, ván dở tự khôi phục).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 util-linux redis-server \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin bot
COPY --from=build /app /app
RUN chmod 755 /app/deploy/fly/sandbox-python.sh
# Mặc định của bản demo: tạo service chỉ cần đặt DATABASE_URL, WEB_ORIGIN, SESSION_SECRET. fly.toml / render.yaml /
# biến môi trường trên dashboard ghi đè được. Demo không chạy NODE_ENV=production (máy chủ từ chối DEMO_MODE).
ENV NODE_ENV=development \
  DEMO_MODE=true \
  SERVE_WEB=true \
  TRUST_PROXY=1 \
  REDIS_URL=redis://127.0.0.1:6379/0 \
  QUEUE_PREFIX=arena-demo \
  SESSION_COOKIE_NAME=arena_demo_session \
  MAIL_TRANSPORT=local \
  BOT_SANDBOX_MODE=trusted-local \
  PYTHON_CMD=/app/deploy/fly/sandbox-python.sh \
  WORKER_CONCURRENCY=1
EXPOSE 8080
CMD ["node", "/app/deploy/fly/start.mjs"]
