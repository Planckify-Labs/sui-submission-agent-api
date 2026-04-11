---
phase: 3
area: mobile
section: §14-A, §14-D
title: API response sanitization + points error classification
---

# 18 — API response sanitization + `classifyPointsError()` (mobile)

## Context

`protocol_v1.1.md` §14 Guard A requires the mobile to sanitize TakumiPay API
responses before returning them as tool results (prompt injection risk). §14
Guard D requires a typed `PointsApiErrorCode` enumeration so the agent can
respond intelligently to different failure modes.

Both are shared utilities used by all 13 points executor functions.

## Part A: `sanitizeApiResponse()`

In `mobile-app/services/agent-executors/utils.ts` (create if it doesn't exist):

```typescript
const INJECTION_PATTERNS = [
  /ignore (previous|all) instructions/i,
  /system:\s/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
];

export function sanitizeApiResponse<T>(data: T): T {
  const json = JSON.stringify(data);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(json)) {
      console.warn(
        "[SECURITY] Prompt injection pattern detected in API response — blocked"
      );
      // Return a safe stub instead of potentially malicious data
      return { error: "response_blocked_security" } as unknown as T;
    }
  }

  return data;
}
```

Apply `sanitizeApiResponse()` in **all** points executor returns — both reads
and writes. This is the call site pattern:

```typescript
return {
  status: "success",
  data: sanitizeApiResponse(rawApiData),
};
```

## Part B: `classifyPointsError()`

In the same `utils.ts` file:

```typescript
export type PointsApiErrorCode =
  | "authentication_required"   // 401 — JWT expired, silent refresh failed
  | "authorization_denied"      // 403 — account lacks permission
  | "insufficient_points"       // balance too low for redemption
  | "product_unavailable"       // product/variant no longer active
  | "redemption_failed"         // vendor failure after points deducted (REFUNDED)
  | "deposit_failed"            // on-chain tx OK but API rejected deposit
  | "rate_limited"              // 429 — too many requests
  | "service_unavailable"       // 503 — backend down
  | "network_error"             // fetch/timeout, no HTTP response
  | "unknown_error";            // anything else

export function classifyPointsError(err: unknown): PointsApiErrorCode {
  if (!err || typeof err !== "object") return "unknown_error";

  const status = (err as any).response?.status;
  const message = (err as any).message ?? "";
  const code = (err as any).response?.data?.code;

  if (status === 401) return "authentication_required";
  if (status === 403) return "authorization_denied";
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";

  if (code === "INSUFFICIENT_POINTS" || message.includes("insufficient"))
    return "insufficient_points";
  if (code === "PRODUCT_UNAVAILABLE" || status === 404)
    return "product_unavailable";
  if (code === "REDEMPTION_FAILED" || code === "REFUNDED")
    return "redemption_failed";
  if (code === "DEPOSIT_FAILED")
    return "deposit_failed";

  if (!status && (message.includes("network") || message.includes("timeout")))
    return "network_error";

  return "unknown_error";
}
```

### Usage in executors

```typescript
try {
  const result = await pointsApi.getBalance();
  return { status: "success", data: sanitizeApiResponse({ balance: result.balance }) };
} catch (err) {
  return { status: "failed", error: classifyPointsError(err) };
}
```

## Additional note on PII

Points and redemption API responses may contain user PII:
- Order history with phone numbers (from `customer_info`)
- Voucher codes
- Transaction amounts and balances

The `sanitizeApiResponse()` function protects against prompt injection.
The data itself is passed to the agent server as a tool result (which is
correct per the protocol) — the server must not persist it (task 14).

## Acceptance criteria

- [ ] `sanitizeApiResponse()` implemented and exported from `utils.ts`.
- [ ] `classifyPointsError()` implemented and exported from `utils.ts`.
- [ ] All 13 points executor functions (tasks 15, 16, 17) use both utilities.
- [ ] Injection pattern detection logs a warning and returns safe stub.
- [ ] Error classification covers all `PointsApiErrorCode` variants.
- [ ] No TypeScript errors.

## References

- `protocol_v1.1.md` §14 Guard A "TakumiPay API response sanitisation"
- `protocol_v1.1.md` §14 Guard D "Points API error classification"
- `mobile-app/services/agent-executors/utils.ts` (create)
- Tasks 15, 16, 17 (consumer of these utilities)
