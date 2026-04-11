# Task 14 — Approval sheet component with grant-duration selector

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §6 "The Approval Sheet with Grant Selection", §10
**Depends on:** Task 09 (dispatcher), task 11 (grant store), task 12 (treatment)

## Why this matters

This is the hard-stop UI that protects users from irreversible actions.
Every `write` that resolves to `"confirm"` lands here. Critically, approving
an action is ALSO when the user chooses how long to trust the agent for —
the same sheet both authorizes the current call and sets grants for future
calls. Getting this right is most of the perceived safety of the whole app.

## Scope

### Component contract

```ts
interface ApprovalSheetProps {
  title:         string;              // e.g. "Send 0.5 ETH"
  summary:       string;              // payload.meta.human_summary
  warning?:      string;              // specialWarning(payload.name) — e.g. approve_erc20 notice
  grantOptions:  GrantOption[];       // radio-button choices
  onApprove:     (choice: GrantChoice) => void;
  onReject:      () => void;
}

interface GrantOption {
  id:          string;              // "once" | "session" | "timed_1h" | "timed_24h" | "permanent"
  label:       string;              // "Just this once", "For this session", ...
  lifetime:    GrantLifetime;       // see task 11
  scope:       GrantScope;          // default { kind: "tool", key: payload.name }
}

interface GrantChoice {
  scope:     GrantScope;
  lifetime:  GrantLifetime;
}
```

### Default grant options (§6)

Render the five options from the protocol sketch, in this order:

```
○ Just this once                { type: "once" }
○ For this session              { type: "session", session_id }
● For the next [ 1 hour ▾ ]     { type: "timed", expires_at: now + 3600_000 }
○ Until [ pick a date ]         { type: "timed", expires_at: <picker> }
○ Always (manage in Settings)   { type: "permanent" }
```

- Default selection is "Just this once" (most conservative).
- The "For the next [N]" dropdown offers 15 min / 1h / 4h / 24h presets.
- The scope defaults to `{ kind: "tool", key: payload.name }` — the user
  is approving *this* tool, not all writes. A "Apply to all writes" toggle
  can be added later.

### Layout (§6 sketch)

```
┌─────────────────────────────────────────────┐
│  Send 0.5 ETH                               │
│  to 0x123…ef on Polygon                     │
│                                             │
│  [warning block if present]                │
│                                             │
│  Allow agent to do this:                   │
│  ○ Just this once                           │
│  ○ For this session                         │
│  ● For the next  [ 1 hour ▾ ]              │
│  ○ Until  [ pick a date ]                  │
│  ○ Always (manage in Settings)             │
│                                             │
│         [Reject]    [Approve]               │
└─────────────────────────────────────────────┘
```

### Wiring

```ts
function showApprovalSheet(payload: ToolPendingPayload, session: AgentSession) {
  session.pending_approvals.set(payload.tool_call_id, payload);
  renderApprovalSheet({
    title:        toolDisplayName(payload.name),
    summary:      payload.meta.human_summary,
    warning:      specialWarning(payload.name),
    grantOptions: buildGrantOptions(session.session_id),
    onApprove: (choice) => {
      if (choice.lifetime.type !== "once") {
        wallet.grantStore.add({
          scope:          choice.scope,
          lifetime:       choice.lifetime,
          wallet_address: wallet.address,
          granted_at:     Date.now(),
        });
      }
      executeTool(payload, session);
    },
    onReject: () => rejectTool(payload, session, "user_declined"),
  });
}
```

### `specialWarning()` table

```ts
const warnings: Record<string, string> = {
  approve_erc20:  "This grants an external contract permission to spend your tokens. Only approve contracts you trust.",
  cancel_booking: "This may be irreversible depending on the vendor's cancellation policy.",
};
```

## UX requirements

- Hard stop — NO timer, NO auto-approve. The only way to dismiss is
  Approve or Reject.
- Hardware wallet flow: after tap "Approve", show a "Confirm on your
  device…" overlay while the viem signer waits for the device.
- Warning text is rendered with a distinct color/icon so it's visually
  separate from the summary.
- Sheet is full-screen on small devices, bottom sheet on larger ones.
- Accessible: VoiceOver reads title + summary + warning + current radio
  selection on open.
- Biometric step (optional per app config): Face ID / passcode between tap
  and actual execution. Cancelling biometrics = `onReject("user_declined")`.

## Acceptance

- [ ] Approve with "Just this once" does NOT persist a grant.
- [ ] Approve with any other option persists a grant whose scope defaults
      to the current tool name.
- [ ] Reject fires `tool_rejected { reason: "user_declined" }`.
- [ ] Timer does not exist — sheet blocks indefinitely until user acts.
- [ ] Warnings render for `approve_erc20` and `cancel_booking`.
- [ ] Hardware wallet flow shows the "waiting for device" state.
- [ ] Backgrounding the app leaves the sheet intact on return.

## Out of scope

- Preview card (task 13).
- Settings-screen grant management (task 17).
