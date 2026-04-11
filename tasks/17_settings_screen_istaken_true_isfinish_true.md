# Task 17 — Settings screen: view and revoke active grants per wallet

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §6 "App Settings: Managing Active Grants", §6 "Default Permission Mode"
**Depends on:** Task 11 (`PermissionGrantStore`), task 12 (`ApprovalPolicy`)

## Why this matters

Grants are powerful — a permanent global grant means the agent can send
any transaction without prompting. Users MUST be able to inspect what
they've granted and revoke it instantly. Without this screen, the only
way to revoke a grant is to wait for the next matching `tool_pending` and
tap "Always ask", which is not a recovery path — it's a hope.

## Scope

### Screen content (§6 sketch)

```
Active Agent Permissions
────────────────────────────────────────────────────────
send_native_token    "1 hour"       expires 3:45 PM    [Revoke]
blockchain_write     "Session"      session #a1b2      [Revoke]
All actions          "Always"       granted Jan 10     [Revoke]
────────────────────────────────────────────────────────
Default mode:  ○ Always ask   ● Agent decides*  ○ Full auto

* Agent uses wallet policy — asks for writes, previews simulates
```

### Rows

For each grant in `wallet.grantStore.list(wallet.address)`, render:

- **Scope label:**
  - `{ kind: "tool", key: "send_native_token" }` → "send_native_token"
  - `{ kind: "capability", key: "write" }` → "blockchain_write"
  - `{ kind: "global" }` → "All actions"
- **Lifetime label:**
  - `once` → (not shown — not persisted)
  - `session` → "Session" + session id prefix
  - `timed` → "N hours" + "expires at HH:MM"
  - `permanent` → "Always" + "granted {date}"
- **Revoke button** → `grantStore.remove(grant)` + refresh list.

### Default mode selector

Three radio options per §6:

1. **Always ask** — sets an `always_ask` grant on `{ kind: "global" }`.
   Overrides all other grants. Most conservative.
2. **Agent decides** — empty grant store (conservative default). Agent uses
   `ApprovalPolicy` exclusively.
3. **Full auto** — pre-installs a `{ scope: "global", lifetime: "permanent" }`
   grant. Power-user mode.

Switching modes prompts for confirmation, especially moving TO "Full auto"
(explain what it does in plain language).

### Wallet switcher

If the user has multiple wallets connected, show a wallet picker at the top
of the screen. Grants are wallet-scoped (§6) — switching the picker must
refetch grants for the selected wallet.

### Revoke-all action

Prominent "Revoke all permissions" button at the bottom that calls
`grantStore.revokeAll(wallet.address)`. Confirmation dialog required.

### Live updates

If the user revokes a grant while an SSE session is active, the change
takes effect on the NEXT `tool_pending` — in-flight prompts are not
retroactively cancelled. Add a small hint in the screen: "Changes apply to
new actions. Active prompts are unaffected."

### Accessibility

- VoiceOver reads the full row: scope + lifetime + expiry.
- Every destructive button has an explicit "Revoke X" label, not just "Revoke".
- Default-mode radio group is a single `radiogroup` for screen readers.

## Acceptance

- [ ] All active grants for the current wallet are listed.
- [ ] Revoking a row removes it immediately from `grantStore` and from the UI.
- [ ] Switching wallets shows that wallet's grants only.
- [ ] "Always ask" mode adds an `always_ask` global grant that is visible
      in the list and overrides any other grant (verify by round-tripping
      through `resolveUXTreatment`).
- [ ] "Full auto" mode prompts for confirmation before seeding the
      permanent global grant.
- [ ] "Revoke all" clears the store after confirmation.
- [ ] Expired timed grants do not appear (pruned on load).
- [ ] Screen is reachable from the main Settings root.

## Out of scope

- Server-side grant state (there is none — grants never leave the device).
- Approval sheet (task 14).
