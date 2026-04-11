---
phase: 3
area: server
section: §12
title: Add 13 points tools to TOOL_REGISTRY + rename takumipay → points — ATOMIC with task 11
---

# 12 — Points & Redemption tools in `TOOL_REGISTRY` (server)

> **MUST land atomically with task 11.** See task 11 for the constraint.

## Context

After task 11 removes the server-side TakumiPay tools, this task re-adds the
full points/redemption suite as `executor: "mobile"` tools and renames the
`takumipay` category to `points`.

All 13 new tools + `request_authentication` are mobile-executed — the server
is a reasoning engine only and never touches user credentials.

## What to do

### 1. Rename `ToolCategory`

```typescript
// Before
export type ToolCategory = 'blockchain_read' | 'blockchain_write' | 'takumipay' | 'utility';

// After
export type ToolCategory = 'blockchain_read' | 'blockchain_write' | 'points' | 'utility';
```

Update all usages in `registry.ts` and anywhere else `'takumipay'` appears
as a category value.

### 2. Remove purchase tools from server `TOOL_REGISTRY` only

Remove from `TOOL_REGISTRY` and their `human_summary` cases from
`human-summary.ts`:
- `execute_booking`
- `cancel_booking`
- `create_purchase`

**Scope: server-side only.** Do NOT touch any mobile code — the executor
functions, API wrappers, and hooks backing the purchase system on the
mobile are left exactly as-is. The mobile purchase system is intentionally
preserved for future re-activation once the regulatory landscape is clear.

### 3. Add 13 new `points` category tools

Add to `TOOL_REGISTRY` with `category: "points"`, `executor: "mobile"`:

| Tool | Capability |
|---|---|
| `get_redemption_categories` | read |
| `get_redemption_catalog` | read |
| `search_redemption_catalog` | read |
| `get_product_details` | read |
| `get_product_input_fields` | read |
| `get_points_price` | read |
| `get_points_balance` | read |
| `get_points_history` | read |
| `deposit_points` | write |
| `execute_redemption` | write |
| `get_redemption_status` | read |
| `get_redemption_history` | read |
| `request_authentication` | simulate |

Full descriptions and input schemas for each tool are defined in
`protocol_v1.1.md` §12 and §13. Use the spec as the source of truth.

### 4. Add `buildHumanSummary` cases

Required non-empty summaries:
```typescript
case "deposit_points":
  return `Deposit ${input.token_amount} ${input.token_symbol} for ~${input.expected_points} points`;
case "execute_redemption":
  return `Redeem ${input.product_name} for ${input.points_cost} points`;
case "request_authentication":
  return "Log in to TakumiPay";
```

All 10 read tools + `get_redemption_categories`: return a stub string
(required by registry test, never displayed to users):
```typescript
case "get_redemption_categories":
  return "Fetch redemption categories";
// ... etc
```

### 5. Add points/redemption agent rules to system prompt

From `protocol_v1.1.md` §12 and §13, add to the agent system prompt:

> **Points authentication.** Before calling any auth-required points tool,
> check `wallet_context.points_authenticated`. If false, call
> `request_authentication` first.
>
> **Redemption flow.** Always: (1) check balance, (2) show variants,
> (3) collect input fields if `input_type != null`, (4) execute redemption.
>
> **Never assume variant or price.** Present options and wait for user choice.
>
> **Never poll in a loop.** Call `get_redemption_status` once; if still
> processing, tell user to ask again later.
>
> **Points balance pre-check.** ALWAYS call `get_points_balance` before
> `execute_redemption`. Do NOT call it if balance is known insufficient.

### 6. Update tests

In `registry.spec.ts`:
- Replace `'takumipay'` with `'points'` in `validCategories`.
- Remove `execute_booking`, `cancel_booking`, `create_purchase` from the expected fixture.
- Add the 13 new tools (+ `request_authentication`) to the expected fixture.

In `human-summary.spec.ts`:
- Remove test cases for `execute_booking`, `cancel_booking`, `create_purchase`.
- Add test cases for `deposit_points`, `execute_redemption`, `request_authentication`.

Verify `pnpm test` passes.

## Migration checklist

- [ ] `ToolCategory` renamed `takumipay` → `points`
- [ ] `execute_booking`, `cancel_booking`, `create_purchase` removed from `TOOL_REGISTRY` and `human-summary.ts` (server only — mobile code untouched)
- [ ] 13 new `points` tools added to `TOOL_REGISTRY` with full inputSchemas
- [ ] `buildHumanSummary()` cases added for all new tools
- [ ] Agent system prompt updated with points/auth rules
- [ ] `registry.spec.ts` updated (purchase tools removed; 13 new tools added)
- [ ] `human-summary.spec.ts` updated (purchase cases removed; new cases added)
- [ ] `pnpm test` passes

## References

- `protocol_v1.1.md` §12 "Points and Redemption system: all tools executor: mobile"
- `protocol_v1.1.md` §13 "Auth state and request_authentication flow"
- `agent-api/src/tools/registry.ts`
- `agent-api/src/tools/human-summary.ts`
