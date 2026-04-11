---
phase: 1
area: server
section: §5
title: wallet_context refresh on existing sessions
---

# 02 — `wallet_context` refresh on existing sessions

## Context

`chat.controller.ts` (lines 55–66) only uses `wallet_context` when creating a
new session. If the session already exists, the incoming `wallet_context` is
silently ignored. This means if a user switches chains mid-conversation, the
server's system prompt still describes the old chain.

Although tool execution is currently correct (mobile always uses the live chain),
the system prompt drift is a latent bug that grows riskier as the agent becomes
more complex.

From `protocol_v1.1.md` §5, the proposed fix is a two-line change in
`chat.controller.ts`.

## What to do

In `agent-api/src/chat/chat.controller.ts`, inside the branch that handles
an existing session (where `session` is found by `session_id`), add:

```typescript
// Inside the "session exists" branch
if (session && wallet_context) {
  session.wallet_context = wallet_context as WalletContext;
  session.chain_id       = (wallet_context as WalletContext).chain_id;
}
```

This makes `wallet_context` a field the mobile **refreshes** on every turn
rather than sets once at creation.

## Spec wording to add to `AGENT_PROTOCOL.md` §8.2

> **wallet_context refresh.** The mobile MUST include `wallet_context` in the
> body of every `POST /chat` request, not only when starting a new session. The
> server MUST update `session.wallet_context` (and rebuild any cached system
> prompt) whenever a newer `wallet_context` arrives for an existing session.

## Acceptance criteria

- [ ] `wallet_context` from `POST /chat` body is applied to an existing session
      when `session_id` is present.
- [ ] `session.chain_id` is updated alongside `wallet_context.chain_id`.
- [ ] `pnpm test` passes — add a unit test in `chat.controller.spec.ts` (or
      equivalent) verifying that a second POST with a different `chain_id` updates
      the session's `wallet_context`.
- [ ] No change to session creation logic.

## References

- `protocol_v1.1.md` §5 "Wallet context refresh on chain or wallet switch"
- `agent-api/src/chat/chat.controller.ts` lines 55–66
- `agent-api/src/session/session.service.ts`
