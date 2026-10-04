# ShramSetu frontend — Vite build served by nginx.
#
# Build context is ./frontend (see docker-compose.yml).

FROM node:20-alpine AS build
WORKDIR /app

# Reproducible install straight from the lockfile (.dockerignore excludes the
# local node_modules/, dist/ and other artefacts from the build context).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
