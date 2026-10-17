FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY sample-bots ./sample-bots
COPY scripts ./scripts
ENV NODE_ENV=production DATA_DIR=/data PYTHON_BIN=python3
EXPOSE 3000
CMD ["node", "scripts/start.js"]
