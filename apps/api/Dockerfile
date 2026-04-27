FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Copy the pruned Nx deploy artifact for the API app.
COPY apps/api/dist ./

RUN npm ci --omit=dev

EXPOSE 8080

CMD ["node", "main.js"]
