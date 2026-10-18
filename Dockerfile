# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN bunx prisma generate
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["bun", "run", "dist/main.js"]
