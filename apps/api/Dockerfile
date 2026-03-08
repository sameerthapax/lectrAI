FROM node:20-bookworm-slim

WORKDIR /workspace

ENV HOST=0.0.0.0


COPY package.json package-lock.json ./
COPY nx.json tsconfig.base.json tsconfig.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY tools ./tools

RUN npm ci
RUN npx nx sync
RUN npx nx run api:build:production

ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
