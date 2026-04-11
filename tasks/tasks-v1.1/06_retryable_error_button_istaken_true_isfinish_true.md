---
phase: 1
area: mobile
section: §10
title: Implement "Try again" for retryable SSE errors
---

# 06 — Retryable error "Try again" button in AgentMode

## Context

`protocol_v1.1.md` §10 defines the semantics for retryable errors. v1.0 said
"show a Try again button" but left the mechanics undefined. Currently,
`AgentMode.tsx` routes retryable errors to `console.error` only — the user
has no retry affordance.

The correct retry mechanic is: re-send `POST /chat` with the same `session_id`
and last user message, **not** start a new session.

## What to do

In `mobile-app/components/home/TakumiAgent/AgentMode.tsx`:

### 1. Store the last user message

```typescript
const lastUserMessageRef = useRef<string>("");
// Set this whenever the user sends a message
```

### 2. Track retryable error state

```typescript
const [retryableError, setRetryableError] = useState<string | null>(null);

// On SSE error event:
if (event.data.retryable) {
  setRetryableError(event.data.message ?? "Something went wrong. Try again?");
} else {
  // Non-retryable — prompt user to start new conversation
  setNonRetryableError(event.data.message);
}
```

### 3. Show the "Try again" button

When `retryableError !== null`, render a retry affordance below the last
message:

```tsx
{retryableError && (
  <View>
    <Text>{retryableError}</Text>
    <Pressable onPress={handleRetry}>
      <Text>Try again</Text>
    </Pressable>
  </View>
)}
```

### 4. Implement `handleRetry`

```typescript
const handleRetry = useCallback(() => {
  setRetryableError(null);
  // Re-send on same session — sessionIdRef.current already holds the server id
  handleSendMessage(lastUserMessageRef.current);
}, [handleSendMessage]);
```

`handleSendMessage` with an existing `sessionIdRef.current` resumes the
same server session. The server appends the message and starts a fresh
agent loop iteration.

### 5. Non-retryable error handling

For `session_error` / `internal_error` (non-retryable), show:
> "Something went wrong. Please start a new conversation."

With a "New conversation" button that calls `handleNewConversation()`.

## Acceptance criteria

- [ ] Retryable SSE errors (`model_error`, `max_iterations`, `tool_timeout`)
      show a "Try again" button in the chat UI.
- [ ] Tapping "Try again" re-sends on the same `session_id` (session resumed,
      not created fresh).
- [ ] Non-retryable errors show "Start new conversation" instead.
- [ ] `lastUserMessageRef` is stored correctly so the retry sends the right message.
- [ ] Error state is cleared when a new message is successfully sent.

## References

- `protocol_v1.1.md` §10 "Retryable error semantics"
- `mobile-app/components/home/TakumiAgent/AgentMode.tsx`
- `mobile-app/services/agentSession/agentSession.ts`
