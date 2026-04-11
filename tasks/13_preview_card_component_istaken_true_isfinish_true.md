# Task 13 — Preview card component (`preview` treatment, 3s auto-proceed)

**Status:** Not taken
**Owner:** Mobile (takumipay-mobile-app)
**Protocol reference:** `AGENT_PROTOCOL.md` §5 UX table, §10 "Tool Pending Handler"
**Depends on:** Task 09 (dispatcher), task 12 (treatment)

## Why this matters

`preview` is the middle ground between silent execution and a full approval
sheet. It is used for `simulate` capability tools (like `estimate_gas`) and
for low-amount writes under `auto_approve_below_usd`. The user sees what's
about to happen, has 3 seconds to cancel, and otherwise the flow continues
without a tap. Critical for keeping gas previews unobtrusive.

## Scope

### Component contract

```ts
interface PreviewCardProps {
  summary:         string;         // payload.meta.human_summary
  autoConfirmMs:   number;         // default 3000
  onConfirm:       () => void;     // user tapped "Approve now" or timer elapsed
  onDismiss:       () => void;     // user tapped "Cancel" — treat as user_declined
}
```

### Behavior

1. Renders in the chat timeline (not as a modal). It should feel like a
   message from the agent, with a soft gradient or bordered card.
2. Shows `summary` as the headline plus a circular progress indicator
   that fills over `autoConfirmMs`.
3. If the user does nothing, fires `onConfirm()` at the end of the countdown.
4. Tapping "Cancel" immediately fires `onDismiss()` and collapses the card.
5. Tapping "Approve now" immediately fires `onConfirm()`, shortcutting the timer.
6. Once resolved (either path), the card becomes non-interactive and shows
   a compact completed state ("Approved" / "Cancelled").

### Wiring

The dispatcher (task 09) calls:

```ts
function showPreviewCard(payload: ToolPendingPayload, session: AgentSession) {
  session.pending_approvals.set(payload.tool_call_id, payload);
  renderPreviewCard({
    summary:       payload.meta.human_summary,
    autoConfirmMs: 3000,
    onConfirm:     () => executeTool(payload, session),           // task 10
    onDismiss:     () => rejectTool(payload, session, "user_declined"),
  });
}
```

Both callbacks must remove the entry from `pending_approvals`.

### UX details

- Countdown timer is paused if the app goes to background, resumed on
  foreground. Don't auto-confirm while the user can't see the screen.
- Respect reduced-motion settings — fall back to a static indicator.
- `summary` may contain Indonesian text or long addresses; card must not
  clip.
- Accessible: VoiceOver reads the summary + "auto-confirming in 3 seconds".
- Match existing design tokens (NativeWind) from the app's component library.

### Edge cases

- SSE drops while the card is visible → do NOT auto-confirm during
  disconnect. Show "Reconnecting…" overlay. Resume countdown only after
  the reconnect re-emits the same `tool_pending` (deduped by id).
- User backgrounds the app, returns after `autoConfirmMs`: treat as
  "pending user action" — do not auto-confirm. User must tap explicitly.

## Acceptance

- [ ] Card fires `onConfirm` after 3s with no interaction.
- [ ] "Approve now" button short-circuits the timer.
- [ ] "Cancel" button fires `onDismiss` immediately.
- [ ] Backgrounding pauses the timer.
- [ ] SSE disconnect pauses the timer.
- [ ] Screen-reader accessible.
- [ ] Visual snapshot tests for three states: countdown, cancelled, confirmed.

## Out of scope

- Approval sheet component (task 14).
