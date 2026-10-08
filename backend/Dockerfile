# Multi-stage build for the NestJS backend (api / realtime / worker share one image; CMD selects the process).
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY backend/package.json backend/
COPY backend/contracts/package.json backend/contracts/
COPY frontend/packages/e2ee/package.json frontend/packages/e2ee/
RUN pnpm install --frozen-lockfile --filter @aadhyay/backend... --ignore-scripts=false

FROM deps AS build
COPY backend backend
RUN pnpm --filter @aadhyay/contracts build && cd backend && npx tsc -p tsconfig.build.json

FROM node:22-bookworm-slim
ENV NODE_ENV=production
# Keep the pnpm workspace layout so symlinked deps resolve; run from /repo/backend.
COPY --from=build /repo /repo
WORKDIR /repo/backend
USER node
EXPOSE 4000 4001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "if(process.env.ROLE!=='api')process.exit(0);fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.api.js"]
