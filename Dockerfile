# fxbot's image: the server and the built page, on Node 22 and Debian 13, for amd64 and arm64. The release workflow
# publishes it, and deploy/compose.yaml runs it beside its database.

# The page is built on the build machine's own CPU. npm then installs the server's packages for the image's CPU:
# libfx's addon is the only native one, so only the last stage's apt-get runs under emulation.
FROM --platform=$BUILDPLATFORM docker.io/library/node:22-trixie-slim AS build
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
COPY packages/website/package.json packages/website/
RUN npm ci --no-audit --no-fund --loglevel=error
COPY packages/sdk packages/sdk
COPY packages/server packages/server
COPY packages/ui packages/ui
RUN npm run build --silent
RUN rm -rf node_modules && npm ci --omit=dev -w @fxbot/server --no-audit --no-fund --loglevel=error \
      --os=linux --libc=glibc --cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH")

# pg_dump backs up the database before migrations, and must be Postgres 17's.
FROM docker.io/library/node:22-trixie-slim
LABEL org.opencontainers.image.source=https://github.com/iammrduncan/fxbot
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates postgresql-client-17 >/dev/null \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/sdk packages/sdk
COPY --from=build /app/packages/server packages/server
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY deploy/health /usr/local/bin/fxbot-health
ENV FXBOT_HOST=0.0.0.0 NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "packages/server/src/index.ts"]
