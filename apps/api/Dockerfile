FROM node:20-bookworm-slim

WORKDIR /workspace

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
COPY nx.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools

RUN npm ci
RUN npx nx run api:build:production

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
