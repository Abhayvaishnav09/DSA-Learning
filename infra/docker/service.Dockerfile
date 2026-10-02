# One Dockerfile for every service: docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=identity .
# Stage 1 bundles the service with esbuild; stage 2 ships the bundle, its migrations and the
# few native dependencies, running as the unprivileged node user.
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG SERVICE
RUN pnpm --filter "./services/${SERVICE}" build \
 && mkdir -p "services/${SERVICE}/drizzle" "services/${SERVICE}/assets" \
 && pnpm --filter "./services/${SERVICE}" deploy --prod --legacy /out

FROM node:22-slim
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/services/${SERVICE}/dist ./dist
COPY --from=build /repo/services/${SERVICE}/drizzle ./drizzle
COPY --from=build /repo/services/${SERVICE}/assets ./assets
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
