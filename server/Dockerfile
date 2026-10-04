# ShramSetu Node.js API server — production container.
#
# Build: docker build -t shramsetu-server ./server
# Run:     docker run -d --name shramsetu-server --env-file .env -p 8000:8000 shramsetu-server
#
# The server serves the pre-built Vite SPA from /app/dist on GET / and
# proxies /api and /api/* to ai-service on the docker network. The frontend
# dev server (vite) is not needed in production.

FROM node:20-alpine AS build

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install --frozen-lockfile

# Copy server source + the pre-built client.
COPY server/ .
COPY frontend/dist ./dist

RUN npm run build 2>/dev/null || true

FROM node:20-alpine AS runtime

WORKDIR /app

# Production system deps.
RUN apk add --no-cache tmux ffmpeg libgomp1

COPY --from=build /app .
COPY server/scripts/healthcheck.js ./scripts/healthcheck.js

RUN chown -R node:node /app && chmod -R 755 /app

USER node

EXPOSE 8000

# Healthcheck runs the node script, which queries /health and redis if needed.
HEALTHCHECK --interval=20s --timeout=10s --retries=15 --start-period=120s \
  CMD ["node", "scripts/healthcheck.js"]

CMD ["node", "src/index.js"]
