---
phase: 3
area: server
section: §14-F
title: Audit server logging — session.messages must never be logged
---

# 14 — Server logging audit: session data must never be persisted or logged

## Context

`protocol_v1.1.md` §14 Guard F mandates that `session.messages` (which may
contain redemption order details, wallet balances, voucher codes, and other
user PII) MUST NOT be written to any persistent store or log.

Session state lives in the in-process `SessionStore` only and is evicted after
`SESSION_TTL_MS` (currently 15 minutes of inactivity).

## What to do

### 1. Audit all log statements in `agent-api/src/`

Check every `console.log`, `logger.log`, `this.logger.debug`, etc. for
tool result payload logging. Specifically look for:

- `session.messages` being logged
- Tool result `data` fields being logged at any log level
- `wallet_context` being logged (may contain wallet address — OK to log,
  but never log the full `points_authenticated` check path with credentials)

If any log line emits tool result content, change it to log only:
- Session ID
- Event type / tool name
- Timing / status codes (success/failure)
- Never log the `data` payload itself

### 2. Verify session is memory-only

In `agent-api/src/session/session.service.ts`, confirm:
- The session store is an in-memory `Map<string, Session>` (no DB writes).
- TTL eviction deletes from the in-memory store only.
- No external cache (Redis / Valkey) writes for session messages.

If the session store currently uses Redis / Valkey for any session data,
flag this as a blocker and do NOT add message caching — only metadata
(session IDs for reconnect) may be externally cached.

### 3. Add a comment to `SessionService`

```typescript
// SECURITY: session.messages is memory-only — never write to DB, cache,
// or logs. May contain PII (voucher codes, balances, redemption details).
// See protocol_v1.1.md §14-F.
```

### 4. Confirm no log line includes tool result payloads

After audit, add a short comment block at the top of `chat.service.ts`:
```typescript
// Logging policy: emit session_id + event_type only.
// NEVER log tool result data — may contain user PII.
```

## Acceptance criteria

- [ ] No log statement in `agent-api/src/` emits `session.messages` content
      or tool result `data` payloads.
- [ ] `SessionService` uses in-memory storage only for message history.
- [ ] Comments added to `session.service.ts` and `chat.service.ts`.
- [ ] `pnpm test` passes (no changes expected to test logic).

## References

- `protocol_v1.1.md` §14 Guard F "Session data never persisted"
- `agent-api/src/session/session.service.ts`
- `agent-api/src/chat/chat.service.ts`
