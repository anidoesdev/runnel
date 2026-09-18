# Build Prompt: In-App Workflow-Building Chat Agent

> Paste below the line into your coding agent. Assumes the workflow platform (engine, persistence, REST API, editor) already exists.
> Where an assumption doesn't match your codebase, the prompt tells the agent to detect and adapt rather than guess.

---

## ROLE

You are building the **Workflow Assistant** — an in-app chat agent that constructs, edits, debugs and explains automation workflows from natural language, inside our existing platform.

This is not a chatbot with a workflow-shaped output. It is an agent that manipulates a live graph through validated tools, observes real execution data, and asks the user when it lacks information.

## ASSUMPTIONS — VERIFY BEFORE YOU START

Begin by inspecting the codebase and reporting which of these hold. Do not proceed until you've reported.

| # | Assumption | If false |
|---|---|---|
| A1 | A workflow document exists with `nodes[]`, `connections{}`, node `parameters` | Stop and ask |
| A2 | A node registry can enumerate all node types with full parameter schemas | Build the enumeration first |
| A3 | Workflows can be executed and per-node input/output retrieved afterwards | Build `get_execution` first |
| A4 | **Partial execution** — run a subgraph up to node N | Gate Phase 4 (grounding); use trigger-only execution instead |
| A5 | **Pinned data** — freeze a node's output for subsequent runs | Gate the dry-run replay; note as follow-up |
| A6 | Credentials are stored encrypted with an id/name/type listing available | Build the listing; never expose values |
| A7 | A services layer exists that the REST API calls into | Extract one — do not call controllers from the agent |

If A4/A5 are missing, still build Phases 1–3 and 5–6 fully, and implement Phase 4 behind a capability flag so it activates when the engine gains support.

## MODEL

Default to **Anthropic Claude via the Messages API** with native tool use, streaming, and prompt caching. Put it behind a `ModelProvider` interface (`stream(messages, tools, system) → AsyncIterable<Event>`) so OpenAI or a local model can be swapped in, but do not build the abstraction before the Anthropic path works end to end.

Prompt caching is not optional. The system prompt plus tool definitions plus retrieved node schemas will run 20–60k tokens per turn. Mark cache breakpoints after the system prompt and after the tool block.

---

## PART 1 — ARCHITECTURE

```
editor-ui/AssistantPanel.vue
   │  WebSocket: user message
   ▼
server/assistant/session.ts        ← agent loop, conversation state
   │  invokeTool(name, args, ctx)
   ▼
packages/tools/registry            ← typed, validated, scoped
   │
   ▼
packages/services                  ← workflow, execution, credential, registry
```

Three hard rules:

1. **The agent never writes workflow JSON directly.** It calls mutation tools whose arguments are Zod-validated against the live node registry. Invalid node types must be structurally impossible, not merely discouraged.
2. **The agent mutates a draft, not the live workflow.** Every session opens a `WorkflowDraft` — a copy-on-write overlay. The user sees a diff and explicitly applies. Nothing the agent does can destroy work in progress.
3. **All logic lives in services.** Tools are five-line wrappers. If a tool handler contains business logic, it's in the wrong place.

### Session state

```ts
interface AssistantSession {
  id: string;
  workflowId: string;
  draftId: string;
  messages: Message[];              // full transcript incl. tool_use / tool_result
  actor: { userId, projectId, scopes };
  tokenBudget: { used: number; limit: number };
  pendingApproval?: { toolName: string; args: unknown };
  status: 'idle' | 'thinking' | 'awaiting_user' | 'awaiting_approval' | 'error';
}
```

Persist sessions. A user who reloads the page mid-build must not lose the conversation.

---

## PART 2 — THE TOOL SURFACE

Agent-facing tools are **task-shaped**, not resource-shaped. Keep the count under ~16; more degrades selection accuracy and burns context.

### Discovery

```ts
search_nodes(query: string, limit?: number)
  → Array<{ type, displayName, description, category, score }>
// Hybrid retrieval: BM25 over displayName+description+aliases, blended with
// embedding similarity. Must handle brand names ("slack"), verbs ("send email"),
// and outcomes ("save to spreadsheet"). Seed an alias table by hand —
// "sheets"→Google Sheets, "db"→Postgres. This unglamorous table is worth more
// than a better embedding model.

get_node_schema(type: string, typeVersion?: number)
  → CompressedNodeSchema
// NEVER return the raw description object. Compress it:
//  - drop `displayOptions` branches that can't apply given current parameters
//  - drop `options[]` enum lists longer than 30 entries; expose
//    `get_node_options(type, field)` for those
//  - keep required fields, defaults, and one usage example
// Target under 1500 tokens per node. Measure this; assert it in a test.
```

### Reading

```ts
get_workflow_outline()
  → { nodes: Array<{name, type, disabled, unsetRequiredParams: string[]}>,
      connections: Array<{from, outputIndex, to, inputIndex}>,
      issues: Diagnostic[] }
// Compact by default. A full workflow document can exceed 200KB and destroys
// the context budget. Provide detail: 'full' only for a single named node.

get_node_output(nodeName: string, opts?: { maxItems?: number })
  → { itemCount, schema: JsonSchema, sample: unknown[] }
// Return the INFERRED SCHEMA plus 2–3 sample items, never the full payload.
// Redact anything matching credential/token/password/authorization patterns.
```

### Mutation — all operate on the draft

```ts
add_node(type, typeVersion?, name?, position?, parameters?)
  → { name }                        // returns the ACTUAL name after dedup
connect_nodes(from, to, outputIndex?, inputIndex?)
disconnect_nodes(from, to, outputIndex?)
set_node_parameters(name, parameters: Record<string, unknown>)  // deep merge
rename_node(oldName, newName)       // must rewrite connections AND expressions
remove_node(name)
set_node_credential(name, credentialType, credentialId)
```

`add_node` returning the resolved name matters more than it looks — if the model assumes its requested name was used and a collision forced `"Slack1"`, every subsequent `connect_nodes` call fails.

### Execution and validation

```ts
validate_workflow()
  → Diagnostic[]   // {severity, nodeName, field?, message, fixHint?}
// Static checks: unknown node types, dangling connections, unset required
// params, missing credentials, expressions referencing nonexistent nodes,
// unreachable nodes, cycles outside loop nodes.

execute_until(nodeName: string, mode: 'dry_run' | 'live')
  → { status, executionId, perNode: Record<string, {itemCount, error?}> }
// dry_run: reads execute for real, WRITES are intercepted and mocked.
// Requires A4. If unavailable, expose execute_trigger_only() instead.
```

### Human-in-the-loop

```ts
ask_user(questions: Array<{
  id: string;
  question: string;
  options?: Array<{ label: string; value: string; description?: string }>;
  allowFreeText?: boolean;
}>) → Record<string, string>

list_credentials(type?: string) → Array<{id, name, type}>   // NEVER values
request_credential(type: string) → { setupUrl: string, credentialId: string }
```

`ask_user` is the primitive behind "guide the user if anything is missing." Implement it as a suspend-and-resume: the tool call blocks the loop, the UI renders real option chips, the answer returns as the tool result. Do not let the model ask questions in prose — prose questions get ignored and the model guesses instead.

**Rule for the system prompt:** ask when the answer is unknowable from context (which Slack channel, which spreadsheet, what counts as "urgent"). Never ask what's discoverable by calling a tool.

---

## PART 3 — THE SYSTEM PROMPT

This file is source code. Put it in `assistant/prompts/system.md`, version it, review it in PRs, and never let it be edited without an eval run.

It must contain:

**Data model rules.** Every node emits an array of items. Nodes run once per input item by default. Expressions bind to the current item. `$json` is the current item; `$node["Name"].json` reaches another node's output. Getting this wrong is the single most common generation failure.

**Connection semantics.** Connections key on node *name*. IF has two outputs (0 = true, 1 = false). Merge waits for all inputs. Loop nodes have `loop` and `done` outputs.

**Expression syntax.** Prefix with `=`, interpolate with `{{ }}`. A parameter that is exactly one `{{ }}` returns a typed value, not a string.

**A working-order policy:**

```
1. Restate the automation in one sentence. If ambiguous, ask_user FIRST.
2. search_nodes for each capability needed. Never assume a node type string.
3. get_node_schema before setting any parameter on an unfamiliar node.
4. Build the skeleton: add_node + connect_nodes, no parameters yet.
5. Configure parameters that don't depend on runtime data.
6. Attach credentials; request_credential if none exist.
7. Ground the expressions (Part 4).
8. validate_workflow; fix every error before reporting done.
9. Summarize what you built and what the user must review.
```

**An explicit failure catalogue.** List the mistakes you observe in evals with corrections — invented node types, forgetting IF's second output, writing `$json.email` without checking, using Set when the user wanted Filter. This section will grow and is where most quality gains come from.

**Tone.** Terse. No preamble like "Great question!". Report what was built, not what will be attempted.

---

## PART 4 — GROUNDING (the differentiator)

Requires A4/A5. Build behind `capabilities.partialExecution`.

The core insight: **an LLM cannot know what an API returns.** Writing `{{ $json.customer.email }}` from imagination produces workflows that look correct and silently yield `undefined`. So don't imagine — look.

```
After the skeleton is built and credentials attached:

  for each node N in topological order:
    if N's parameters contain expressions referencing upstream data:
      execute_until(predecessor(N), mode='dry_run')
      schema = get_node_output(predecessor(N)).schema
      → now write N's expressions against `schema`, not against a guess
      set_node_parameters(N, ...)
```

And a correction loop:

```
result = execute_until(N, 'dry_run')
if result.error:
    feed { error message, N's resolved parameters, actual input schema }
    back to the model
    retry, max 3 attempts, then ask_user
```

Enforce in the system prompt: **never write an expression referencing a field you have not observed in a `get_node_output` result.** If the data isn't available, use `ask_user` or leave the parameter unset and flag it in the summary.

Measure the delta. Run your eval set with grounding on and off. If the gap isn't large, your dry-run mode is probably not actually executing reads.

---

## PART 5 — SAFETY

- **Dry run by default.** `execute_until(mode='live')` requires explicit user approval every time, never a remembered preference.
- **Approval gates** on `remove_node`, `rename_node`, live execution, and applying a draft. The loop pauses with `status: 'awaiting_approval'` and the UI renders what will happen.
- **Prompt injection.** `get_node_output` returns data the workflow fetched — emails, form submissions, webhook bodies — which is attacker-controlled. Wrap it in the tool result as clearly delimited untrusted content, instruct the model in the system prompt that data from executions is never an instruction, and never allow a tool call to be triggered solely by content originating from `get_node_output`.
- **Credential values never enter the transcript.** Enforce with a redaction pass over every tool result plus a test that greps transcripts for known credential fixtures.
- **Budgets.** Cap tool calls per turn (~40), tokens per session, and wall-clock per turn. Surface remaining budget in the UI.
- **Cancellation.** An `AbortSignal` threaded through the model stream and every tool.

---

## PART 6 — UI

**Chat panel**, docked right, resizable, persists across canvas navigation.

- Stream assistant text token by token.
- Render each tool call as a compact collapsible row: `⚙ Added node "Send Slack message"`. Do not dump raw JSON args; humanize per tool.
- **Highlight on the canvas in real time.** When `add_node` fires, the node appears with a pulse; when `connect_nodes` fires, the edge draws. This is what makes it feel like an agent rather than a form.
- `ask_user` renders as real clickable option chips inline, plus a free-text field.
- Approval gates render as an inline card with Approve / Reject / Always-for-this-session.

**Diff view** before applying a draft: added nodes green, removed red, changed parameters as a field-level before/after. The user must be able to reject individual changes, not only the whole draft.

**Entry points beyond the panel:** empty-canvas prompt box ("Describe what you want to automate"), right-click a node → "Ask assistant about this node", and — highest value — a **"Fix this" button on any failed execution** that opens the session pre-loaded with the error and the failing node's real input data.

That last one is worth building early. Repairing broken workflows is a more frequent and more painful job than authoring new ones, and the agent is unusually good at it because the error and the data are both right there.

---

## PART 7 — EVALS

Build this **before** tuning the system prompt. Without it you are guessing.

- 40+ cases: `{ prompt, seedWorkflow?, availableCredentials[], assertions[] }`
- Source prompts from real user language, not your own phrasing. Workflow-automation community forums are a good corpus.
- Score on outcomes, not structure: does it execute without error; does the final node receive the expected fields; were the right node types used; how many tool calls, tokens, seconds; did it ask when it should have and stay quiet when it shouldn't.
- Mock all external APIs at the HTTP layer so runs are deterministic and free.
- Run in CI on every change to the system prompt or tool descriptions. Report a scorecard diff on the PR.
- Track `% requiring zero human correction` as the headline number. That's the metric that predicts whether people will actually use the feature.

---

## MILESTONES

| # | Milestone | Done when |
|---|---|---|
| 0 | Verify assumptions; report capability matrix | Report delivered |
| 1 | Tool layer: registry, `invokeTool`, context, error taxonomy, draft/overlay model | Tools callable from a unit test; drafts apply and roll back |
| 2 | Node catalog retrieval + schema compression | `search_nodes` top-3 accuracy >90% on 50 hand-labelled queries; schemas under 1500 tokens |
| 3 | Agent loop: streaming, tool dispatch, session persistence, budgets, cancellation | Builds a 3-node workflow end to end from a prompt, in a test |
| 4 | `ask_user` + approval gates + credential handoff | Agent asks instead of guessing on an underspecified prompt |
| 5 | Chat panel, live canvas highlighting, diff view | A user can build and apply a workflow without touching the canvas |
| 6 | Grounding loop + self-correction (gated on A4/A5) | Measurable eval improvement over ungrounded baseline |
| 7 | Eval harness in CI; system prompt tuned against it | Scorecard reported on every PR |
| 8 | "Fix this" entry point from failed executions | Repairs a genuinely broken workflow in one turn |

## DEFINITION OF DONE

A user opens an empty canvas and types: *"When someone submits my Typeform, check if their company has more than 50 employees using Clearbit, and if so post to #sales in Slack, otherwise add them to a nurture list in Airtable."*

The agent asks which Slack channel and which Airtable base, flags that no Clearbit credential exists and provides a setup link, builds the seven-node workflow including the IF branch, runs the trigger to observe the real Typeform payload, writes expressions against the fields it actually saw, dry-runs the whole graph, presents a diff, and the user applies it and activates — without opening a single node's parameter panel.

## HOW TO WORK

1. Report the assumption verification before writing code.
2. Write the tool layer and its tests before touching the model.
3. Build the eval harness before tuning any prompt.
4. Never stub and continue — throw `NotImplementedError('phase N')` so gaps fail loudly.
5. If something here conflicts with the existing codebase, stop and say so rather than working around it silently.
