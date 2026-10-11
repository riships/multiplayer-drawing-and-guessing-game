# ==========================================
# Multi-stage Dockerfile for Pictionary Backend
# ==========================================

# Stage 1: Build TypeScript source code
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy TypeScript configuration and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Stage 2: Production Minimal Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV CORS_ORIGIN=*

# Install only production dependencies for minimal footprint
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Security: run application as non-root user
USER node

EXPOSE 3001

# Health check against authoritative health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
