# syntax=docker/dockerfile:1

# ---- Stage 1: build the static SPA bundle ----
# Bun as installer + task runner; vite does the actual bundling (never `bun build`).
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- Stage 2: serve the static build with nginx ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
