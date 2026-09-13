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
| `OPENAI_API_KEY` | unset | The Workflow Assistant's own model credential — set this to skip creating an `openAiApi` credential through the editor UI just to get the assistant working locally. Takes priority over any stored credential when set; unset falls back to "the first stored `openAiApi` credential", same as before. Never commit a real key — set it in `.env` (gitignored) or your shell, not in code. |
| `OPENAI_BASE_URL` | unset (real OpenAI) | Only read when `OPENAI_API_KEY` is set. Point the assistant at an OpenAI-compatible endpoint other than `api.openai.com` (Azure OpenAI, a local server, ...). |
| `OPENAI_MODEL` | `gpt-4o-mini` | Only read when `OPENAI_API_KEY` is set. |
| `RUNNEL_MEMORY_CAPTURE` | `false` | `true` turns on assistant memory capture (Memnest): after each turn, the session's user/assistant text — redacted, tool traffic dropped — is stored under `user:<userId>` and facts are extracted in the background using the same OpenAI key the assistant uses. On its own this is **shadow mode**: recall runs before each new turn and is logged as `memory.recall.shadow`, but nothing reaches the model. Creates Memnest's own `memnest_*` tables on first start; with both memory flags off, none are created. SQLite only for now (lexical recall); on Postgres memory stays disabled with a warning. |
| `RUNNEL_MEMORY_RECALL` | `false` | Reserved for injecting recalled memories into the assistant's prompt. Not built yet — setting it logs a warning and memory keeps running in shadow mode. |
| `RUNNEL_MEMORY_TOKEN_BUDGET` | `400` | Maximum tokens of recalled memory per turn. |

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
`DB_POSTGRES_*`/`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` overrides) through from a `.env`
file at the repo root — copy `.env.example` to `.env` and fill in real values before
`docker compose up`. It fails fast with a clear message if either required variable is missing,
rather than silently starting with the insecure dev defaults.
