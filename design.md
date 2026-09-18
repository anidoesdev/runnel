# runnel — Design

A workflow-automation platform: a node-based canvas editor, a REST/SSE backend
that persists and executes workflows, a real execution engine with expressions and credentials,
and an in-app AI agent (the Workflow Assistant) that builds and repairs workflows through the
same tool layer a human would use by hand.

This document describes what exists and why it's shaped the way it is — not a spec for future
work. For the AI agent subsystem specifically, `ai-agent-build-prompt.md` is the original spec it
was built against; this document describes the system as built.

---

## 1. Monorepo layout

pnpm workspaces + Turborepo, 9 packages under `packages/*`, all published under the `@runnel/` scope. Dependency direction is enforced at
lint time by `.dependency-cruiser.cjs` (`pnpm lint` runs `depcruise` after `eslint`) — a build
fails if a package imports "sideways" or "up" the stack:

```
workflow  ──────────────────────────────────┐   (pure domain core, no internal deps,
                                              │    no Node.js built-ins — must run in the browser)
core ─────────────────► workflow             │
                                              │
nodes-base ───────────► workflow, core       │
                                              │
workflow-tools ───────► workflow, core       │   (not yet covered by dependency-cruiser —
                                              │    see §11)
assistant ────────────► workflow, workflow-tools
                                              │
cli ──────────────────► workflow, core, nodes-base, workflow-tools, assistant
                                              │
design-system ────────────────────────────────   (pure Vue primitives, no internal deps)

editor-ui ────────────► workflow, design-system

node-dev ─────────────► workflow
```

`cli` is the only package allowed to depend on everything below it — it's the composition root
(`app.ts`) that wires every subsystem's real implementation together. `editor-ui` deliberately
cannot depend on `core`/`cli`/`assistant`/`workflow-tools`: every server-side type it needs
(execution results, assistant messages, tool-call shapes) is hand-mirrored in
`editor-ui/src/api/types.ts` rather than imported, so the frontend bundle never pulls in
Node-only code.

| Package | What it is |
|---|---|
| `workflow` | Domain types and pure logic: `IWorkflowBase`/`INode`/`IConnections`, the expression language (lexer/parser/evaluator), graph algorithms (cycle detection, execution order, `pruneToDestination`), typed error classes. |
| `core` | The execution engine: `WorkflowExecute` (walks the graph, threads data, retries, error routing, dry-run mocking), the `IExecuteFunctions`/`IPollFunctions`/`IWebhookFunctions` context builders, credential encryption, the Code node's `vm`-based JS sandbox, the HTTP client, binary data handling, mutation ops (`addNode`, `connectNodes`, `renameNode`, ...). |
| `nodes-base` | Concrete node implementations (23 node types) and credential type definitions (7 types). |
| `workflow-tools` | The agent's tool layer: registry, `invokeTool`, the draft/overlay model, node-catalog search (BM25), schema compression, redaction. Framework-agnostic — no model-provider or HTTP concepts. |
| `assistant` | The agent loop itself: streaming, tool dispatch, budgets, pause/resume, the system prompt, the eval harness. Talks to `workflow-tools` for tools and to an `IModelProvider` (OpenAI today) for the model. |
| `cli` | Express server: REST controllers, TypeORM entities/migrations (SQLite or Postgres), auth (JWT sessions), active-workflow management (triggers/polls/webhooks), and the composition root wiring every other package together per request. |
| `design-system` | Presentational Vue components (`RunnelButton`, `RunnelInput`, `RunnelSelect`, `RunnelCheckbox`, `RunnelModal`) — no app logic. |
| `editor-ui` | The Vue 3 + Pinia SPA: the canvas (Vue Flow), node property panels, credential management, the chat/assistant panel, execution results. |
| `node-dev` | CLI scaffolding (`runnel-node-dev new`) and build tooling for authoring third-party node packages loaded via `CUSTOM_NODES_DIR`. |

Build/typecheck/lint/test are each a Turborepo task (`turbo.json`) with `dependsOn: ["^build"]`
where relevant, so a package always builds its dependencies before itself and Turborepo's
content-hash cache skips unchanged packages.

---

## 2. Domain model (`packages/workflow`)

A workflow is `{ nodes: INode[], connections: IConnections }`. Two design choices shape
everything downstream:

- **Connections key on node *name*, not id.** Renaming a node (`Workflow.renameNode`) rewires
  every connection and every expression reference (`$node["Old Name"]`) that points at it in one
  pass — nothing else in the system needs special-casing for a rename.
- **Every node receives and emits an array of items** (`{ json, binary?, pairedItem? }[]`), never
  a single value. A node runs once against the whole array unless it opts into per-item
  semantics.

Connection *types* are `main` (item flow) and `ai_languageModel`/`ai_tool` (a capability — a chat
model, a tool — supplied into an AI Agent node; these never carry items and their source node is
never scheduled as a normal step, only invoked directly via `getInputConnectionData`).

The expression language (`src/expression/`) is a small hand-written lexer/parser/evaluator for
`{{ ... }}` interpolation, with a fixed scope (`$json`, `$node`, `$input`, `$workflow`,
`$execution`, `$parameter`, `$now`/`$today`, `$if`/`$ifEmpty`, `$min`/`$max`, `$jmespath`) — not a
generic JS `eval`.

`NodeGraph` (`graph.ts`) provides cycle detection (a cycle is only legal through a node marked
`iterationNode: true`, e.g. Split In Batches) and topological execution order — used by the
editor for validation and by the assistant's grounding tools.

---

## 3. Execution engine (`packages/core`)

`WorkflowExecute.run(workflow, startNodeName, startData?)` walks the graph with an explicit stack
(`nodeExecutionStack`), not recursion, so a run can be serialized mid-flight (`IRunExecutionData`
round-trips through `JSON.stringify` exactly — no class instances, no functions) and resumed in a
different process. Per node:

- Retries (`retryOnFail`/`maxTries`/`waitBetweenTries`) wrap the call.
- Failure routes to `stopWorkflow` (default — halts the run), `continueRegularOutput`, or
  `continueErrorOutput` (tags failed items with `.error` and keeps going, or routes them to a
  dedicated error output).
- A node with zero incoming items (and a parent) is marked `skipped`, not run — this is what lets
  an If/Switch branch cleanly "not happen" downstream.
- Multi-input nodes (Merge) wait in `executionData.waitingExecution` until every required input
  index has arrived before running.

**Dry-run mode** (`IWorkflowExecuteOptions.dryRun`): before calling a node's real `execute()`, the
engine checks `nodeType.dryRunSafety?.(node.parameters) ?? 'mock'`. A node not classified `'safe'`
never actually runs — its input is recorded as a passthrough, tagged `mocked: true`, and
propagated onward so the rest of the graph still executes. This is what lets the Workflow
Assistant "run" a workflow to observe real data without ever performing a write (see §8). Every
trigger and pure-transform node type declares itself safe; `HttpRequest` is safe only for
GET/HEAD; `Postgres`, `AiAgent`, and anything unclassified defaults to mocked — the classification
is opt-in, never opt-out, so a future node type that forgets to classify itself is treated as
unsafe rather than silently trusted.

`IExecuteFunctions`/`IPollFunctions`/`ITriggerFunctions`/`IWebhookFunctions` (built by
`execute-context.ts`) are the interface every node's `execute()`/`poll()`/`trigger()`/`webhook()`
runs against — credential resolution, the HTTP helper, `getNodeParameter` (expression-aware),
binary data, and (for `IExecuteFunctions`) `getInputConnectionData` for pulling in an `ai_*`
sub-node's supplied capability.

The **Code node's sandbox** (`code/sandbox.ts`) uses Node's `vm` module — a separate global
object with no `require`/`fs`/`process`, so ordinary user JS has no I/O capability by
construction. Documented explicitly as *not* a hard security boundary (known `vm` escape vectors
exist); real process/worker isolation is out of scope for what's built.

**Mutation ops** (`mutation/workflow-mutation.ts`) — `addNode`, `connectNodes`, `disconnectNodes`,
`setNodeParameters`, `renameNode`, `removeNode`, `setNodeCredential`, `getWorkflowOutline` — are
pure functions over `IWorkflowBase`, with a typed error taxonomy
(`NodeNotFoundError`/`UnknownNodeTypeError`/`IncompatibleConnectionError`/...). These are the
*only* place graph-mutation logic lives — both the REST API's editor-facing operations and the
assistant's tool layer call into the same functions, never duplicating the logic.

---

## 4. Node system (`packages/nodes-base`)

23 node types, each an `INodeType` (`description` + `execute`/`poll`/`trigger`/`webhook`/
`supplyData`):

| Category | Nodes |
|---|---|
| Triggers | Manual Trigger, Schedule Trigger, Webhook, Poll Trigger, Chat Trigger, Start (legacy) |
| Transform | Set (Edit Fields), If, Switch, Filter, Sort, Limit, Remove Duplicates, Rename Keys, Merge, Split In Batches (loop), Code, No Operation |
| I/O | HTTP Request, Postgres |
| AI | AI Agent, OpenAI Chat Model, Calculator Tool |

7 credential types: `httpBasicAuth`, `httpHeaderAuth`, `httpQueryAuth`, `httpBearerAuth`,
`oAuth2Api`, `openAiApi`, `postgresApi`.

The **AI Agent** node is the one node whose `execute()` doesn't just transform items — it runs an
LLM reasoning loop: call the connected chat model (`ai_languageModel` input), let it call any
connected `ai_tool` inputs (Calculator Tool today), feed results back, repeat until the model
returns a final answer. Chat Model and Tool nodes have no `execute()` at all — only `supplyData()`
— so `WorkflowExecute` can never schedule them as a normal step; they only run when the Agent node
calls `getInputConnectionData`.

Scope decisions worth knowing: HttpRequest doesn't implement proxy tunneling; Postgres takes a
raw SQL string with no query builder; Code supports JavaScript only (Python is listed but
rejected at runtime); Schedule Trigger supports a fixed interval, not cron expressions.

---

## 5. Backend (`packages/cli`)

An Express app (`app.ts` is the composition root) behind `helmet`, JSON body parsing, cookie
parsing, and a global `requireAuth` middleware (JWT session cookie, `PUBLIC_PATHS` /
`PUBLIC_PATH_PREFIXES` carved out for setup/login and `/webhook/*`).

**Auth**: a single-owner model today (`UserEntity.isOwner`, no multi-user RBAC yet) —
`POST /rest/auth/setup` creates the one owner account and only succeeds once;
`POST /rest/auth/login` issues a signed session cookie (`jose`, HS256); passwords are hashed with
`argon2`.

**Persistence**: TypeORM, SQLite (default, `runnel.sqlite`) or Postgres (`DB_TYPE=postgres`),
migrated explicitly (`runMigrations()`, no `synchronize`). Entities: `User`, `Workflow`,
`Credential`, `Execution`, `AssistantSession`, `Folder`, `Notification`. Every JSON-shaped column uses TypeORM's `simple-json` type
(stored as a text column, serialized/deserialized transparently) rather than a native
Postgres `jsonb` column — sidesteps SQLite/Postgres dialect differences so the same entity
definitions and migrations work against either backend. Timestamps are plain ISO-string columns,
not DB-managed `@CreateDateColumn`s.

**Credentials**: stored encrypted at rest (AES-256-GCM, `RUNNEL_ENCRYPTION_KEY`) via
`encryptCredentialData`/`decryptCredentialData` in `core`. The REST API (`CredentialsController`)
never returns the `data` column — only `{ id, name, type, createdAt, updatedAt }`. Credential
*resolution* for node execution is deliberately simple: "the first stored credential of the
requested type" — there's no per-node credential picker beyond that in the runtime path (the
editor UI's `CredentialPicker` lets a user *attach* a specific credential id to a node, but the
engine's `credentialsResolver` still just looks up by type).

**Controllers**: `HealthController`, `AuthController`, `WorkflowsController`,
`CredentialsController`, `ExecutionsController`, `NodeTypesController`,
`CredentialTypesController`, `AssistantController` (see §8), `FoldersController`,
`NotificationsController`, `SettingsController`. Each is a plain class with
`@RestController(basePath)` + `@Get`/`@Post`/`@Patch`/`@Delete` method decorators
(`http/decorators.ts`); `buildRouterForController` turns the decorated methods into an Express
`Router` at startup — no framework beyond that (no NestJS, no per-route middleware chains beyond
the global ones).

**Active workflows** (`ActiveWorkflowManager`): the only thing keeping "an active workflow" alive
in a running server. `activate()`/`deactivate()` are idempotent, called on every
workflow create/update/delete so runtime state never drifts from the `active` DB column for
longer than one request. It starts each trigger node's real lifecycle — `trigger()`'s returned
`closeFunction`, `poll()`'s `setInterval` — and registers webhook nodes (keyed by
`METHOD:normalized-path`) so an incoming request at `/webhook/<path>` can be routed to the right
workflow/node and run it via the same `WorkflowExecute` used everywhere else.

**Library** (`workflows/`, `folders/`): workflows carry `starred`, `folderId` and `deletedAt`.
`DELETE /rest/workflows/:id` is a *soft* delete — the workflow is deactivated at once and moves to
the trash, where every route except restore and permanent delete treats it as not found (editing
or running something the user believes they deleted would be a surprise). Trash older than
`TRASH_RETENTION_DAYS` (30) is purged at startup and whenever the trash is listed, rather than on a
timer, so a laptop that runs Runnel ten minutes a day purges too. Folders are flat; deleting one
unfiles its workflows instead of deleting them.

**Notifications** (`notifications/`): written at the moment something happens — a workflow
activated or deactivated, or an *unattended* execution (trigger, poll, webhook) failing. A manual
run's failure is already on screen, so it isn't notified. `workflowName` is copied in, so an entry
still reads correctly after its workflow is renamed or deleted.

**Settings** (`settings/`): read-only system info (never secrets), per-user preferences stored on
`UserEntity.settings` (today: the assistant's default token budget), and `POST /rest/auth/password`,
which re-verifies the current password and reissues the session cookie.

**Workflow execution** (`execution/run-workflow.ts`): shared by the REST "Execute Workflow"
endpoint, the `runnel execute` CLI command, and (via `runWorkflowDefinition`, the entity-free
variant) the assistant's grounding tools. `destinationNode` triggers
`Workflow.pruneToDestination()` — the same subgraph-pruning the editor's per-node "Run to Here"
button uses — so "run just far enough to see this node's output" was already a first-class
capability before the assistant needed dry-run mocking on top of it.

---

## 6. Editor UI (`packages/editor-ui`)

Vue 3 + Pinia + Vue Router, canvas rendered with `@vue-flow/core`. Stores: `auth`, `workflow`,
`nodeTypes`, `credentials`, `assistant`. Routes: `/` (landing), `/setup`, `/login`, `/workflows`
(library), `/workflow/new`, `/workflow/:id`, `/settings`, `/credentials/:id`.

The library view hosts starring, the trash, folders and a Templates tab (starter workflows built
from real node types in `data/templates.ts`). `components/app/TopbarActions.vue` is the bell,
settings link and account menu shared by every top bar; the bell polls every 30 seconds and marks
its contents read when opened.

**Theming**: every component paints from CSS custom properties, so dark mode is one
`[data-theme='dark']` palette block in `global.css`. The theme is per browser (`localStorage`),
applied before mount so the first paint is already correct.

The canvas (`WorkflowCanvas.vue` + `CanvasNode.vue`) maps `INode`/`IConnections` to Vue Flow's
node/edge model — handle ids encode both connection type and per-type index
(`output-main-0`, `input-ai_languageModel-0`) since a node can have several *kinds* of port, not
just several `main` ones. Autosave is debounced off the whole store state, not a dirty flag, so a
burst of edits (typing in a parameter field) restarts the timer on every keystroke rather than
saving mid-word.

`NodeDetailPanel.vue` renders a node's parameter form from its `INodeTypeDescription.properties`
generically (types, `displayOptions.show`/`hide` visibility rules, `fixedCollection`/`collection`
nesting) — there's no per-node-type custom UI.

The canvas also has a **readonly/preview mode**: when the assistant panel is open,
`WorkflowCanvas` renders the assistant's in-progress *draft* instead of the live workflow store
(props `previewNodes`/`previewConnections`), with drag/connect/delete disabled
(`nodes-connectable`/`nodes-draggable` gated on `readonly`) — direct canvas edits and an
in-flight agent draft can't both be true sources of truth for the same graph at once, so editing
happens through chat until the draft is applied.

---

## 7. Testing & CI

Every package uses Vitest with v8 coverage. `.github/workflows/ci.yml` runs on a Postgres service
container: install → build → typecheck → lint (which includes the `depcruise` dependency-direction
check) → test, then conditionally the assistant eval suite if `OPENAI_API_KEY` is configured as a
secret (skips gracefully otherwise). Tests that need real credentials or a real DB either spin up
an in-memory SQLite database (`createDataSource(sqliteConfig(':memory:'))`) or `describe.skipIf`
against a reachable local Postgres, rather than mocking TypeORM.

A handful of tests route around a real TypeORM type-checker limitation: `insert()`/`save()`
against `WorkflowEntity`'s nested `INode[]`/`IConnections` structural types causes `tsc` to report
"Type instantiation is excessively deep" (a type-checker-only problem, not a runtime one) — those
specific setup/read calls use raw `dataSource.query()` SQL instead of the repository API.

---

## 8. The Workflow Assistant (`packages/assistant` + `packages/workflow-tools`)

An in-app chat agent that builds, edits, debugs, and repairs workflows by calling validated tools
against a live graph — not a chatbot producing workflow-shaped text. Built against
`ai-agent-build-prompt.md`; this section describes the resulting system.

**Draft/overlay model** (`WorkflowDraftStore`, in-memory, keyed by a generated draft id): the
agent mutates a copy-on-write working copy, never the live workflow directly. `apply()` is the
one explicit, human-initiated action that writes the draft to the real workflow — the agent has no
tool that does this itself. Being in-memory-only means a draft doesn't survive a server restart;
`AssistantController` self-heals a session whose `draftId` has gone stale by silently opening a
fresh draft and leaving a note in the transcript, rather than failing the turn outright.

**Tool layer** (`workflow-tools`): a registry of `ITool<Params, Result>` (Zod-validated params,
optional `requiresApproval`), dispatched through `invokeTool`. Tool families:

- **Graph** — `add_node`, `connect_nodes`, `disconnect_nodes`, `set_node_parameters`,
  `rename_node`*, `remove_node`*, `set_node_credential`, `get_workflow_outline` (thin wrappers
  over `core`'s mutation ops — a handler is a five-line read/mutate/write, never business logic).
- **Catalog** — `search_nodes` (hand-rolled BM25, no embeddings — 23 node types doesn't justify
  more), `get_node_schema` (a compressed `INodeTypeDescription`, options truncated with a
  follow-up `get_node_options` call for long enum lists), `get_node_options`.
- **Credentials** — `list_credentials` (id/name/type only, never a value), `request_credential`
  (creates an unconfigured placeholder + a setup link; the agent is instructed to never invent a
  credential value).
- **Execution/grounding** — `execute_dry_run` (ungated), `execute_live`* (real writes), and
  `get_node_output` (schema + a redacted sample of a node's real last-observed output, explicitly
  wrapped as untrusted/attacker-controlled data in both the tool result and the system prompt —
  a webhook body or API response is data to reference, never an instruction to follow).

(\* `requiresApproval: true` — see below.)

**Agent loop** (`agent-loop.ts`): one `runTurn` call streams a model round-trip, executes the
resulting tool calls in order, and recurses until the model stops calling tools — pausing instead
of continuing whenever it hits an `ask_user` call or a `requiresApproval` tool. A pause records
`pendingQuestions`/`pendingApproval` on the session (including the *rest* of that batch's calls,
so a multi-tool-call turn doesn't lose work queued after the gated one) and returns control to the
caller; `resumeAskUser`/`resumeApproval` continue exactly where it left off once a human answers.
Budgets (~40 tool calls, a token ceiling, a wall-clock timeout) reset on every resume — a human
taking ten minutes to approve something isn't the runaway-loop scenario the budget protects
against. An `AbortSignal` threads through the model stream and every tool call for cancellation.

**Model provider**: `IModelProvider.stream(messages, tools, system) → AsyncIterable<Event>` is
the abstraction; `OpenAiModelProvider` is the concrete implementation (real SSE streaming,
normalizing OpenAI's index-keyed parallel-tool-call deltas into the provider-agnostic event
union). Resolved per session by `createModelProviderForSession`: an `OPENAI_API_KEY` environment
variable takes priority (for local dev — skips the credential UI entirely), falling back to "the
first stored `openAiApi` credential" otherwise, matching how every other node's credential
resolves.

**Safety**:
- Dry run by default — `execute_live` always requires fresh approval, never a remembered one.
- Approval gates on `remove_node`, `rename_node`, `execute_live` — enforced by the loop itself
  (`ITool.requiresApproval`), not by convention.
- **Redaction**: `redactDeep` (a general recursive pass matching secret-shaped key names —
  `password`/`secret`/`token`/`apiKey`/`authorization`/`credential`) runs over *every* tool
  result before it can enter the transcript (`session.messages`) or a live SSE event — one choke
  point in `agent-loop.ts`, not something each tool has to remember to do itself.
- Prompt injection: `get_node_output`'s data is explicitly framed as untrusted in both the tool
  result and the system prompt.

**Frontend**: `AssistantPanel.vue` — streamed text, humanized tool-call rows
(`humanizeToolCall` — never raw JSON args), `ask_user` rendered as clickable option chips + free
text, an approval card (Approve/Reject), and a diff view (added/removed/changed, field-level
before/after) before Apply. Entry points beyond the panel: an "Ask Assistant" button, and a
"Fix this" button on any failed execution that pre-loads the session with the real error and the
failing node's real (reconstructed) input data (`getNodeInputData` in `packages/workflow` — walks
`ITaskData.source` back one hop to the previous node's recorded output, since the engine never
persists a node's input directly).

**Grounding the model in what exists** — three changes measured on the eval suite:
- The first model call for each new message is made with `tool_choice: "required"`. Left free,
  models answered build requests with a clarifying question typed as prose: nothing got built and
  nothing paused. Forced, the model either starts working or asks through `ask_user`. Later calls
  in the turn, and resumes, are unforced, so the summary is still plain text.
- Every call's system prompt ends with the full node catalog (`node-catalog.ts`), generated from
  the registry so custom nodes appear. `search_nodes` only finds what the model thinks to search
  for; asked to remove duplicates, it searched "filter" and "merge" and never met Remove Duplicates.
- `add_node` returns what was actually added (display name and description), its parameters with
  exact names and allowed values, which required ones are unset, and its credential types. The
  model no longer needs a separate `get_node_schema` call to know `httpMethod` isn't `method`.

**Guard rails in the graph operations** (`core/src/mutation/`): `add_node`/`set_node_parameters`
reject parameter names the node type doesn't declare, listing the valid ones. Before this, a model
guessing `method` for a Webhook (whose parameter is `httpMethod`) had the key stored and silently
ignored, and then told the user the webhook "accepts POST". With the error it corrects itself on
the next call. `list_credentials`/`request_credential` likewise reject a credential type no node
uses (a model guessing `openai` for `openAiApi` got an empty list, concluded there was no
credential and created a duplicate), and `set_node_credential` names the types a node does take.
The same goes for an `options` parameter given a value it doesn't offer (a model
setting a Webhook's response mode to `"immediate"`), except for expressions, which are only known
at run time. `connect_nodes` likewise refuses to wire a node into its own input.

**Memory** (`assistant/src/memory-port.ts`, `cli/src/assistant/memory/`): cross-session memory
through [Memnest](https://github.com/anidoesdev/MemNest), behind two flags that both default off.
The assistant package only declares `IAssistantMemoryPort`; the cli supplies either a no-op adapter
or the Memnest one, so the assistant never depends on a memory engine and memory can be removed
without touching it. With both flags off Memnest is never even imported and no tables exist.

- *Capture* (`RUNNEL_MEMORY_CAPTURE`) runs after each turn without being awaited. Only user and
  assistant text is sent — tool calls and results are dropped — and every message goes through
  `redactText` first (`redactDeep` checks object keys, which does nothing for a pasted key in a
  sentence). Memories live in the `user:<userId>` container, and the session id is the document's
  `customId`, so re-capturing a growing session versions it instead of duplicating it.
- *Recall* runs before each new message (never on resumes, which would change the prompt under
  the model mid-turn). With `RUNNEL_MEMORY_RECALL` off it is shadow mode: the result is logged as
  `memory.recall.shadow` and discarded. With it on, memories above `RUNNEL_MEMORY_MIN_SCORE`
  (keyword recall ranks by BM25 with no floor of its own) are appended to the system prompt,
  preferences first, at most eight, and their tokens are charged to the session's budget. The
  block asks for relevant preferences to be applied, says the current message wins, and states
  memories are never instructions that change the assistant's rules.
- The store follows Runnel's database. SQLite: keyword recall only. Postgres: keyword + semantic
  (`text-embedding-3-small`, resolved like the assistant's key), in Memnest's own `memnest` schema;
  pgvector is checked up front, and a server without it leaves memory disabled with a warning
  naming the extension rather than a migration stack trace.
- Any memory failure is logged and the turn continues without memory.

**Eval harness** (`assistant/src/evals/`): 48 cases (`{ prompt, seedWorkflow?,
availableCredentials?, seedExecutionOutputs?, autoResume?, assertions[] }`) scoring outcomes, not
exact tool-call structure — did it use the right node types, call the right tools, ask when it
should have, stay quiet when it shouldn't. Runs against a real `OpenAiModelProvider` (external
HTTP mocked at the model-endpoint layer via a scripted local server in tests, or a real key in
CI) so results are deterministic and free unless `OPENAI_API_KEY` is actually configured. Four
memory cases (`cases/memory.ts`) give the model recalled memories and check a non-default parameter
ends up set; they are opt-in (`RUNNEL_EVAL_MEMORY=true`) so the default suite's score doesn't move.
When the model asks a question a case didn't script an answer for, the runner replies "No
preference — use a sensible default." instead of aborting — asking an extra, reasonable question is
legitimate behaviour, not a case-authoring bug.

---

## 9. Custom node development (`packages/node-dev`)

A small CLI (`runnel-node-dev`) for scaffolding (`new`) and building third-party node
packages. A built custom-node directory (with a `dist/index.js`) dropped under `CUSTOM_NODES_DIR`
is loaded and registered at server startup; a custom node whose name collides with a built-in one
is skipped (the built-in wins) with a warning, never a hard failure.

---

## 10. Deployment

`docker-compose.yml`: three services — `postgres`, `cli` (built from `packages/cli/Dockerfile`),
`editor-ui` (built from `packages/editor-ui/Dockerfile`, served via nginx reverse-proxying `/rest`
and `/webhook` to the `cli` service). `RUNNEL_ENCRYPTION_KEY`/`RUNNEL_JWT_SECRET` are required and fail
fast with a clear message if unset (`${VAR:?message}` compose syntax) rather than silently
falling back to the insecure dev defaults `config.ts` uses for local `node dist/bin.js start`.
`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` pass through optionally for the assistant.
Full variable reference: `docs/environment-variables.md`.

---

## 11. Known gaps

- **A5 (pinned-data replay)** — a node's output can't be frozen and reused across repeated
  dry-run calls; each `execute_dry_run` re-runs every upstream safe node from scratch. Explicitly
  scoped as a follow-up, not required for the grounding loop to work.
- **`validate_workflow`** — a static whole-graph validation tool the original spec mentions is
  not built; `get_workflow_outline`'s `unsetRequiredParams` is the closest substitute today.
- **`.dependency-cruiser.cjs` doesn't cover `assistant`/`workflow-tools`** — both packages
  post-date the ruleset (its own header comment lists only 7 packages); their outgoing imports
  aren't currently checked by the `from` rules, though anyone importing *from* them incorrectly
  would still be caught by the `to` side of an existing rule.
- **Draft persistence** — `WorkflowDraftStore` is in-memory only; a draft is lost on server
  restart (mitigated, not eliminated, by the self-heal behavior in §8).
- **Single-owner auth** — no multi-user roles/permissions; `UserEntity.isOwner` is scaffolding
  for a later pass.
- **Credential selection** — both node execution and the assistant resolve "the first stored
  credential of the requested type"; picking a *specific* credential when several of the same
  type exist isn't wired into the runtime path yet, only into the editor's per-node
  `CredentialPicker`.
- **Assistant model quality** — on the full eval suite (52 cases, 2 runs each, gpt-4o-mini) the
  assistant passes 50% of runs strictly, up from 23% before the grounding changes above. Another
  26% build the right workflow but fail only `no_tool_errors`, because the model guessed a
  parameter or credential name, was told the valid ones and corrected itself — 76% on outcome
  alone. gpt-4.1-mini scored about the same (52%) at roughly 2.7× the price, so gpt-4o-mini stays
  the default. Remaining misses: over-asking on requests that have sensible defaults, credential
  flows (the model skips `list_credentials`), and choosing `execute_live` where a dry run would do.
- **Memory recall quality** — SQLite recall is keyword-only, so relevance depends on shared words;
  `RUNNEL_MEMORY_MIN_SCORE` filters near-zero matches but can't make "auth" find "HMAC". Memnest
  also lacks a memory-only search that returns a trace (Runnel uses `search()` and ignores the
  transcript chunks it also packs) and a relevance floor of its own for keyword recall.
- **Code node sandboxing** — `vm`-based, explicitly documented as not a hard security boundary
  against a determined escape; real isolation (a separate process/worker) is out of scope.
