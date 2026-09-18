# Build from the monorepo root, not this directory:
#   docker build -f packages/editor-ui/Dockerfile -t runnel-editor-ui .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @runnel/editor-ui... build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/packages/editor-ui/dist /usr/share/nginx/html
COPY packages/editor-ui/nginx.conf.template /etc/nginx/templates/default.conf.template
# Hostname:port of the cli service — nginx's docker-entrypoint substitutes this into
# nginx.conf.template at container start (see the template's own comment). Override via
# `docker run -e CLI_UPSTREAM=...` or docker-compose.yml when the backend isn't named "cli".
ENV CLI_UPSTREAM=cli:5679
EXPOSE 80
