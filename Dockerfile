# ----------
# Multi‑stage Dockerfile for Beyond90
# ----------
# 1️⃣ Build stage – install deps, generate Prisma client, build the Vite client
# 2️⃣ Runtime stage – copy only production files, expose ports, run server + bot
# ----------

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package manifests first (allows layer caching)
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY bot/package.json ./bot/

# Install all workspace dependencies (including dev deps needed for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Generate Prisma client and run migrations (dev DB will be created)
RUN npx prisma generate --schema=./server/prisma/schema.prisma
# For production you would run migrate deploy, but for the image we just generate client

# Build the React client (Vite) for production
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy only the needed files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built client assets
COPY --from=builder /app/client/dist ./client/dist

# Copy server compiled code (TS -> JS) – we need to transpile in runtime? Use ts-node-dev for dev, but for prod we can run compiled JS.
# We'll copy the source and let the prod script use ts-node (installed) – alternatively compile now.
COPY --from=builder /app/server ./server
COPY --from=builder /app/bot ./bot

# Expose ports: 3000 (client static server) and 4000 (API)
EXPOSE 3000 4000

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=4000
ENV REACT_APP_API_URL=http://localhost:4000

# Start the server and bot using the prod script defined in root package.json
CMD ["npm", "run", "prod"]
