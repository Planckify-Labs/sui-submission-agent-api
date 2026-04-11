---
phase: 1
area: server
section: §9
title: Enumerate ErrorPayload.code values in spec + verify MAX_ITERATIONS
---

# 04 — `ErrorPayload.code` enumeration + `MAX_ITERATIONS` documentation

## Context

`protocol_v1.1.md` §7 and §9 identify two gaps in the v1.0 spec:

1. **`MAX_ITERATIONS` is not documented.** The server already enforces
   `MAX_ITERATIONS = 16` in `chat.service.ts:171` and emits `max_iterations`
   on breach, but the spec was silent on both the constant and the error code.

2. **`ErrorPayload.code` is not enumerated.** The server emits distinct codes
   (`model_error`, `max_iterations`, `tool_timeout`, `session_error`,
   `internal_error`) but v1.0 §8.3 doesn't list them. HTTP-layer codes
   (`session_expired`, `missing_wallet_context`, etc.) are also unspecified.

This task is primarily a spec/comment task — the server code already behaves
correctly. The goal is to make the code self-documenting and update
`AGENT_PROTOCOL.md` (or a draft patch file) with the enumeration.

## What to do

### 1. Verify `MAX_ITERATIONS` constant in `chat.service.ts`

Confirm:
- The constant is `MAX_ITERATIONS = 16` (or document the actual value).
- On breach, the server emits:
  ```
  event: error
  data: {"code":"max_iterations","message":"Agent exceeded the maximum number of tool-call iterations.","retryable":true}
  ```
- Add a comment next to the constant:
  ```typescript
  // MAX_ITERATIONS: hard cap on agent loop turns — see protocol_v1.1.md §7
  const MAX_ITERATIONS = 16;
  ```

### 2. Add `ErrorPayload.code` type (if not already typed)

In the appropriate types file (e.g. `src/chat/types.ts`), add or update:

```typescript
export type ErrorCode =
  // SSE-level errors
  | "model_error"         // LLM API call failed (retryable)
  | "max_iterations"      // agent loop cap reached (retryable)
  | "tool_timeout"        // mobile didn't respond in time (retryable)
  | "session_error"       // internal session sync failure (non-retryable)
  | "internal_error"      // uncaught server exception (non-retryable)
  // HTTP-level errors (400/404/409 JSON bodies)
  | "missing_wallet_context"     // 400 — new session without wallet_context
  | "invalid_request"            // 400 — body schema validation failed
  | "session_expired"            // 404 — unknown or evicted session
  | "tool_call_already_resolved" // 409 — duplicate tool response
```

### 3. Agent retry discipline (if not already present in chat.service.ts)

Verify the agent loop handles `status: "rejected"` and `status: "approved_but_failed"`:
- On `rejected` with explicit `reason`: agent acknowledges, does NOT re-queue.
- On `approved_but_failed`: agent may try once alternative approach; if second
  attempt also fails, surface error and stop.
- Never auto-retry more than once per tool without user confirmation.

If this logic is missing, add it and reference `protocol_v1.1.md §7`.

## Acceptance criteria

- [ ] `MAX_ITERATIONS` constant is annotated with a protocol reference comment.
- [ ] `ErrorCode` type (or equivalent) is defined and used when emitting SSE
      error events.
- [ ] `pnpm test` passes.

## References

- `protocol_v1.1.md` §7 "Agent retry discipline and MAX_ITERATIONS"
- `protocol_v1.1.md` §9 "ErrorPayload.code enumeration"
- `agent-api/src/chat/chat.service.ts` ~line 171
- `agent-api/src/chat/types.ts`
