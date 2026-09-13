# n8n-clone

A workflow-automation platform in the spirit of [n8n](https://n8n.io): a node-based canvas
editor, a REST/SSE backend that persists and executes workflows, a real execution engine with
an expression language and encrypted credentials, and an in-app AI agent — the **Workflow
Assistant** — that builds and repairs workflows by calling the same tool layer a human would
use by hand.

TypeScript end to end. pnpm workspaces + Turborepo, 11 packages, ~120 test files on Vitest.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Running with Docker](#running-with-docker)
- [Repository layout](#repository-layout)
- [Built-in nodes and credentials](#built-in-nodes-and-credentials)
- [The Workflow Assistant](#the-workflow-assistant)
- [REST API](#rest-api)
- [Development](#development)
- [Configuration](#configuration)
- [Custom nodes](#custom-nodes)
- [Further reading](#further-reading)

---

## Features

- **Visual editor** — Vue 3 + Pinia SPA with a Vue Flow canvas, node palette, per-node property
  panels with `displayOptions` visibility rules, credential management, and execution results.
- **Execution engine** — walks the graph in dependency order, threads item data between nodes,
  supports retries, error routing, and dry-run mocking of unsafe nodes.
- **Expression language** — a hand-written lexer/parser/evaluator for `{{ $json.field }}`-style
  templates, with n8n-like extension functions and a JMESPath-lite subset.
- **Triggers** — manual, schedule (cron), webhook (`/webhook/<path>`), polling, and chat.
- **Credentials** — encrypted at rest with AES-256-GCM, never returned to the client in cleartext.
- **AI Workflow Assistant** — an agent that edits a copy-on-write draft of your workflow through
  validated tools, asks clarifying questions, gates destructive actions behind human approval,
  and grounds itself in real node output.
- **Custom nodes** — scaffold and build third-party node packages with `n8n-node-dev`, load them
  via `CUSTOM_NODES_DIR`.
- **SQLite or Postgres** — TypeORM entities with migrations for both.

---

## Quick start

Requirements: **Node.js >= 22** and **pnpm 10.11.1** (`corepack enable` picks this up from
`packageManager` in `package.json`).

```bash
pnpm install
pnpm build
```

Start the backend (defaults to SQLite at `./n8n-clone.sqlite`, listening on port **5679**):

```bash
node packages/cli/dist/bin.js start
```

In a second terminal, start the editor's dev server (Vite, port **5173**, proxying `/rest` and
`/webhook` to the backend):

```bash
pnpm --filter @n8n-clone/editor-ui dev
```

Open <http://localhost:5173>. The first visit shows a setup screen — it creates the single owner
account, and only succeeds once.

> The server listens on **5679**, not n8n's usual 5678, so it won't collide with a real n8n
> instance on the same machine.

To run a saved workflow from the command line:

```bash
node packages/cli/dist/bin.js execute --id=<workflowId>
```

---

## Running with Docker

`docker-compose.yml` brings up three services: `postgres`, `cli`, and `editor-ui` (nginx serving
the built SPA and reverse-proxying the API).

```bash
cp .env.example .env    # then fill in real values
docker compose up --build
```

`N8N_ENCRYPTION_KEY` and `N8N_JWT_SECRET` are **required** — compose fails fast with a clear
message rather than silently falling back to the insecure dev defaults. Generate them with
`openssl rand -hex 32`. The editor is then at <http://localhost:8080> and the API at
<http://localhost:5679>.

---

## Repository layout

Dependency direction is enforced at lint time by `.dependency-cruiser.cjs` — `pnpm lint` fails if
a package imports "sideways" or "up" the stack.

| Package | What it is |
|---|---|
| `workflow` | Pure domain core: `IWorkflowBase`/`INode`/`IConnections`, the expression language, graph algorithms (cycle detection, execution order, pruning), typed errors. No internal deps, no Node built-ins — it runs in the browser. |
| `core` | The execution engine: `WorkflowExecute`, the `IExecuteFunctions`/`IPollFunctions`/`IWebhookFunctions` context builders, credential encryption, the Code node's `vm` sandbox, the HTTP client, binary data, graph mutation ops. |
| `nodes-base` | The 23 built-in node types and 7 credential types. |
| `workflow-tools` | The agent's tool layer: registry, `invokeTool`, the draft/overlay model, BM25 node-catalog search, schema compression, redaction. Framework-agnostic. |
| `assistant` | The agent loop: streaming, tool dispatch, budgets, pause/resume, system prompt, eval harness. |
| `cli` | Express server — REST controllers, TypeORM entities and migrations, JWT auth, active-workflow management, and the composition root wiring everything together. |
| `design-system` | Presentational Vue primitives (`N8nButton`, `N8nInput`, `N8nSelect`, `N8nCheckbox`, `N8nModal`). |
| `editor-ui` | The Vue 3 + Pinia SPA. Deliberately cannot depend on `core`/`cli`/`assistant` — server-side types are mirrored in [`src/api/types.ts`](packages/editor-ui/src/api/types.ts) so the bundle never pulls in Node-only code. |
| `node-dev` | Scaffolding and build tooling for third-party node packages. |

`cli` is the only package allowed to depend on everything below it.

---

## Built-in nodes and credentials

**Triggers** — Manual, Chat, Schedule, Webhook, Poll, Start

**Flow control** — If, Switch, Filter, Merge, Split In Batches, No-Op

**Data** — Set, Sort, Limit, Remove Duplicates, Rename Keys, Code (sandboxed JS)

**Integrations** — HTTP Request, Postgres

**AI** — AI Agent, OpenAI Language Model, Calculator Tool

**Credential types** — HTTP Basic / Header / Query / Bearer auth, OAuth2, Postgres, OpenAI

---

## The Workflow Assistant

An in-app chat agent that builds, edits, debugs, and repairs workflows by calling validated tools
against a live graph — not a chatbot that emits workflow-shaped text.

- **Draft/overlay model** — the agent mutates a copy-on-write draft, never the live workflow.
  Applying the draft is the one explicit, human-initiated action; the agent has no tool for it.
- **Tools** — graph edits (`add_node`, `connect_nodes`, `set_node_parameters`, `rename_node`,
  `remove_node`, …), catalog search (`search_nodes`, `get_node_schema`, `get_node_options`),
  credentials (`list_credentials`, `request_credential` — it never invents a credential value),
  and grounding (`execute_dry_run`, `execute_live`, `get_node_output`).
- **Human gates** — destructive or real-world-effecting tools carry `requiresApproval`, and the
  loop pauses on `ask_user` questions. A pause preserves the rest of the queued tool calls, so
  resuming doesn't lose work.
- **Untrusted data** — node output surfaced to the model is redacted and explicitly wrapped as
  attacker-controlled data: a webhook body is something to reference, never an instruction.
- **Budgets** — a tool-call ceiling, a token ceiling, and a wall-clock timeout, all reset on
  human resume, plus `AbortSignal` cancellation through the model stream and every tool call.

To use it, either set `OPENAI_API_KEY` in `.env`, or create an `openAiApi` credential through the
editor. Evals live in [`packages/assistant/src/evals`](packages/assistant/src/evals) and run with
`pnpm --filter @n8n-clone/assistant evals` against a built `dist`.

---

## REST API

All routes are under `/rest`, authenticated by a JWT session cookie except where noted.

| Route | Purpose |
|---|---|
| `GET/POST /rest/auth/setup` | First-run owner account (public) |
| `POST /rest/auth/login`, `POST /rest/auth/logout`, `GET /rest/auth/me` | Sessions |
| `GET/POST /rest/workflows`, `GET/PATCH/DELETE /rest/workflows/:id` | Workflow CRUD |
| `POST /rest/workflows/:id/execute` | Run a workflow |
| `GET/POST /rest/credentials`, `GET/PATCH/DELETE /rest/credentials/:id` | Credential CRUD |
| `GET /rest/credential-types`, `GET /rest/node-types` | Catalog for the editor |
| `GET /rest/executions`, `GET /rest/executions/:id` | Execution history |
| `POST /rest/assistant/sessions` plus `/sessions/:id/{messages,approval,answers,apply,diff,draft}` | The assistant (responses stream over SSE) |
| `/webhook/<path>` | Workflow webhook triggers (public) |
| `GET /healthz`, `GET /healthz/readiness` | Health checks |

Login and setup are rate-limited; `helmet` and a redacting access log are applied globally.

---

## Development

Every task runs through Turborepo from the repo root:

```bash
pnpm build       # turbo run build
pnpm typecheck   # turbo run typecheck
pnpm lint        # eslint + depcruise (dependency-direction check)
pnpm test        # vitest with v8 coverage, per package
pnpm clean
```

Scope any of them to one package with `pnpm --filter @n8n-clone/<pkg> <script>`.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs install → build → typecheck →
lint → test against a Postgres service container, then the assistant eval suite if an
`OPENAI_API_KEY` secret is configured (it skips gracefully otherwise).

Tests that need a database either use in-memory SQLite or `describe.skipIf` against a reachable
local Postgres — TypeORM is not mocked.

---

## Configuration

Full reference: [`docs/environment-variables.md`](docs/environment-variables.md). The ones you are
most likely to need:

| Variable | Default | Notes |
|---|---|---|
| `N8N_ENCRYPTION_KEY` | insecure dev value | Encrypts stored credentials. **Set this** anywhere reachable by anyone but you. Changing it makes existing credentials undecryptable. |
| `N8N_JWT_SECRET` | insecure dev value | Signs session cookies. Changing it invalidates every session. |
| `PORT` | `5679` | Backend HTTP port. |
| `DB_TYPE` | `sqlite` | `sqlite` or `postgres`. |
| `DB_SQLITE_DATABASE` | `n8n-clone.sqlite` | SQLite file path. |
| `DB_POSTGRES_*` | `localhost:5432`, `postgres`/`postgres`, `n8n_clone` | Postgres connection. |
| `CUSTOM_NODES_DIR` | unset | Directory of built custom node packages. |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | unset / OpenAI / `gpt-4o-mini` | The assistant's model credential. Takes priority over any stored `openAiApi` credential. |
| `VITE_API_PROXY_TARGET` | `http://localhost:5679` | Dev-server proxy target. |

Never commit real secrets — `.env` is gitignored; `.env.example` is the template.

---

## Custom nodes

```bash
node packages/node-dev/dist/bin.js new MyNode --display-name="My Node" --dir=./my-nodes
node packages/node-dev/dist/bin.js build ./my-nodes/my-node
```

Point `CUSTOM_NODES_DIR` at the parent directory. Every immediate subdirectory with a
`dist/index.js` is loaded and registered at boot; a custom node whose name collides with a
built-in one is skipped (the built-in wins) and the collision is logged.

---

## Further reading

- [`design.md`](design.md) — the architecture as built, and why it is shaped this way.
- [`ai-agent-build-prompt.md`](ai-agent-build-prompt.md) — the original spec the assistant was
  built against.
- [`docs/environment-variables.md`](docs/environment-variables.md) — full configuration reference.

Known gaps are tracked in [`design.md`](design.md) §11 — notably pinned-data replay for dry runs,
a static `validate_workflow` tool, and in-memory-only draft persistence.
