FROM node:20-slim AS base
RUN npm install -g pnpm@latest

# ---- Build stage ----
FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

# ---- API server ----
FROM base AS api
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @relai/api...
EXPOSE 3001
CMD ["pnpm", "--filter", "@relai/api", "start"]

# ---- Frontend (static files served by lightweight server) ----
FROM node:20-slim AS web
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
