---
phase: 3
area: mobile
section: §12
title: Implement points read executor functions on mobile (public + auth)
---

# 15 — Points read executor functions (mobile)

## Context

`protocol_v1.1.md` §12 defines 10 read-capability tools in the `points`
category. This task implements all of them in the mobile executor layer.
The write tools (`deposit_points`, `execute_redemption`) are in task 16.
The simulate tool (`request_authentication`) is in task 17.

## Tools covered (all `capability: "read"`)

### Public (no JWT — use `publicApi`)

| Tool | Backend endpoint |
|---|---|
| `get_redemption_catalog` | `GET /api/products/grouped-by-categories` |
| `search_redemption_catalog` | `GET /api/products/search` |
| `get_product_details` | `GET /api/products/:id` |
| `get_product_input_fields` | `GET /api/products/:id/input-fields` |
| `get_points_price` | `GET /api/points/price` |

### Auth-required (JWT — use `api`)

| Tool | Backend endpoint |
|---|---|
| `get_redemption_categories` | `GET /api/products/categories` |
| `get_points_balance` | `GET /api/points/balance` |
| `get_points_history` | `GET /api/points/history` |
| `get_redemption_status` | `GET /api/redeem/:id/status` |
| `get_redemption_history` | `GET /api/redeem/history` |

## What to do

In `mobile-app/services/agent-executors/reads.ts`, add executor functions for
all 10 tools. Use the existing `pointsApi`, `redeemApi`, and `productApi`
wrappers (or the raw `api`/`publicApi` HTTP clients) — these already map to
the correct endpoints.

### Error handling

All executors MUST classify API errors before returning. Use the
`PointsApiErrorCode` type from task 18:

```typescript
try {
  const result = await pointsApi.getBalance();
  return { status: "success", data: { balance: result.balance.toString() } };
} catch (err) {
  return { status: "failed", error: classifyPointsError(err) };
}
```

### Response sanitization

All executor returns MUST be wrapped with `sanitizeApiResponse()` before
returning (implemented in task 19):

```typescript
return {
  status: "success",
  data: sanitizeApiResponse({ balance: result.balance.toString() }),
};
```

### Canonical output shapes (per spec §12)

Implement each tool's return shape exactly as specified in
`protocol_v1.1.md` §12. Key shapes:

**`get_points_balance`:**
```typescript
{ balance: string }   // current points balance, decimal string
```

**`get_points_history`:**
```typescript
{
  transactions: Array<{
    id: string; type: "DEPOSIT"|"SPEND"|"REFUND"|"BONUS";
    amount: string; balance_before: string; balance_after: string;
    status: "PENDING"|"CONFIRMED"|"COMPLETED"|"FAILED";
    token_amount?: string; token_symbol?: string; tx_hash?: string;
    created_at: string;
  }>;
  next_cursor: string | null; has_more: boolean;
}
```

**`get_product_details`:** (see spec §12 for full shape including variants + prices)

## Register in executor registry

Add all 10 tools to `EXPECTED_MOBILE_TOOLS` and the executor map.

## Acceptance criteria

- [ ] All 10 read executor functions implemented in `reads.ts`.
- [ ] Public tools use `publicApi`, auth tools use `api`.
- [ ] All returns wrapped with `sanitizeApiResponse()`.
- [ ] All API errors classified with `classifyPointsError()`.
- [ ] All 10 tool names in `EXPECTED_MOBILE_TOOLS`.
- [ ] `assertRegistryParity()` passes.

## References

- `protocol_v1.1.md` §12 "Points and Redemption system: all tools executor: mobile"
- `mobile-app/services/agent-executors/reads.ts`
- `mobile-app/api/points.ts`, `mobile-app/api/redeem.ts`, `mobile-app/api/product.ts`
