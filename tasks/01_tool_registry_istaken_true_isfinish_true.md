# Task 01 — Create central `TOOL_REGISTRY`

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §5 "Tool Classification (Central Registry)"

## Why this matters

The registry is the single source of truth that both the agent loop (task 05)
and the mobile SDK derive behavior from. Without it, the server cannot route
`executor: "server"` vs `executor: "mobile"` tools, and the mobile has no
safe default for unknown writes.

## Scope

Create `src/tools/registry.ts` exporting:

```ts
export type ToolExecutor   = "server" | "mobile";
export type ToolCapability = "read" | "simulate" | "write";
export type ToolCategory   = "blockchain_read" | "blockchain_write" | "takumipay" | "utility";

export interface ToolMeta {
  name:        string;
  category:    ToolCategory;
  executor:    ToolExecutor;
  capability:  ToolCapability;
  description: string;
}

export const TOOL_REGISTRY: Record<string, ToolMeta> = { /* … */ };
```

## Rules (non-negotiable)

- **Onchain = mobile, non-onchain = server.** No exceptions.
- `capability` is factual ("what does this do") — never `sensitivity`. UX is
  decided client-side by `ApprovalPolicy` (tasks 11–14).
- Unknown tool + `capability: "write"` → mobile must default to `confirm`.
  This is the whole reason `capability` exists in the registry.

## Tools to include

### Mobile / blockchain_read — capability `read`
`get_balance`, `get_wallet_balance`, `read_contract`, `get_transaction`,
`get_wallet_address`, `get_supported_chains`.

### Mobile / blockchain_read — capability `simulate`
`estimate_gas`.

### Mobile / blockchain_write — capability `write`
`send_native_token`, `transfer_erc20`, `write_contract`, `approve_erc20`.

### Server / takumipay — capability `read`
`get_products`, `search_products`, `get_product_prices`,
`get_latest_exchange_rate`.

### Server / takumipay — capability `simulate`
`create_booking` (reserves slot server-side, no payment yet).

### Mobile / takumipay — capability `write`
`execute_booking`, `cancel_booking`, `create_purchase`
(all trigger onchain payment → must run on mobile).

## Acceptance

- [ ] Every tool listed above is present with the exact executor/capability shown.
- [ ] No blockchain-touching tool has `executor: "server"`.
- [ ] File is a pure data module — no side effects, no imports from `src/blockchain/`.
- [ ] Unit test: `Object.values(TOOL_REGISTRY).every(t => t.name && t.category && t.executor && t.capability && t.description)`.
- [ ] Unit test: every `category: "blockchain_*"` entry has `executor: "mobile"`.

## Out of scope

- LLM tool-definition wiring (happens in task 05).
- Mobile-side executor implementations (task 10).
