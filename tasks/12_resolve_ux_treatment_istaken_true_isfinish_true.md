# Task 12 — `resolveUXTreatment()` combining `ApprovalPolicy` + active grants

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §5 "Mobile-Side: Wallet Approval Policy", §6
**Depends on:** Task 11 (`PermissionGrantStore` + `resolveGrant`)

## Why this matters

This is the function that translates the server's factual `capability`
into the concrete UX treatment the mobile shows the user. It sits at the
exact boundary between "what the action does" (server) and "how much
friction to apply" (wallet + user). Every other mobile-side UI decision
depends on it.

## Scope

### Approval policies

Define `ApprovalPolicy` and the built-in policies from §5:

```ts
type UXTreatment = "silent" | "preview" | "confirm" | "blocked";

interface ApprovalPolicy {
  read:     UXTreatment;
  simulate: UXTreatment;
  write:    UXTreatment;
  tool_overrides?:         Record<string, UXTreatment>;
  auto_approve_below_usd?: number;
}

export const HOT_WALLET_POLICY: ApprovalPolicy = {
  read: "silent", simulate: "preview", write: "confirm",
  tool_overrides: { approve_erc20: "confirm" },
};

export const HARDWARE_WALLET_POLICY: ApprovalPolicy = {
  read: "silent", simulate: "preview", write: "confirm",
};

export const WATCH_ONLY_POLICY: ApprovalPolicy = {
  read: "silent", simulate: "silent", write: "blocked",
};

export const MULTISIG_POLICY: ApprovalPolicy = {
  read: "silent", simulate: "preview", write: "confirm",
};
```

### `resolveUXTreatment()`

Full version combining grants (task 11) + policy (§6 "Combining Grant +
ApprovalPolicy → UX Treatment"):

```ts
function resolveUXTreatment(
  capability: ToolCapability,
  toolName:   string,
  wallet:     ConnectedWallet,    // includes approvalPolicy + grantStore
  sessionId:  string,
  amountUsd?: number,
): UXTreatment {
  const grant = resolveGrant(
    toolName,
    capability,
    wallet.address,
    sessionId,
    wallet.grantStore,
  );

  switch (grant.type) {
    case "always_ask":
      return "confirm";   // hard override

    case "permanent":
    case "session":
    case "timed":
      return "silent";    // active grant

    case "once":
      return resolveFromPolicy(wallet.approvalPolicy, capability, toolName, amountUsd);
  }
}

function resolveFromPolicy(
  policy:     ApprovalPolicy,
  capability: ToolCapability,
  toolName:   string,
  amountUsd?: number,
): UXTreatment {
  if (policy.tool_overrides?.[toolName]) return policy.tool_overrides[toolName];
  const base = policy[capability];

  if (
    base === "confirm" &&
    policy.auto_approve_below_usd !== undefined &&
    amountUsd !== undefined &&
    amountUsd < policy.auto_approve_below_usd
  ) {
    return "preview";
  }
  return base;
}
```

### Signature contract (must match task 09)

The dispatcher in task 09 calls `resolveUXTreatment(capability, toolName,
wallet, sessionId, amountUsd)`. Do NOT accept `wallet.approvalPolicy`
directly — the function needs the grant store on the wallet object.

### The four treatments

| Treatment | Mobile behavior |
|---|---|
| `silent`  | Execute immediately, show a tiny status label |
| `preview` | Summary card, auto-proceed after 3s unless dismissed (task 13) |
| `confirm` | Hard stop, explicit tap, no timeout (task 14) |
| `blocked` | Immediate rejection — `tool_rejected { reason: "wallet_type_cannot_execute" }` |

## Acceptance

- [ ] Watch-only wallet + `write` → `"blocked"`.
- [ ] Hot wallet + `write` → `"confirm"`.
- [ ] Hot wallet + `approve_erc20` → `"confirm"` (override), even if policy changes.
- [ ] Active session grant + `write` → `"silent"`.
- [ ] `always_ask` grant on tool X + `write` → `"confirm"` even with a global permanent grant.
- [ ] `auto_approve_below_usd = 50` + `amountUsd = 20` + `write` → `"preview"`.
- [ ] Same config + `amountUsd = 100` → `"confirm"`.
- [ ] Unit tests cover each of the above.

## Out of scope

- Actually rendering preview/approval UIs (tasks 13, 14).
- Persisting policy changes from Settings (task 17).
