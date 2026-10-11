FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY client ./client
WORKDIR /app/client
RUN npm ci && npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 5000
CMD ["node", "server/index.js"]
