---
phase: 3
area: server
section: §11
title: Remove executor:server TakumiPay tools from server MCP — ATOMIC with task 12
---

# 11 — Remove `executor: "server"` TakumiPay tools from server MCP

> **MUST land atomically with task 12.** Deploying §11 alone leaves three
> orphaned mobile TakumiPay write tools (`execute_booking`, `cancel_booking`,
> `create_purchase`) with no server tools to pair with. §11 + §12 must be
> a single coordinated release.

## Context

The server's MCP subprocess (`src/mcp/server.ts`) exposes TakumiPay product
integration: `get_products`, `search_products`, `get_product_prices`,
`get_latest_exchange_rate`, and `create_booking` — all `executor: "server"`.

These are being removed because:
1. The server uses a shared API key, not per-user credentials.
2. The MCP subprocess should be domain-agnostic.

These tools are re-added as `executor: "mobile"` in task 12 (points category).

## What to remove

### `src/mcp/tools/`
- Delete `products.tool.ts`
- Delete `exchange-rate.tool.ts`
- Delete `token-contract.tool.ts`

### `src/mcp/server.ts` and `src/mcp/tools/index.ts`
- Remove `takumiPayProductTools`, `exchangeRateTools`, `tokenContractTools` registrations
- Remove `initializeTakumiPayService` bootstrap call
- Strip `TakumiPayService` from `createToolHandlers`

### `src/tools/registry.ts`
Remove these five `executor: "server"` entries:
- `get_products`
- `search_products`
- `get_product_prices`
- `get_latest_exchange_rate`
- `create_booking`

**Do NOT remove** the existing `executor: "mobile"` entries
(`execute_booking`, `cancel_booking`, `create_purchase`) — they are removed
in task 12, not here, to keep the migration atomic.

**Do NOT remove** `'takumipay'` from `ToolCategory` yet — wait for task 12
which renames it to `'points'` atomically.

### `src/tools/human-summary.ts`
Remove `case` blocks for `create_booking`. Leave `execute_booking`,
`cancel_booking`, `create_purchase` — they are removed in task 12.

### `src/tools/human-summary.spec.ts`
Remove test cases for `create_booking` and the other removed server tools.

## What to keep (bare MCP template)

The MCP subprocess MUST still boot and handle `ListTools` / `CallTool`
requests. Retain:
- `owner` tool — zero-dependency smoke test.
- `calculator` tool — shows input validation and structured results.

These legacy tools MUST NOT appear in `TOOL_REGISTRY` — they are diagnostic
tools, not agent tools.

## Tests

In `src/tools/registry.spec.ts`:
- Remove the five server entries from the `expected` fixture.
- Keep `'takumipay'` in `validCategories` (until task 12 renames it).

In `src/chat/chat.service.spec.ts`:
- Remove tests that rely on the server-side TakumiPay tools being called.

Verify `pnpm test` passes before committing.

## Migration checklist

- [ ] Delete `products.tool.ts`, `exchange-rate.tool.ts`, `token-contract.tool.ts`
- [ ] Remove TakumiPay imports/bootstrap from `src/mcp/server.ts` and
      `src/mcp/tools/index.ts`
- [ ] Remove five `executor: "server"` entries from `registry.ts`
- [ ] Remove `create_booking` case from `human-summary.ts`
- [ ] Update `registry.spec.ts` (remove 5 entries; keep `takumipay` category)
- [ ] Update `chat.service.spec.ts`
- [ ] Verify MCP subprocess still boots and returns `owner` + `calculator` tools
- [ ] `pnpm test` passes

## References

- `protocol_v1.1.md` §11 "Remove TakumiPay MCP server tools"
- `agent-api/src/mcp/server.ts`
- `agent-api/src/tools/registry.ts`
- `agent-api/src/tools/human-summary.ts`
