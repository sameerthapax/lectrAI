FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# better-sqlite3 needs either a prebuilt native binary or a local node-gyp fallback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy the pruned Nx deploy artifact for the API app.
COPY apps/api/dist ./

RUN npm ci --omit=dev --no-audit --no-fund

EXPOSE 8080

CMD ["node", "main.js"]
