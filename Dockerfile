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
ENV NODE_ENV=development
EXPOSE 8080
CMD ["node", "/app/deploy/fly/start.mjs"]
