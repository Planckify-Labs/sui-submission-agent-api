# Task 11 — `PermissionGrantStore` with `resolveGrant()`

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §6 "Permission Grants & Trust Delegation"

## Why this matters

Grants are the user's escape hatch from per-action prompts — "for this
session, just do it" or "for the next hour, auto-approve all writes". They
are **entirely a mobile concern** — the server never sees them. Without a
store, the mobile has to prompt for every single write, which destroys UX
for active trading or DCA sessions.

## Scope

### Data model (§6)

```ts
type GrantLifetime =
  | { type: "always_ask" }
  | { type: "once" }
  | { type: "session";   session_id: string }
  | { type: "timed";     expires_at: number }   // Unix ms
  | { type: "permanent" };

type GrantScope =
  | { kind: "tool";       key: string }          // specific tool name
  | { kind: "capability"; key: ToolCapability }  // "write", "simulate"
  | { kind: "global" };

interface PermissionGrant {
  scope:          GrantScope;
  lifetime:       GrantLifetime;
  wallet_address: `0x${string}`;
  granted_at:     number;
}
```

### Store API

```ts
class PermissionGrantStore {
  add(grant: PermissionGrant): void;
  remove(grant: PermissionGrant): void;
  find(query: { scope: GrantScope; wallet: `0x${string}` }): PermissionGrant | undefined;
  list(wallet: `0x${string}`): PermissionGrant[];
  revokeAll(wallet: `0x${string}`): void;
  prune(): void;   // drops expired timed grants
}
```

### `resolveGrant()` priority

Tool-level > capability-level > global. First match wins. Implementation
skeleton from §6:

```ts
function resolveGrant(
  toolName:   string,
  capability: ToolCapability,
  wallet:     `0x${string}`,
  sessionId:  string,
  store:      PermissionGrantStore,
): GrantLifetime {
  const now = Date.now();
  const candidates = [
    store.find({ scope: { kind: "tool",       key: toolName   }, wallet }),
    store.find({ scope: { kind: "capability", key: capability }, wallet }),
    store.find({ scope: { kind: "global" },                       wallet }),
  ];
  for (const grant of candidates) {
    if (!grant) continue;
    switch (grant.lifetime.type) {
      case "always_ask": return { type: "always_ask" };
      case "permanent":  return grant.lifetime;
      case "session":
        if (grant.lifetime.session_id === sessionId) return grant.lifetime;
        break;
      case "timed":
        if (grant.lifetime.expires_at > now) return grant.lifetime;
        else store.remove(grant);
        break;
    }
  }
  return { type: "once" };
}
```

### Storage rules

- Persisted on device in a secure store (SecureStore / AsyncStorage —
  match the existing wallet-key storage pattern in the app).
- **Wallet-scoped.** A grant for wallet A must not apply to wallet B.
  Switching connected wallets hides grants for the other wallet.
- `always_ask` is a hard override — it beats any broader grant (including
  permanent global). This lets users lock down a single tool even in
  autonomous mode.
- Timed grants are pruned lazily on `find()` and eagerly via `prune()` on
  app launch.

### Default modes (§6)

Expose two factory helpers:

```ts
PermissionGrantStore.conservative(walletAddress): PermissionGrantStore;   // empty store
PermissionGrantStore.autonomous(walletAddress): PermissionGrantStore;     // seeded with global permanent grant
```

The product decision on which default to use is out of scope — ship both.

## Acceptance

- [ ] Unit tests for every lifetime type: `always_ask`, `once`, `session`,
      `timed`, `permanent`.
- [ ] Unit test: tool-level grant wins over capability-level grant.
- [ ] Unit test: `always_ask` at tool level overrides a global permanent grant.
- [ ] Unit test: expired timed grant is pruned on `find()`.
- [ ] Unit test: grant for wallet A does not resolve for wallet B.
- [ ] Grants persist across app restarts.

## Out of scope

- `resolveUXTreatment` composition (task 12).
- Settings screen for managing grants (task 17).
