---
phase: 3
area: mobile
section: §12, §14
title: Implement deposit_points + execute_redemption write executors on mobile
---

# 16 — Points write executors: `deposit_points` + `execute_redemption` (mobile)

## Context

`protocol_v1.1.md` §12 defines two `capability: "write"` tools in the `points`
category. Both trigger irreversible operations and go through the approval
sheet UI. This task implements both executors in the mobile.

## Tool 1: `deposit_points`

**Endpoint:** `POST /api/points/deposit` (after on-chain tx)
**Flow:** blockchain tx → API deposit registration → poll until terminal state

### Input (from agent)
```typescript
{
  token_symbol:    string;   // e.g. "IDRX"
  token_amount:    string;   // human-readable, e.g. "100"
  chain_id?:       number;
  expected_points: string;   // display hint only — mobile re-validates via live rate
}
```

### Implementation steps

```typescript
deposit_points: async (input, context) => {
  const chainId = resolveChainId(input, context);

  // 1. Look up token from blockchain registry
  const blockchain = context.blockchains[chainId];
  const token = blockchain.tokens.find(
    t => t.symbol.toLowerCase() === input.token_symbol.toLowerCase()
  );
  if (!token) return { status: "failed", error: "product_unavailable" };

  // 2. Re-fetch current rate (Guard E — do NOT use input.expected_points)
  const priceInfo = await pointsApi.getPointPrice({
    token_id: token.id,
    currency: "IDR",
  });
  const computedExpectedPoints = computeExpectedPoints(
    input.token_amount,
    priceInfo.points_per_token
  );

  // If >1% discrepancy, show to user in approval sheet before proceeding.
  // This is handled via the human_summary / approval mechanism.

  // 3. Execute on-chain transfer
  const txHash = await executeBlockchainTransfer({
    context, chainId, token,
    amount: parseUnits(input.token_amount, token.decimals),
    to: TAKUMI_DEPOSIT_ADDRESS[chainId],
  });

  // 4. Register deposit with API
  const refId = crypto.randomUUID();
  const deposit = await pointsApi.submitDeposit({
    refId,
    txHash,
    tokenId:          token.id,
    blockchainId:     blockchain.id,
    contractAddress:  token.address,
    walletAddress:    context.walletAddress,
    tokenAmount:      input.token_amount,
    expectedPoints:   computedExpectedPoints,
  });

  // 5. Poll until terminal state
  const result = await pollDepositStatus(deposit.id);

  return {
    status: "success",
    data: sanitizeApiResponse({
      deposit_id:      result.id,
      status:          result.status,
      points_received: result.pointsReceived?.toString() ?? "0",
      tx_hash:         txHash,
    }),
  };
},
```

## Tool 2: `execute_redemption`

**Endpoint:** `POST /api/redeem/execute` + poll `GET /api/redeem/:id/status`
**Flow:** API redemption call → poll up to 4 times for voucher delivery

### Input (from agent)
```typescript
{
  product_variant_id: string;
  product_price_id:   string;
  customer_info:      Record<string, string>;
  product_name:       string;   // for human_summary
  points_cost:        string;   // for human_summary
}
```

### Implementation steps

```typescript
execute_redemption: async (input, context) => {
  // 1. Execute redemption
  const redemption = await redeemApi.execute({
    productVariantId: input.product_variant_id,
    productPriceId:   input.product_price_id,
    customerInfo:     input.customer_info,
  });

  // 2. Poll for voucher delivery (up to 4 retries, 3s interval)
  // Use existing useRedeem polling logic
  let finalResult = redemption;
  if (redemption.status === "PROCESSING" || !redemption.voucherCode) {
    finalResult = await pollRedemptionForVoucher(redemption.id, {
      maxRetries: 4,
      intervalMs: 3000,
    });
  }

  return {
    status: "success",
    data: sanitizeApiResponse({
      redemption_id: finalResult.id,
      status:        finalResult.status,
      points_spent:  finalResult.pointsSpent.toString(),
      voucher_code:  finalResult.voucherCode ?? null,
      vendor_ref_id: finalResult.vendorRefId ?? null,
    }),
  };
},
```

**Guard C:** If `status === "PROCESSING"` after all retries, return it as-is.
The agent tells the user to check their history later.

**Guard B:** The agent must have called `get_points_balance` first — the
executor does NOT need to recheck (agent system prompt enforces this).

## Error handling

Both executors MUST use `classifyPointsError()` (from task 18).
Apply `sanitizeApiResponse()` on all returns.

## Register in executor registry

Add both to `EXPECTED_MOBILE_TOOLS` and executor map.

## Acceptance criteria

- [ ] `deposit_points`: blockchain tx → API deposit → poll → terminal state.
- [ ] `deposit_points`: re-fetches live rate (does NOT trust `input.expected_points`).
- [ ] `execute_redemption`: calls API → polls up to 4 times for voucher.
- [ ] `execute_redemption`: returns `status: "PROCESSING"` if still pending after retries.
- [ ] Both return `sanitizeApiResponse()`-wrapped data.
- [ ] Both use `classifyPointsError()` for error handling.
- [ ] Both added to `EXPECTED_MOBILE_TOOLS`.

## References

- `protocol_v1.1.md` §12 "`deposit_points`" and "`execute_redemption`"
- `protocol_v1.1.md` §14 Guard B (balance pre-check) and Guard E (rate verification)
- `protocol_v1.1.md` §14 Guard C (redemption lifecycle)
- `mobile-app/services/agent-executors/writes.ts`
- `mobile-app/api/points.ts`, `mobile-app/api/redeem.ts`
