# Task 08 — Strip blockchain tools from internal MCP server, keep TakumiPay only

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §3 "The Two Surfaces", §14 item 8
**Depends on:** Task 01 (registry), Task 05 (agent loop)

## Why this matters

The server's MCP tool surface is now **non-onchain only**. Every blockchain
tool becomes an `executor: "mobile"` entry in `TOOL_REGISTRY` and is routed
through `tool_pending` → `POST /chat/respond` instead of running inside the
server-spawned MCP subprocess. Leaving the blockchain tools in the MCP
server would cause the agent to see duplicate tool names — one server-side
and one mobile-routed.

## Scope

In `src/mcp/server.ts` and `src/mcp/tools/`:

### Delete

- All blockchain read tool handlers: `get_balance`, `read_contract`,
  `get_transaction`, `get_supported_chains`, `get_wallet_address`.
- All wallet-write tool handlers: `send_native_token`, `write_contract`,
  `estimate_gas`, any ERC20 transfer tool the server was running.
- Any tool that receives `blockchainService` or `walletService` from the
  handler factory in `src/mcp/tools/index.ts`.

### Keep

- TakumiPay tools: product catalog, search, variants, pricing, exchange
  rates, `create_booking` (server-side slot reservation).
- Any future off-chain HTTP tools (none currently).

### Update

- `src/mcp/tools/index.ts` → `createToolHandlers()` factory: drop the
  `{ blockchainService, walletService, chainRegistry }` injection. The
  factory should only receive `{ takumiPayService }`.
- `src/mcp-client.service.ts` → remove env-var propagation for
  `AGENT_WALLET_PRIVATE_KEY` (see task 07).
- `src/mcp/response-transformer.ts` → drop any field-filtering cases that
  exist only for blockchain responses. Keep TakumiPay filters.

## Migration rule

For each blockchain tool removed, verify it exists in `TOOL_REGISTRY`
(task 01) with `executor: "mobile"`. If it does not, add it first — deleting
before registering would briefly break the agent.

## Acceptance

- [ ] `src/mcp/server.ts` serves only TakumiPay tools when listed via MCP.
- [ ] `test:mcp` (existing suite) passes with the trimmed tool set.
- [ ] No remaining import of `src/blockchain/*` from `src/mcp/`.
- [ ] Every previously-server-side blockchain tool has a registry entry
      with `executor: "mobile"`.
- [ ] Agent loop (task 05) calls `executor: "server"` for TakumiPay reads
      only, and `executor: "mobile"` for everything blockchain-related.
- [ ] Integration test: chat turn that used to use the server-side
      `get_balance` now emits `tool_pending` and waits for mobile.

## Out of scope

- Deleting `src/blockchain/` itself (task 07 — must come after this one).
