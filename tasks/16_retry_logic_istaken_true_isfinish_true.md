# Task 16 — Retry logic with exponential backoff for transient failures

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §10 "Retry Logic"
**Depends on:** Task 10 (executors)

## Why this matters

Blockchain RPCs fail transiently all the time — network hiccups, stale
nonces, rate limits. Blindly surfacing every failure to the agent wastes a
round-trip and a user impression. At the same time, retrying the wrong
class of error (user_declined, insufficient_funds) is worse than useless.
This task draws the line.

## Scope

### `executeToolWithRetry()`

Wraps the existing `executeTool()` (task 10) with up-to-2 automatic retries
on transient errors:

```ts
async function executeToolWithRetry(
  payload:    ToolPendingPayload,
  session:    AgentSession,
  maxRetries = 2,
): Promise<ToolResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeTool(payload, session);
    if (result.status === "success") return result;

    if (attempt < maxRetries && isRetryableError(result.error)) {
      await delay(1000 * (attempt + 1));   // 1s, then 2s
      continue;
    }
    return result;   // final failure — let agent decide
  }
}

function isRetryableError(error?: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("network")   ||
    e.includes("timeout")   ||
    e.includes("fetch failed") ||
    e.includes("nonce")     ||
    e.includes("rate limit")||
    e.includes("econnreset")
  );
}
```

### What is NOT retryable

- `user_declined` — the user said no, retrying is hostile.
- `insufficient_funds` — retrying the same amount will fail the same way.
- `wallet_type_cannot_execute` — watch-only, permanent block.
- Contract revert errors — deterministic failure, retry will revert again.
- Gas-too-low / out-of-gas — the estimator needs to be re-run, which is
  the agent's job, not the executor's.

### Write-tool caveat

Retrying a `write` after the user approved is tricky: if the FIRST attempt
was actually mined but the RPC call timed out before returning the hash,
a retry may produce a second tx. Mitigations:

- For writes, retry ONLY on pre-submission errors (`fetch failed`,
  connection errors BEFORE the signer function completed).
- Once the wallet has produced a signed tx hash, never auto-retry. The
  agent will call `get_transaction` to check finality.
- A simple heuristic: if `result.tx_hash` exists, return the result
  unchanged — never retry something that already has a hash.

### Wire into the dispatcher

Task 09's `handleToolPending` currently calls `executeTool(payload, session)`.
After this task, it should call `executeToolWithRetry(payload, session)`
for non-interactive paths (silent + preview after confirm). The approval
sheet (task 14) already commits the user — it too should use retry.

### User feedback during retry

- `silent` path: no UI change — retry happens invisibly.
- `preview` / `confirm` path: show a subtle "Retrying…" indicator on the
  pending card so the user knows why it's taking a second.

## Acceptance

- [ ] Transient `network` error retries up to twice, succeeds on retry.
- [ ] `user_declined` never retries.
- [ ] `insufficient_funds` never retries.
- [ ] A result carrying `tx_hash` is never retried, even if `status` is
      `"failed"` (fail-open to avoid double-spend).
- [ ] Backoff is 1s, then 2s.
- [ ] "Retrying…" indicator shows for preview/confirm paths.
- [ ] Unit tests for the retryable / non-retryable decision.

## Out of scope

- Server-side retry (the agent sees the final result and decides).
- Optimistic UI card (task 15).
