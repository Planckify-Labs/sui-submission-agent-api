# Task 15 — Optimistic UI for pending transactions

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §10 "Optimistic UI Pattern", §1 "Why Blockchain is a separate actor"
**Depends on:** Tasks 09, 10, 14

## Why this matters

A submitted transaction is not a confirmed transaction. The protocol
explicitly splits these: the server knows "the mobile said it submitted",
the blockchain knows "this is final". Mobile MUST distinguish the two
states in the UI or users will think they've been paid when they haven't
(or worse, double-spend).

## Scope

### Pending transaction state

After `executeTool()` returns `{ status: "success", tx_hash }`, immediately
render a pending-tx card in the chat thread:

```ts
interface PendingTxCard {
  tx_hash:     `0x${string}`;
  chain_id:    number;
  description: string;            // payload.meta.human_summary
  state:       "submitted" | "confirmed" | "failed";
  submitted_at: number;
  confirmed_at?: number;
  block_number?: number;
  explorer_url?: string;          // "https://polygonscan.com/tx/0x…"
}
```

The card is visible BEFORE the agent's next text message. It gives the user
immediate feedback that the action was dispatched.

### State transitions

1. **Submitted** (default after `tool_result { status: "success" }`):
   - Spinner + "Submitting to the network…"
   - Copy tx hash button
   - Tap → open explorer URL

2. **Confirmed** — reached when the agent later calls `get_transaction`
   and the tool result comes back with `tx_confirmed: true`:
   - Checkmark icon, success color
   - "Confirmed in block N"
   - Final state — no further updates

3. **Failed** — either the agent's follow-up `get_transaction` returns a
   reverted receipt, OR the executor returned `{ status: "failed" }` before
   any hash was produced:
   - Error icon, destructive color
   - Error message from `result.error` (verbatim — §7 "Honesty")

### Cross-referencing with `get_transaction`

The agent will call `get_transaction` after a write per the enforced
sequence (§7). When the mobile executes that read, it can update the
matching pending card by `tx_hash` — no separate polling logic needed.

Add a simple pub/sub or context store keyed by `tx_hash` so the
`get_transaction` executor can notify the UI without the chat thread
being aware of individual cards.

### Explorer URL

Build from `chain_id` → explorer base URL. Use the wallet's existing chain
config — do NOT hardcode URLs. If the chain has no known explorer, omit
the tap action.

### Do NOT

- Do NOT show the tx as "confirmed" based on the executor returning a hash.
  A returned hash means "RPC accepted the tx", not "the chain finalized it".
  §1 is unambiguous about this.
- Do NOT suppress the card if the submit is fast — always render it,
  even if it disappears a second later. Users want to see the state change.

## Acceptance

- [ ] After `send_native_token` succeeds, a "Submitted" card appears
      immediately with spinner + tx hash.
- [ ] When `get_transaction` later returns `tx_confirmed: true`, the same
      card flips to "Confirmed" with block number.
- [ ] Reverted tx → "Failed" with the verbatim error string.
- [ ] Tap opens the correct block explorer for the chain.
- [ ] Unknown chain → no tap action, no crash.
- [ ] Card survives navigation away from and back to the chat.
- [ ] Snapshot tests for submitted/confirmed/failed states.

## Out of scope

- Server-side tx verification (still a mobile concern).
- Retry logic (task 16).
