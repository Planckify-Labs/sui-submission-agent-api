# Task 05 — Refactor `chat.service.ts` into a resumable agent loop

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §9 "Server-Side Agent Loop"
**Depends on:** Tasks 01 (registry), 02 (human_summary), 03 (session), 04 (respond endpoint)

## Why this matters

The current `ChatService` is a single `streamText()` call. The new protocol
requires a **step-by-step loop** that suspends at every mobile tool call
and resumes when `POST /chat/respond` arrives. This is the heart of the
protocol — everything else is scaffolding around it.

## Scope

Rewrite `src/chat.service.ts` so the main entry point is an async generator
that yields `AgentEvent`s:

```ts
async function* agentLoop(session: Session): AsyncGenerator<AgentEvent>
```

### Loop structure (from §9)

1. Yield `status: "Thinking…"`.
2. Call `streamText({ model, messages: session.messages, tools: buildAllTools(TOOL_REGISTRY), system })`.
3. Stream `text_delta` events for every text chunk.
4. When the model returns tool calls, iterate them **sequentially**:
   - If `meta.executor === "server"`:
     - Execute locally (TakumiPay MCP).
     - Filter raw result through `transformForDisplay()` → yield `tool_executed`.
     - Push full (unfiltered-for-LLM) result into `session.messages` via `transformForAgent()`.
   - If `meta.executor === "mobile"`:
     - Build `ToolPendingPayload` (including `human_summary` from task 02,
       optional `amount_usd` if known).
     - Yield `tool_pending`.
     - `await session.awaitMobileResult(tool_call_id, payload, { timeoutMs: 5 * 60_000 })`.
     - On timeout → yield `error { code: "tool_timeout", retryable: true }` and `return`.
     - Convert `MobileResponse` → `AgentToolResult` via `buildAgentToolResult()`
       and push into `session.messages`.
5. If the model returned no tool calls, yield `done` and exit.
6. Otherwise, loop back to step 1 with updated messages.

### `buildAgentToolResult()`

Discriminated union — the agent must see unambiguous status codes:

```ts
type AgentToolResult =
  | { status: "approved_and_executed"; tx_hash?: `0x${string}`; data?: unknown }
  | { status: "approved_but_failed"; error: string }
  | {
      status: "rejected";
      reason: "user_declined" | "insufficient_funds" | "network_error" | "wallet_type_cannot_execute" | string;
    };
```

Map:
- `tool_result { status: "success" }` → `approved_and_executed`
- `tool_result { status: "failed" }` → `approved_but_failed` (do NOT retry silently — let the agent decide)
- `tool_rejected` → `rejected` (preserve `reason`)

### Parallelism rule (§3 "Multi-Chain Targeting")

- `capability: "read"` mobile tools **may** be emitted concurrently — multiple
  `tool_pending` events can be in flight simultaneously for the same model step.
- `capability: "simulate"` and `capability: "write"` tools are **always**
  sequential — await one before emitting the next.
- First pass may implement everything sequentially. Parallel reads can land
  as a follow-up refinement if needed.

## SSE wiring

The `POST /chat` controller:
- Creates or fetches the session.
- Opens an SSE response.
- Iterates the generator, writing each event as `data: ${JSON.stringify(e)}\n\n`.
- Closes the stream on `done` or `error`.

## Acceptance

- [ ] Chat request with only server tools (e.g. TakumiPay product lookup)
      completes without any `tool_pending` events.
- [ ] Chat request that triggers a mobile tool emits `tool_pending`, waits
      for `POST /chat/respond`, then continues streaming the agent's reply.
- [ ] `tool_rejected { reason: "user_declined" }` is injected into agent
      context as `{ status: "rejected", reason: "user_declined" }`. Agent
      acknowledges instead of retrying.
- [ ] `tool_result { status: "failed", error: "nonce too low" }` is injected
      as `{ status: "approved_but_failed", error: "nonce too low" }`.
- [ ] Mobile unreachable for 5 minutes → loop yields `tool_timeout` error
      and terminates cleanly; session remains valid for a fresh turn.
- [ ] Reconnect case (task 04) works end-to-end: drop SSE during
      `awaiting_mobile`, reconnect, receive re-emitted `tool_pending`, respond,
      loop continues.

## Out of scope

- Removing `src/blockchain/` (task 07).
- Mobile executor implementations (task 10).
