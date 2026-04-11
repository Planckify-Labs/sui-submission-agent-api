---
phase: 1
area: server
section: §1
title: Document server-owned session_id with inline comment
---

# 03 — Document server-owned `session_id` with inline comment

## Context

The server ignores any `session_id` supplied in the `POST /chat` body and
mints its own via `randomUUID()` in `SessionService.create()`. This is correct
behaviour but is undocumented — a future engineer reading the code might remove
the override, or a mobile developer might spend time debugging why their
supplied id never matches.

`protocol_v1.1.md` §1 clarifies the contract: **session identity is
server-assigned**. The migration requirement for the server side is a single
clarifying comment (no code change).

## What to do

In `agent-api/src/session/session.service.ts`, locate the `create()` method
(around line 70) where `randomUUID()` is called. Add a comment:

```typescript
// session_id is server-assigned — the mobile's supplied id is ignored.
// See protocol_v1.1.md §1 "Session identity is server-assigned".
const id = randomUUID();
```

Additionally, add a worked SSE-framing example to `agent-api/README.md`
(or the relevant doc file) demonstrating that:
- Each SSE block has an `event: <name>` line and a `data: <json>` line.
- The `session_id` in `tool_pending` and `done` events is the canonical id the
  mobile must adopt for all subsequent `POST /chat/respond` calls.

Example to include:

```
event: status
data: {"message":"Checking balance…"}

event: tool_pending
data: {"session_id":"9434bf6f-…","tool_call_id":"t1","name":"get_wallet_balance","input":{"chain_id":42161},"meta":{…}}

event: done
data: {"session_id":"9434bf6f-…","content":"Your balance is 1.5 ETH."}
```

## Acceptance criteria

- [ ] Comment added next to `randomUUID()` in `SessionService.create()`.
- [ ] SSE framing example added to `agent-api/README.md` (or equivalent doc).
- [ ] No code logic changes.
- [ ] `pnpm test` still passes.

## References

- `protocol_v1.1.md` §1 "Session identity is server-assigned"
- `protocol_v1.1.md` §2 "SSE framing is standard, not wrapped"
- `agent-api/src/session/session.service.ts` ~line 70
- `agent-api/src/chat/chat.events.ts#encodeSseEvent`
