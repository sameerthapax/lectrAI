FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Only copy built output + minimal deps
COPY dist/apps/api ./dist
COPY package.json package-lock.json ./

# Install ONLY production deps
RUN npm ci --omit=dev

EXPOSE 8080

CMD ["node", "dist/main.js"]