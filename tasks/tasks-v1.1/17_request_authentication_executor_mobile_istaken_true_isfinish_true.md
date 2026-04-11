---
phase: 3
area: mobile
section: §13
title: Implement request_authentication executor + points_authenticated context field
---

# 17 — `request_authentication` executor + `points_authenticated` in `WalletContext` (mobile)

## Context

`protocol_v1.1.md` §13 defines `request_authentication` — a `capability: "simulate"`
tool that shows the login UI when the agent detects the user is unauthenticated
for points/redemption operations. The mobile also needs to compute and send
`points_authenticated: boolean` in every `POST /chat` `wallet_context`.

## Part A: `request_authentication` executor

In `mobile-app/services/agent-executors/simulate.ts`, add:

```typescript
request_authentication: async (_input, context) => {
  // Show SIWE or credentials login UI
  // This is a UI-interactive tool — the executor must await the user's action.
  try {
    const result = await context.showLoginUI({
      walletAddress: context.walletAddress,
    });

    if (result.success) {
      // Store JWT + refresh token in secure storage keyed by wallet address
      await storeAuthTokens(context.walletAddress, result.tokens);
      return {
        status: "success",
        data: { success: true },
      };
    } else {
      return {
        status: "success",   // tool ran correctly — user just declined
        data: {
          success: false,
          error: result.error ?? "user_cancelled",
        },
      };
    }
  } catch (err) {
    return {
      status: "success",   // still "success" at tool level
      data: { success: false, error: "network_error" },
    };
  }
},
```

**IMPORTANT:** Return `status: "success"` even when the user cancels.
The tool itself ran correctly — the login outcome is in `data.success`.
Using `status: "failed"` would cause the agent loop to treat it as a
tool execution error, not a user decision.

### Possible `data.error` values
- `"user_cancelled"` — user dismissed the login sheet
- `"network_error"` — login network request failed
- `"wallet_mismatch"` — signed address doesn't match wallet address

### Integration with approval UX

`request_authentication` has `capability: "simulate"` → the mobile shows
a preview sheet (`ApprovalPolicy: "preview"`) before triggering the login UI.
The sheet text comes from `human_summary: "Log in to TakumiPay"`. The user
initiates the actual login by interacting with the preview sheet.

## Part B: `points_authenticated` in `WalletContext`

When building the `POST /chat` request body in `AgentMode.tsx` or wherever
`wallet_context` is assembled:

```typescript
// Check secure storage for a non-expired JWT for this wallet address
const isAuthenticated = await checkPointsAuth(activeWallet.address);

const wallet_context: WalletContext = {
  address:              activeWallet.address,
  chain_id:             activeChain.chainId,
  chain_name:           activeChain.name,
  chain_symbol:         activeChain.nativeSymbol,
  points_authenticated: isAuthenticated,   // NEW
};
```

`checkPointsAuth()` is a local check — reads from secure storage, validates
token expiry — no network call.

## Part C: Silent JWT refresh

In the mobile's TakumiPay HTTP client (wherever `api` is configured), add
a request interceptor:

```typescript
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !err.config._retried) {
      // Attempt silent refresh
      const refreshed = await tryRefreshToken(walletAddress);
      if (refreshed) {
        err.config._retried = true;
        err.config.headers.Authorization = `Bearer ${refreshed}`;
        return api(err.config);
      }
    }
    // Refresh failed — rethrow so executor classifies as authentication_required
    return Promise.reject(err);
  }
);
```

When silent refresh fails, the executor's `classifyPointsError()` returns
`"authentication_required"` and the agent calls `request_authentication`.

## Register in executor registry

Add `request_authentication` to `EXPECTED_MOBILE_TOOLS` and executor map.

## Acceptance criteria

- [ ] `request_authentication` executor in `simulate.ts`.
- [ ] Returns `status: "success"` with `data.success: true/false` in all paths.
- [ ] `points_authenticated` computed + sent in every `wallet_context`.
- [ ] Silent JWT refresh in HTTP client before surfacing `authentication_required`.
- [ ] `request_authentication` in `EXPECTED_MOBILE_TOOLS`.
- [ ] `assertRegistryParity()` passes.

## References

- `protocol_v1.1.md` §13 "Auth state and the request_authentication flow"
- `mobile-app/services/agent-executors/simulate.ts`
- `mobile-app/components/home/TakumiAgent/AgentMode.tsx`
- `mobile-app/api/` (HTTP client interceptors)
