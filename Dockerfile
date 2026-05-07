# Pinned minor — bump deliberately when tracking node 22 LTS updates.
FROM node:22.13-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Production stage
# Pinned minor — bump deliberately when tracking node 22 LTS updates.
FROM node:22.13-alpine

RUN addgroup -g 1001 -S syncro && \
    adduser -S syncro -u 1001 -G syncro

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER syncro

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
