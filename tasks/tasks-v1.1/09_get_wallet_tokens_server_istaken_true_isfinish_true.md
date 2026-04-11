---
phase: 2
area: server
section: §4
title: Register get_wallet_tokens in TOOL_REGISTRY
---

# 09 — Register `get_wallet_tokens` in `TOOL_REGISTRY` (server)

## Context

The agent currently has no way to resolve a token symbol (e.g. "IDRX") to its
contract address on a given chain. The agent was guessing contract addresses and
failing — `protocol_v1.1.md` §4 adds `get_wallet_tokens` to fix this.

This task covers only the **server-side** registration. The mobile executor is
in task 10.

## What to do

In `agent-api/src/tools/registry.ts`, add `get_wallet_tokens` to `TOOL_REGISTRY`:

```typescript
get_wallet_tokens: {
  name:       "get_wallet_tokens",
  category:   "blockchain_read",
  executor:   "mobile",
  capability: "read",
  description:
    "Return the list of tokens the wallet knows about for a given chain, " +
    "optionally filtered by symbol, stablecoin status, or native-currency " +
    "status, with optional live balances. Use this to resolve a token symbol " +
    "(e.g. 'IDRX', 'USDT') to its contract address on the active chain before " +
    "calling transfer_erc20 or read_contract. Use is_stable_coin: true to " +
    "answer questions about the user's stablecoin holdings.",
  inputSchema: {
    type: "object",
    properties: {
      chain_id: {
        type: "integer",
        description: "Chain to list tokens for. Defaults to wallet_context.chain_id.",
      },
      include_balance: {
        type: "boolean",
        description: "If true, resolve live balances via the mobile public client.",
      },
      symbol: {
        type: "string",
        description: "Optional filter: only return tokens whose symbol matches (case-insensitive prefix or exact match).",
      },
      is_stable_coin: {
        type: "boolean",
        description:
          "If true, return only stablecoin tokens (USDT, USDC, IDRX, DAI). " +
          "If false, return only non-stablecoin tokens. Omit to return all.",
      },
      is_native_currency: {
        type: "boolean",
        description:
          "If true (default), include the chain's native currency (ETH, MATIC, …). " +
          "If false, exclude it.",
      },
    },
    required: [],
  },
},
```

### Add `buildHumanSummary` stub

In `agent-api/src/tools/human-summary.ts`, add a stub case:
```typescript
case "get_wallet_tokens":
  return "Fetch wallet token list";
```

(Read tools always need a stub for the registry test, even though they are
never displayed to the user.)

### Add agent guidance to system prompt

In the agent system prompt (§7), add the token discovery rules from the spec:

> **Token discovery.** Before calling `transfer_erc20`, `approve_erc20`,
> or a `read_contract` that targets a known token, call `get_wallet_tokens`
> to resolve the symbol → contract address. NEVER hardcode or guess a token
> contract address. If the token is not in the result, tell the user and ask
> for the contract address explicitly.
>
> **Stablecoin queries.** When the user asks about stablecoin holdings, call
> `get_wallet_tokens` with `is_stable_coin: true` and `include_balance: true`.

### Update tests

In `src/tools/registry.spec.ts`:
- Add `get_wallet_tokens` to the expected tool list.
- Verify category is `blockchain_read`, executor is `mobile`, capability is `read`.

## Acceptance criteria

- [ ] `get_wallet_tokens` appears in `TOOL_REGISTRY` with full `inputSchema`.
- [ ] `buildHumanSummary("get_wallet_tokens")` returns a non-empty string.
- [ ] Token discovery rules added to agent system prompt.
- [ ] `pnpm test` passes.

## References

- `protocol_v1.1.md` §4 "New tool: get_wallet_tokens"
- `protocol_v1.1.md` §11 "Add `is_stable_coin` and `is_native_currency` filter extensions"
- `agent-api/src/tools/registry.ts`
- `agent-api/src/tools/human-summary.ts`
