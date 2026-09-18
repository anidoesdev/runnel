# Environment variables

## `packages/cli` (the server)

| Variable | Default | Notes |
|---|---|---|
| `RUNNEL_ENCRYPTION_KEY` | an insecure dev-only value | Encrypts stored credential data at rest (AES-256-GCM). **Required** in any deployment reachable by anyone but you — `startServer()` logs a warning on every boot without it. Generate one with `openssl rand -hex 32`. Changing it after credentials have been saved makes them undecryptable. |
| `RUNNEL_JWT_SECRET` | an insecure dev-only value | Signs session cookies (HS256). Same "required in production" rule as above. Changing it invalidates every existing session. |
| `PORT` | `5679` | The HTTP port the server listens on. Deliberately not `5678` — see the comment in `config.ts`; that port is commonly already in use by another workflow tool on the same machine. |
| `DB_TYPE` | `sqlite` | `sqlite` or `postgres`. Anything else falls back to `sqlite`. |
| `DB_SQLITE_DATABASE` | `runnel.sqlite` | Path to the SQLite file. Only read when `DB_TYPE=sqlite`. |
| `DB_POSTGRES_HOST` | `localhost` | Only read when `DB_TYPE=postgres`. |
| `DB_POSTGRES_PORT` | `5432` | |
| `DB_POSTGRES_USER` | `postgres` | |
| `DB_POSTGRES_PASSWORD` | `postgres` | |
| `DB_POSTGRES_DATABASE` | `runnel` | |
| `CUSTOM_NODES_DIR` | unset (loads none) | Absolute path to a directory of built custom node packages — see `packages/node-dev`'s README. Each immediate subdirectory with a `dist/index.js` is loaded and registered; a custom node whose name collides with a built-in one is skipped (the built-in wins), logged as a warning. |
| `OPENAI_API_KEY` | unset | The Workflow Assistant's own model credential — set this to skip creating an `openAiApi` credential through the editor UI just to get the assistant working locally. Takes priority over any stored credential when set; unset falls back to "the first stored `openAiApi` credential", same as before. Never commit a real key — set it in `.env` (gitignored) or your shell, not in code. |
| `OPENAI_BASE_URL` | unset (real OpenAI) | Only read when `OPENAI_API_KEY` is set. Point the assistant at an OpenAI-compatible endpoint other than `api.openai.com` (Azure OpenAI, a local server, ...). |
| `OPENAI_MODEL` | `gpt-4o-mini` | Only read when `OPENAI_API_KEY` is set. |
| `RUNNEL_MEMORY_CAPTURE` | `false` | `true` turns on assistant memory capture (Memnest): after each turn, the session's user/assistant text — redacted, tool traffic dropped — is stored under `user:<userId>` and facts are extracted in the background using the same OpenAI key the assistant uses. On its own this is **shadow mode**: recall runs before each new turn and is logged as `memory.recall.shadow`, but nothing reaches the model. Creates Memnest's own `memnest_*` tables on first start; with both memory flags off, none are created. On SQLite, recall is keyword-only. On Postgres it is keyword + semantic, which needs the pgvector extension (the bundled `docker-compose.yml` uses the `pgvector/pgvector:pg16` image) and uses OpenAI's `text-embedding-3-small` with the same key as the assistant; without pgvector, memory stays disabled with a warning that says so. |
| `RUNNEL_MEMORY_RECALL` | `false` | `true` sends recalled memories to the model: before each new message, memories scoring at least `RUNNEL_MEMORY_MIN_SCORE` are appended to the assistant's system prompt (preferences first, at most eight) and their tokens are charged to the session's budget. Logged as `memory.recall.injected`. Without `RUNNEL_MEMORY_CAPTURE` nothing new is remembered, so recall only finds memories captured earlier. |
| `RUNNEL_MEMORY_TOKEN_BUDGET` | `400` | Maximum tokens of recalled memory per turn. |
| `RUNNEL_MEMORY_MIN_SCORE` | `1` | Relevance floor for injected memories. SQLite recall ranks by keyword (BM25) with no floor of its own, so a memory sharing only a common word scores near zero; anything below this is logged but never sent to the model. Raise it if unrelated memories show up in `passedFloorIds`, lower it if relevant ones are missed. |

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

`docker-compose.yml` wires `RUNNEL_ENCRYPTION_KEY`/`RUNNEL_JWT_SECRET` (and the optional
`DB_POSTGRES_*`/`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` overrides) through from a `.env`
file at the repo root — copy `.env.example` to `.env` and fill in real values before
`docker compose up`. It fails fast with a clear message if either required variable is missing,
rather than silently starting with the insecure dev defaults.
