# syntax=docker/dockerfile:1.7
# The website: docker build -f infra/docker/web.Dockerfile -t logicpath/web .
# One image for every environment: the browser calls the API on the same origin (/v1/...), and
# the web server forwards those paths to the gateway service (API_PROXY_TARGET).
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
# Behind a TLS-inspecting proxy: --secret id=extra_ca,src=/path/ca.crt (see service.Dockerfile).
RUN printf '#!/bin/sh\n[ -f /run/secrets/extra_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca\nexec "$@"\n' > /usr/local/bin/with-ca && chmod +x /usr/local/bin/with-ca
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store with-ca pnpm fetch
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store with-ca pnpm install --frozen-lockfile --offline
ARG API_PROXY_TARGET=http://gateway:8080
ENV NEXT_OUTPUT=standalone NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_URL= API_PROXY_TARGET=${API_PROXY_TARGET}
RUN pnpm --filter @logicpath/content build && pnpm --filter @logicpath/web build

FROM ${NODE_IMAGE}
ARG VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
LABEL org.opencontainers.image.source="https://github.com/Abhayvaishnav09/DSA-Learning" \
      org.opencontainers.image.title="logicpath-web" \
      org.opencontainers.image.version="${VERSION}"
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
