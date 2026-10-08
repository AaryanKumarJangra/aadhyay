FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY backend/contracts backend/contracts
COPY frontend/packages/e2ee frontend/packages/e2ee
COPY frontend/web frontend/web
RUN pnpm install --frozen-lockfile --filter @aadhyay/web... \
 && pnpm --filter @aadhyay/contracts build && pnpm --filter @aadhyay/e2ee build \
 && cd frontend/web && NEXT_TELEMETRY_DISABLED=1 pnpm next build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/frontend/web
COPY --from=build /repo /repo
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
