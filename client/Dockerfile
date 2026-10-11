# ==========================================
# Multi-stage Dockerfile for Pictionary Frontend
# ==========================================

# Stage 1: Build React + Vite SPA
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy client source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Production High-Performance Alpine Nginx
FROM nginx:1.27-alpine AS web

# Remove default static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built SPA from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with reverse proxy for Socket.IO
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check verifies Nginx is actively serving index.html
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
