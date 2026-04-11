---
phase: 1
area: mobile
section: §1
title: Sync server-assigned session_id from SSE events
---

# 07 — Sync server-assigned `session_id` from SSE events

## Context

The server mints its own `session_id` via `randomUUID()` and ignores any
id sent in the `POST /chat` body. The only way the mobile learns the real id
is from the `session_id` field in incoming SSE event payloads
(`tool_pending`, `done`).

If the mobile uses its own locally-generated id for `POST /chat/respond`,
it gets `404 session_expired` because the server only knows its own id.
This was the first failure mode in real integration.

`protocol_v1.1.md` §1 mandates that the mobile always reads `session_id`
from SSE payloads and uses that live value for all subsequent calls.

## What to do

In `mobile-app/services/agentSession/agentSession.ts` (reference:
`syncServerSessionId()`):

### 1. Adopt `session_id` from SSE events

When routing an inbound SSE event, update the session's `session_id`
from `event.data.session_id` whenever the field is present:

```typescript
function syncServerSessionId(event: AgentEvent, session: AgentSession): void {
  if ("session_id" in event.data && event.data.session_id) {
    session.session_id = event.data.session_id;
  }
}
```

Call this function for every parsed SSE event before dispatching it to
the handler.

### 2. Use live `session_id` for all `POST /chat/respond` calls

In `agentSession.ts`, every call to `POST /chat/respond` must read
`session.session_id` from the live (server-assigned) value, not from a
locally generated UUID:

```typescript
// WRONG — don't generate a local id and keep using it
const session_id = crypto.randomUUID();
// ...
await postRespond({ session_id, ... }); // 404 if it doesn't match server id

// CORRECT — use what the server told us
await postRespond({ session_id: session.session_id, ... });
```

### 3. SSE parser reads both `event:` and `data:` lines

Verify `mobile-app/services/agentSession/sseClient.ts#parseSseBlock`:
- MUST read the `event:` line for the event name.
- MUST read the `data:` line for the JSON payload.
- MUST NOT expect a wrapped `{event, data}` JSON object.

If the parser currently only reads `data:` lines, fix it to reconstruct:
```typescript
{ event: eventLine, data: JSON.parse(dataLine) }
```

A backwards-compatible fallback that also accepts the wrapped shape
(`{event, data}` in the `data:` line) is acceptable during transition.

## Acceptance criteria

- [ ] `syncServerSessionId()` is called for every inbound SSE event.
- [ ] `POST /chat/respond` always uses the server-assigned `session_id`.
- [ ] `parseSseBlock` correctly reads `event:` and `data:` lines separately.
- [ ] No 404 `session_expired` errors caused by id mismatch.

## References

- `protocol_v1.1.md` §1 "Session identity is server-assigned"
- `protocol_v1.1.md` §2 "SSE framing is standard, not wrapped"
- `mobile-app/services/agentSession/agentSession.ts`
- `mobile-app/services/agentSession/sseClient.ts`
