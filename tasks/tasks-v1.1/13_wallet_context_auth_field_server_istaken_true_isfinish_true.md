---
phase: 3
area: server
section: §13
title: Add points_authenticated to WalletContext + system prompt injection
---

# 13 — `points_authenticated` in `WalletContext` (server)

## Context

`protocol_v1.1.md` §13 adds `points_authenticated: boolean` to `WalletContext`.
The agent uses this field to decide whether to call `request_authentication`
before any auth-required points/redemption tool.

The mobile computes this at send time by checking secure storage for a
non-expired JWT keyed by wallet address. The server never sees the JWT itself —
only the boolean.

## What to do

### 1. Update `WalletContext` interface

In `agent-api/src/chat/types.ts` (or wherever `WalletContext` is defined):

```typescript
interface WalletContext {
  address:              `0x${string}`;
  chain_id:             number;
  chain_name:           string;
  chain_symbol:         string;
  label?:               string;
  points_authenticated: boolean;   // NEW — v1.1
}
```

The field is required (non-optional). If the mobile doesn't send it (old
client), default to `false`:

```typescript
const points_authenticated = wallet_context.points_authenticated ?? false;
```

### 2. Inject into system prompt

In the function that builds the wallet context section of the system prompt
(likely `buildWalletContextPrompt()` or equivalent in `chat.service.ts`):

```typescript
const authLine = points_authenticated
  ? "Points service: authenticated ✓"
  : "Points service: not authenticated — user must log in before points/redemption tools";

// Add to system prompt wallet context block:
`Active wallet: ${address} on ${chain_name}
${authLine}`
```

### 3. Update `SESSION_TTL_MS` / session typing if needed

If `session.wallet_context` type is inferred from `WalletContext`, the type
update in step 1 is sufficient. Verify no TypeScript errors from the
`points_authenticated` addition.

### 4. Update tests

If `registry.spec.ts` or `chat.service.spec.ts` creates mock `WalletContext`
objects, add `points_authenticated: false` (or `true`) to each fixture to
satisfy the updated interface.

## Acceptance criteria

- [ ] `WalletContext` interface includes `points_authenticated: boolean`.
- [ ] System prompt includes the auth status line from `wallet_context`.
- [ ] Defaults to `false` when field is absent (backwards compat with old mobile).
- [ ] No TypeScript errors.
- [ ] `pnpm test` passes.

## References

- `protocol_v1.1.md` §13 "Auth state and the request_authentication flow"
- `agent-api/src/chat/types.ts`
- `agent-api/src/chat/chat.service.ts` (system prompt builder)
