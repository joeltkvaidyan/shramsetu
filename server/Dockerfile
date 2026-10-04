# ShramSetu Node.js API server — production container.
#
# Build context is ./server (see docker-compose.yml):
#   docker build -t shramsetu-server ./server
#
# This container is a pure JSON API (/api/v1/*, /health). The SPA is built
# and served by the frontend/nginx container, which proxies /api back here —
# nothing static is served from this container.

FROM node:20-alpine AS build

WORKDIR /app

# Reproducible install straight from the lockfile. --omit=dev: the image runs
# no tests, and devDeps pull in mongodb-memory-server (downloads a mongod
# binary during install).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (.dockerignore excludes node_modules/, .env, logs, uploads, tests).
COPY . .

FROM node:20-alpine AS runtime

WORKDIR /app

COPY --from=build /app .

RUN chown -R node:node /app

USER node

EXPOSE 8000

# Queries GET /health; exits non-zero until the API answers ok.
HEALTHCHECK --interval=20s --timeout=10s --retries=15 --start-period=120s \
  CMD ["node", "scripts/healthcheck.js"]

CMD ["node", "src/index.js"]
