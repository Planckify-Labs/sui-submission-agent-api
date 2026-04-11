---
phase: 1
area: mobile
section: §3
title: chain_id fallback to wallet_context.chain_id in executors
---

# 08 — `chain_id` fallback to `wallet_context.chain_id` in mobile executors

## Context

`protocol_v1.1.md` §3 documents a transitional fallback: while the server's
tool `inputSchema` stubs don't yet enforce `chain_id` as required, the mobile
MAY fall back to `wallet_context.chain_id` when a tool input omits `chain_id`.

This prevents the LLM from silently breaking single-chain workflows just
because it didn't include `chain_id` in its tool call. Once task 01
(concrete input schemas) ships and the LLM always includes `chain_id`, this
fallback becomes dead code and should be removed in v1.2.

## What to do

In `mobile-app/services/agent-executors/types.ts`, add or verify the
`resolveChainId()` helper:

```typescript
export function resolveChainId(
  input: { chain_id?: number },
  context: ExecutorContext
): number {
  return input.chain_id ?? context.activeChainId;
}
```

Apply `resolveChainId(input, context)` in every executor that needs a
`chain_id`:

- `get_balance` / `get_wallet_balance`
- `read_contract`
- `get_transaction`
- `estimate_gas`
- `send_native_token`
- `transfer_erc20`
- `approve_erc20`
- `write_contract`

**Do NOT silently fall back on writes without showing the resolved chain in
the approval sheet's `human_summary`.** The `human_summary` must include the
chain name/id so the user can verify they're on the right chain before signing.

## Open question from spec

The protocol asks: should `capability: "write"` tools be excluded from the
fallback? The risk is a write landing on the wrong chain silently. Current
decision: allow the fallback on writes, but the approval sheet MUST display
the resolved chain so the user has a final escape. Flag for v1.2 review.

## Acceptance criteria

- [ ] `resolveChainId(input, context)` exists and is used in all
      multi-chain executor functions.
- [ ] `context.activeChainId` is set from `wallet_context.chain_id` when
      building `ExecutorContext`.
- [ ] Write tools' `human_summary` includes the resolved chain name.
- [ ] Once task 01 (concrete schemas) is complete, add a TODO comment to
      `resolveChainId()`: "// Remove fallback in v1.2 when all schemas require chain_id".

## References

- `protocol_v1.1.md` §3 "Mobile tool input schemas — required + transitional fallback"
- `mobile-app/services/agent-executors/types.ts`
- `mobile-app/services/agent-executors/reads.ts`
- `mobile-app/services/agent-executors/writes.ts`
