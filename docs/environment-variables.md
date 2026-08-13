# Environment variables

## `packages/cli` (the server)

| Variable | Default | Notes |
|---|---|---|
| `N8N_ENCRYPTION_KEY` | an insecure dev-only value | Encrypts stored credential data at rest (AES-256-GCM). **Required** in any deployment reachable by anyone but you — `startServer()` logs a warning on every boot without it. Generate one with `openssl rand -hex 32`. Changing it after credentials have been saved makes them undecryptable. |
| `N8N_JWT_SECRET` | an insecure dev-only value | Signs session cookies (HS256). Same "required in production" rule as above. Changing it invalidates every existing session. |
| `PORT` | `5679` | The HTTP port the server listens on. Deliberately not n8n's usual `5678` — see the comment in `config.ts`; that port is commonly already in use by a real n8n instance on the same machine. |
| `DB_TYPE` | `sqlite` | `sqlite` or `postgres`. Anything else falls back to `sqlite`. |
| `DB_SQLITE_DATABASE` | `n8n-clone.sqlite` | Path to the SQLite file. Only read when `DB_TYPE=sqlite`. |
| `DB_POSTGRES_HOST` | `localhost` | Only read when `DB_TYPE=postgres`. |
| `DB_POSTGRES_PORT` | `5432` | |
| `DB_POSTGRES_USER` | `postgres` | |
| `DB_POSTGRES_PASSWORD` | `postgres` | |
| `DB_POSTGRES_DATABASE` | `n8n_clone` | |
| `CUSTOM_NODES_DIR` | unset (loads none) | Absolute path to a directory of built custom node packages — see `packages/node-dev`'s README. Each immediate subdirectory with a `dist/index.js` is loaded and registered; a custom node whose name collides with a built-in one is skipped (the built-in wins), logged as a warning. |

Nothing here configures webhook URLs specially — a workflow's webhook is always reachable at
`/webhook/<path>` on whatever host/port the server itself is reachable at.

## `packages/editor-ui` (the SPA)

These only matter when running the Vite dev server (`pnpm dev`) or the Docker image's nginx —
the built SPA itself doesn't read environment variables at runtime (it's static files).

| Variable | Where it's read | Default | Notes |
|---|---|---|---|
| `VITE_API_PROXY_TARGET` | `vite.config.ts`, dev server only | `http://localhost:5679` | Where the dev server proxies `/rest` and `/webhook` requests. Point it at a different `packages/cli` instance/port if you're not using the default. |
| `CLI_UPSTREAM` | `nginx.conf.template`, Docker image only | `cli:5679` | Same idea, for the built Docker image's nginx reverse proxy. Set via `docker run -e CLI_UPSTREAM=...` or `docker-compose.yml` if the backend service isn't named `cli` or isn't on port `5679`. |

## Docker Compose

`docker-compose.yml` wires `N8N_ENCRYPTION_KEY`/`N8N_JWT_SECRET` (and the optional
`DB_POSTGRES_*` overrides) through from a `.env` file at the repo root — copy `.env.example` to
`.env` and fill in real values before `docker compose up`. It fails fast with a clear message if
either required variable is missing, rather than silently starting with the insecure dev
defaults.
