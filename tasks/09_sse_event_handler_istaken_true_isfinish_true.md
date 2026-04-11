# Task 09 — Mobile SSE event handler + `handleToolPending()` dispatcher

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §8.3, §10 "Mobile-Side Contract"
**Depends on:** server tasks 04 + 05 shipped (so events are actually emitted)

## Why this matters

This is the mobile's entry point to the new protocol. Every SSE event the
server emits goes through this handler and fans out to the right UI.
Without it, the mobile cannot participate in the new step-by-step loop at all.

## Scope

Implement an `AgentSession` abstraction and an SSE handler that understands
the full event union:

```ts
type AgentEvent =
  | { event: "text_delta";    data: { content: string } }
  | { event: "status";        data: { message: string } }
  | { event: "tool_pending";  data: ToolPendingPayload }
  | { event: "tool_executed"; data: ToolExecutedPayload }
  | { event: "done";          data: DonePayload }
  | { event: "error";         data: ErrorPayload };

interface AgentSession {
  session_id:        string;
  sse_connection:    EventSource;
  pending_approvals: Map<string, ToolPendingPayload>;
  executors:         Record<string, MobileToolExecutor>;
}
```

### Event routing (§10)

```ts
sse.addEventListener("message", (e) => {
  const event: AgentEvent = JSON.parse(e.data);
  switch (event.event) {
    case "text_delta":   appendToChat(event.data.content); break;
    case "status":       showStatus(event.data.message); break;
    case "tool_executed": clearStatus(); maybePrefillUI(event.data); break;
    case "tool_pending": handleToolPending(event.data, session); break;
    case "done":         closeSSE(session); break;
    case "error":        showError(event.data.message, event.data.retryable); break;
  }
});
```

### `handleToolPending()` dispatcher

```ts
async function handleToolPending(payload: ToolPendingPayload, session: AgentSession) {
  const wallet    = getConnectedWallet();
  const treatment = resolveUXTreatment(                     // task 12
    payload.meta.capability,
    payload.name,
    wallet,                 // pass full wallet — grant store lives on it
    session.session_id,
    payload.meta.amount_usd,
  );

  switch (treatment) {
    case "silent":  return executeTool(payload, session);                  // task 10
    case "preview": return showPreviewCard(payload, session);              // task 13
    case "confirm": return showApprovalSheet(payload, session);            // task 14
    case "blocked": return rejectTool(payload, session, "wallet_type_cannot_execute");
  }
}
```

### Reconnect handling

If the `EventSource` drops while `session.pending_approvals` is non-empty,
reconnect by re-sending `POST /chat` with the existing `session_id` and an
empty `messages: []`. The server will re-emit any unresolved `tool_pending`
events (task 04). Do NOT show an approval sheet for a payload that is
already in `pending_approvals` — dedupe by `tool_call_id`.

## Network helpers

- `postRespond(sessionId, toolCallId, result)` — POST to `/chat/respond`
  with `type: "tool_result"`.
- `rejectTool(payload, session, reason)` — POST with `type: "tool_rejected"`.

Both attach the `x-api-key` header.

## Acceptance

- [ ] All six event types are handled; unknown events log a warning but
      don't crash the session.
- [ ] `handleToolPending` dispatches to executor/preview/sheet/reject per
      `resolveUXTreatment`.
- [ ] Duplicate `tool_pending` with the same `tool_call_id` is ignored
      (deduped for reconnect safety).
- [ ] SSE drop during `pending_approvals.size > 0` triggers reconnect.
- [ ] `done` closes the `EventSource` and empties `pending_approvals`.
- [ ] `error { retryable: false }` shows a terminal error state, no retry button.

## Out of scope

- Executor implementations (task 10).
- Grant resolution internals (task 11).
