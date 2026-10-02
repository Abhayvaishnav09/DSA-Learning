# syntax=docker/dockerfile:1.7
# One Dockerfile for every service:
#   docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=identity -t logicpath/identity .
# Stage 1 installs and bundles the service with esbuild; stage 2 ships only the bundle, its
# migrations, seed assets and the few native dependencies, running as the unprivileged node user.
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Behind a TLS-inspecting proxy, pass its CA as a build secret (never stored in the image):
#   docker build --secret id=extra_ca,src=/path/ca.crt ...
# `with-ca` uses it for one command when it is mounted, and does nothing otherwise.
RUN printf '#!/bin/sh\n[ -f /run/secrets/extra_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca\nexec "$@"\n' > /usr/local/bin/with-ca && chmod +x /usr/local/bin/with-ca
RUN corepack enable
WORKDIR /repo
# Dependency layer first, so code changes don't reinstall everything.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store with-ca pnpm fetch
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store with-ca pnpm install --frozen-lockfile --offline
ARG SERVICE
RUN test -n "$SERVICE" || (echo "pass --build-arg SERVICE=<name>" && exit 1)
RUN pnpm --filter "./services/${SERVICE}" build \
 && mkdir -p "services/${SERVICE}/drizzle" "services/${SERVICE}/assets" \
 && node infra/docker/runtime-deps.mjs "${SERVICE}" /out
# The bundle holds everything except native packages; install just those for the runtime.
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,id=npm,target=/root/.npm \
    cd /out && with-ca npm install --omit=dev --no-audit --no-fund && mkdir -p node_modules

FROM ${NODE_IMAGE}
ARG SERVICE
ARG VERSION=dev
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 SERVICE_VERSION=${VERSION}
LABEL org.opencontainers.image.source="https://github.com/Abhayvaishnav09/DSA-Learning" \
      org.opencontainers.image.title="logicpath-${SERVICE}" \
      org.opencontainers.image.version="${VERSION}"
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/services/${SERVICE}/dist ./dist
COPY --from=build --chown=node:node /repo/services/${SERVICE}/drizzle ./drizzle
COPY --from=build --chown=node:node /repo/services/${SERVICE}/assets ./assets
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
