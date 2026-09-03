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
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/apps/backend
EXPOSE 3000
CMD [ "pnpm", "start" ]
