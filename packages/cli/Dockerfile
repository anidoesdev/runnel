# Build from the monorepo root, not this directory:
#   docker build -f packages/cli/Dockerfile -t n8n-clone-cli .

FROM node:22-alpine AS build
# better-sqlite3 compiles a native addon on install; these are only needed for that build step.
RUN apk add --no-cache python3 make g++
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @n8n-clone/cli... build

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Copies the whole built workspace rather than trying to hand-assemble a pruned,
# production-only node_modules: pnpm v10's non-legacy `pnpm deploy` requires
# inject-workspace-packages (a workspace-wide .npmrc change out of scope here), and its
# --legacy fallback turned out to only copy files without actually installing dependencies
# into the target — this is the simplest option that's actually verified to run. It costs
# image size (devDependencies and every workspace package's source come along for the ride);
# slimming that down is a reasonable follow-up, not a correctness concern.
COPY --from=build /repo ./
EXPOSE 5679
CMD ["node", "packages/cli/dist/bin.js", "start"]
