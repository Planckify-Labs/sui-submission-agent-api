# Task 10 — Mobile executor registry for all `executor: "mobile"` tools

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §10 "Example Executors"
**Depends on:** Task 09 (SSE dispatcher calls `executeTool()`)

## Why this matters

Every tool with `executor: "mobile"` needs a concrete function that
actually talks to the chain via viem. This registry is the mobile
counterpart to the server's `TOOL_REGISTRY`. Without it, `handleToolPending`
has nothing to dispatch to.

## Scope

Create a `MobileToolExecutor` contract and register one per mobile tool:

```ts
type MobileToolExecutor = (
  input:  Record<string, unknown>,
  wallet: WalletClient,
) => Promise<ToolResult>;

interface ToolResult {
  status:        "success" | "failed";
  tx_hash?:      `0x${string}`;
  tx_confirmed?: boolean;
  data?:         unknown;
  error?:        string;
}
```

### Executors to implement

Read (silent — use `publicClient`, not `wallet`):

- `get_balance` — `publicClient.getBalance({ address })`
- `get_wallet_balance` — connected wallet balance on active chain
- `read_contract` — `publicClient.readContract({ ... })`
- `get_transaction` — `publicClient.getTransactionReceipt({ hash })`
- `get_wallet_address` — returns `wallet.account.address`
- `get_supported_chains` — returns the wallet's configured chain list

Simulate:

- `estimate_gas` — `publicClient.estimateGas({ ... })`, return wei as string

Write (confirm required upstream):

- `send_native_token` — native gas-token transfer (§10 sample)
- `transfer_erc20` — ERC20 `transfer()` (§10 sample)
- `write_contract` — generic `writeContract({ abi, functionName, args })`
- `approve_erc20` — ERC20 `approve(spender, amount)`
- `execute_booking` — TakumiPay on-chain payment call
- `cancel_booking` — on-chain refund/cancel
- `create_purchase` — direct on-chain purchase

### Chain routing

Every mobile tool input includes `chain_id: number`. Use it to select the
right viem client from a per-chain client cache. Do NOT assume the active
chain — the agent may target a different chain for parallel reads (§3).

### BigInt serialization

The server always sends BigInts as strings (`value_wei: "500000000000000000"`).
Parse with `BigInt(input.value_wei)` inside each executor. Never trust the
server to send an actual JS BigInt.

### Error handling

Every executor wraps its implementation in try/catch and returns
`{ status: "failed", error: String(err) }` on throw. Never let an executor
reject — the SSE dispatcher relies on the returned object shape.

Optionally, executors can return richer reasons the server understands:
`insufficient_funds`, `network_error`. These become `tool_rejected.reason`
values that the agent reads (§9 "What the Agent Sees Per Outcome").

## Acceptance

- [ ] Every `executor: "mobile"` tool from `TOOL_REGISTRY` has an executor.
- [ ] `chain_id` routing works — tool calls with different `chain_id`
      values hit different RPCs.
- [ ] All `_wei` inputs parsed via `BigInt()`.
- [ ] No executor throws — failures always return `{ status: "failed" }`.
- [ ] Integration test: `send_native_token` on a local Anvil fork returns
      a tx hash that the public client can look up.

## Out of scope

- Approval UX (tasks 13 + 14).
- Grant storage (task 11).
