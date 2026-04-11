---
phase: 1
area: server
section: §3
title: Add concrete inputSchema for all mobile tools
---

# 01 — Concrete `inputSchema` for all mobile tools

## Context

`agent-api/src/chat.service.ts#buildAllTools` currently registers every
`executor: "mobile"` tool with a fully permissive stub:

```typescript
inputSchema: jsonSchema<Record<string, unknown>>({
  type: "object",
  properties: {},
  additionalProperties: true,
})
```

This lets the LLM omit required parameters (e.g. `chain_id`) silently.
The first live test confirmed this: the agent called `get_wallet_balance`
without `chain_id`, the mobile rejected it, and the agent gave the user
a wrong apology. The spec fix is in protocol_v1.1.md §3.

## What to do

In `src/tools/registry.ts` (or wherever tool definitions live), add a
concrete `inputSchema` to **every** mobile tool in `TOOL_REGISTRY`.
Minimum requirements per tool:

- **`chain_id: integer`** MUST be required on every multi-chain tool
  (`get_balance`, `get_wallet_balance`, `get_transaction`, `estimate_gas`,
  `send_native_token`, `transfer_erc20`, `write_contract`, `approve_erc20`,
  `read_contract`).
- `amount_wei` / `value_wei` fields → `type: "string"` (base-10, see §8).
- Address fields → `pattern: "^0x[0-9a-fA-F]{40}$"`.
- Non-chain-specific read tools (`get_wallet_address`, `get_supported_chains`)
  → `required: []` is fine.

### Blockchain read tools

| Tool | Required inputs |
|---|---|
| `get_balance` / `get_wallet_balance` | `chain_id` |
| `read_contract` | `chain_id`, `contract_address`, `function_name` |
| `get_transaction` | `chain_id`, `tx_hash` |
| `estimate_gas` | `chain_id`, `to`, `value_wei` |
| `get_wallet_address` | *(none)* |
| `get_supported_chains` | *(none)* |

### Blockchain write tools

| Tool | Required inputs |
|---|---|
| `send_native_token` | `chain_id`, `to`, `value_wei` |
| `transfer_erc20` | `chain_id`, `contract_address`, `to`, `amount_wei` |
| `approve_erc20` | `chain_id`, `contract_address`, `spender`, `amount_wei` |
| `write_contract` | `chain_id`, `contract_address`, `function_name`, `args` |

## Acceptance criteria

- [ ] Every mobile tool in `TOOL_REGISTRY` has a non-stub `inputSchema`
      with typed properties.
- [ ] `chain_id` is in `required[]` for all multi-chain tools.
- [ ] `pnpm test` passes (update `registry.spec.ts` expected fixtures if needed).
- [ ] Do NOT change tool descriptions or executor assignments.

## References

- `protocol_v1.1.md` §3 "Mobile tool input schemas — required + transitional fallback"
- `agent-api/src/chat.service.ts#buildAllTools`
- `agent-api/src/tools/registry.ts`
