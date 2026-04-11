# Task 04 — `POST /chat/respond` endpoint + SSE reconnect handling

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §4 "Transport", §8 "The Message Protocol"
**Depends on:** Task 03 (session service)

## Why this matters

`POST /chat/respond` is how the mobile returns tool results or rejections.
Without it, the agent loop (task 05) has no way to unblock. The endpoint
also has to handle the reconnect case — mobile re-sends `POST /chat` with
an existing `session_id` and empty messages, and the server re-emits any
unresolved `tool_pending` events.

## Scope

### 1. New endpoint: `POST /chat/respond`

```
POST /chat/respond
Content-Type: application/json
x-api-key: <CHAT_API_KEY>
```

Request body (discriminated union):

```ts
type MobileResponse =
  | {
      type:         "tool_result";
      session_id:   string;
      tool_call_id: string;
      result: {
        status:        "success" | "failed";
        tx_hash?:      `0x${string}`;
        tx_confirmed?: boolean;
        data?:         unknown;
        error?:        string;
      };
    }
  | {
      type:         "tool_rejected";
      session_id:   string;
      tool_call_id: string;
      reason:       "user_declined" | "insufficient_funds" | "network_error" | "wallet_type_cannot_execute" | string;
    };
```

Handler:

1. Validate with Zod (reject malformed with 400).
2. Look up session via `SessionService.get(session_id)`.
   - Missing → 404 `{ code: "session_expired" }`.
3. Call `sessionService.resolveMobileResult(session_id, tool_call_id, body)`.
   - Unknown `tool_call_id` or already-resolved → 409 (replay protection).
4. Return `204 No Content`. The SSE stream (still open from the original
   `POST /chat`) is what the agent loop uses to stream subsequent events.

Must be protected by `ApiKeyGuard` (existing).

### 2. Reconnect handling in `POST /chat`

Extend the existing `POST /chat` handler to detect reconnects:

```ts
if (request.session_id && request.messages.length === 0) {
  const session = sessionService.get(request.session_id);
  if (!session) {
    yield { event: "error", data: {
      code: "session_expired",
      message: "Session expired. Please start a new conversation.",
      retryable: false,
    } };
    return;
  }

  if (session.state === "awaiting_mobile") {
    for (const [toolCallId, payload] of session.pendingPayloads) {
      yield { event: "tool_pending", data: payload };
    }
    // Do NOT return — SSE stays open, loop will resume when mobile responds.
    return;
  }

  if (session.state === "streaming") {
    // Agent mid-reasoning — just let the existing loop continue streaming.
    return;
  }
}
```

The key detail: on reconnect we **re-attach** to the existing session's
generator instead of starting a new one. This requires the agent loop
(task 05) to be structured so its generator can keep running across
reconnects, or so unresolved tool_pending events are re-emitted without
restarting the loop.

## Acceptance

- [ ] `POST /chat/respond` accepts both `tool_result` and `tool_rejected` bodies.
- [ ] Unknown `session_id` → 404.
- [ ] Duplicate `tool_call_id` → 409.
- [ ] `POST /chat` with `session_id` + empty `messages` re-emits all
      unresolved `tool_pending` payloads over SSE.
- [ ] Integration test: start a chat → receive `tool_pending` → drop SSE →
      reconnect → receive the same `tool_pending` again → respond → loop
      completes.
- [ ] `ApiKeyGuard` is applied.

## Out of scope

- The loop itself (task 05).
- Tool execution on mobile (task 10).
