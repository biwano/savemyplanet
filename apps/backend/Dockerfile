FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter backend build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/apps/backend
# Cloud Run sets PORT (default 8080); index.ts reads process.env.PORT.
EXPOSE 8080
# Bypass pnpm/corepack so cold starts do not hit the registry.
CMD [ "node", "dist/index.js" ]
