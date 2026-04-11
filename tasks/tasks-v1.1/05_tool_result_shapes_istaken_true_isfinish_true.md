---
phase: 1
area: server + mobile
section: §6, §8
title: Codify canonical ToolResult.data shapes + BigInt encoding rule
---

> **NOTE: server portion only — mobile `safeSerialize()` work remains.**
> The server-side TypeScript `ToolResult.data` shape types have been added
> (`src/tools/result-shapes.ts`) and the registry references them. The mobile
> executor `safeSerialize()` application (§"Mobile — verify BigInt
> serialization" below) is still outstanding and must be tracked separately.

# 05 — Canonical `ToolResult.data` shapes + BigInt encoding

## Context

`protocol_v1.1.md` §6 observes that v1.0 typed `ToolResult.data` as `unknown`,
leaving each executor to invent its own shape. §8 further notes that JSON
cannot carry `bigint` values (EVM uint256), yet v1.0 was silent on encoding.

The reference mobile executors already emit the correct shapes and serialize
bigints as base-10 strings. This task codifies those shapes as normative spec
and adds a `safeSerialize()` / `BigInt(str)` contract to `AGENT_PROTOCOL.md`.

## What to do

### Server — add TypeScript types for ToolResult.data shapes

In `agent-api/src/chat/types.ts` (or a new `src/tools/result-shapes.ts`), add
types that document the canonical shape for each tool's `data` field. These are
for documentation/tooling — the server hands the data directly to the LLM, so
it doesn't need to validate it, but having the types prevents drift:

```typescript
// get_balance / get_wallet_balance
export type GetBalanceResult = {
  address: string;
  chain_id: number;
  balance_wei: string;   // base-10 string
};

// get_transaction (confirmed)
export type GetTransactionResult =
  | { chain_id: number; status: "success" | "reverted"; block_number: string;
      gas_used: string; from: string; to: string | null }
  | { chain_id: number; pending: true; from: string; to: string | null; value_wei: string };

// get_wallet_address
export type GetWalletAddressResult = { address: string };

// get_supported_chains
export type GetSupportedChainsResult = {
  chains: Array<{
    chain_id: number; name: string; native_symbol: string;
    native_decimals: number; rpc_url: string; block_explorer: string | null;
  }>;
};

// estimate_gas
export type EstimateGasResult = { chain_id: number; gas_wei: string };

// read_contract
export type ReadContractResult = {
  chain_id: number; contract_address: string; function_name: string; result: unknown;
};

// get_wallet_tokens — added in task 09
// points tools — added in task 12
```

Add a comment to the `TOOL_REGISTRY` (or `AGENT_PROTOCOL.md` update notes):
> Tool result shapes are normative as of v1.1. Changes require a protocol version bump.

### Mobile — verify BigInt serialization

In `mobile-app/services/agent-executors/reads.ts` (and writes.ts), verify
that all `*_wei`, `block_number`, `gas_used`, and bigint `read_contract`
results are converted to base-10 strings before being returned as tool results.

The reference implementation uses `safeSerialize()`. If it doesn't exist,
implement it:

```typescript
function safeSerialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(safeSerialize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, safeSerialize(v)])
    );
  }
  return value;
}
```

Apply to all executor return values that may contain bigints:
- `get_balance` / `get_wallet_balance` → `balance_wei`
- `get_transaction` → `block_number`, `gas_used`, `value_wei`
- `estimate_gas` → `gas_wei`
- `read_contract` → `result` (may be nested)

## Acceptance criteria

- [ ] TypeScript types for canonical `ToolResult.data` shapes exist in server
      codebase (documentation/tooling purpose).
- [ ] `safeSerialize()` (or equivalent) is applied in all mobile executor
      functions that return bigint-containing values.
- [ ] All `*_wei`, `block_number`, `gas_used` fields are base-10 strings in
      actual executor output.
- [ ] `pnpm test` passes on both server and mobile.

## References

- `protocol_v1.1.md` §6 "Tool result data shapes"
- `protocol_v1.1.md` §8 "BigInt on the wire"
- `mobile-app/services/agent-executors/reads.ts`
- `mobile-app/services/agent-executors/writes.ts`
