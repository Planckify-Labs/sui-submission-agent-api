# Task 03 — Session store + `awaitMobileResult()` + reconnect buffer

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §4 "SSE Reconnect Mid-Turn",
§9 "Server-Side Agent Loop", §12 "Session Persistence"

## Why this matters

The current ChatService is a single one-shot `streamText()` call. The new
protocol requires the loop to **suspend** at each mobile tool call and
**resume** when `POST /chat/respond` arrives. The session service is the
synchronization primitive that makes that possible.

It also has to survive SSE disconnects: if the stream drops while the agent
is waiting for a mobile result, the mobile reconnects and the server must
re-emit the pending `tool_pending` event.

## Scope

Create `src/session/session.service.ts` with:

```ts
interface Session {
  id:              string;
  messages:        CoreMessage[];
  wallet_address:  `0x${string}`;
  chain_id:        number;
  state:           "streaming" | "awaiting_mobile" | "idle";
  pending:         Map<string, Deferred<MobileResponse>>;
  pendingPayloads: Map<string, ToolPendingPayload>;   // for reconnect re-delivery
  usage:           { prompt_tokens: number; completion_tokens: number };
  created_at:      Date;
  last_active:     Date;
}
```

Public API:

```ts
class SessionService {
  create(walletCtx: WalletContext): Session;
  get(id: string): Session | undefined;
  awaitMobileResult(
    sessionId:   string,
    toolCallId:  string,
    payload:     ToolPendingPayload,   // stored for reconnect
    opts:        { timeoutMs: number },
  ): Promise<MobileResponse>;
  resolveMobileResult(
    sessionId:   string,
    toolCallId:  string,
    response:    MobileResponse,
  ): void;
  cleanup(sessionId: string): void;    // clears pending maps, transitions to idle
}
```

## Implementation notes

- `Deferred<T>` is a standard pattern — a `Promise<T>` with its `resolve`
  and `reject` exposed. Store one per outstanding mobile tool call, keyed by
  `tool_call_id`.
- `awaitMobileResult` MUST:
  1. Insert the payload into `pendingPayloads` **before** returning the promise
     (so a reconnect arriving between the emit and the mobile response can
     re-deliver it).
  2. Set `session.state = "awaiting_mobile"`.
  3. Race against `MOBILE_RESULT_TIMEOUT_MS = 5 * 60_000`. On timeout, throw
     `TimeoutError` and clean up the deferred.
  4. On resolve/reject, delete the entry from both `pending` and
     `pendingPayloads`.
- `resolveMobileResult`: look up deferred by `(sessionId, toolCallId)`,
  resolve it, drop the entry. Single-use — re-calls with the same id should
  throw (replay protection, §13).
- Session TTL: 15 minutes of inactivity → evict. Background sweep or
  lazy-check on `get`.

## Storage

- Single-instance: in-memory `Map<string, Session>`.
- Multi-instance deferred to later — leave a comment marker where Redis
  would plug in (see §12 table).

## Acceptance

- [ ] `awaitMobileResult` resolves when `resolveMobileResult` is called with
      a matching id.
- [ ] Second `resolveMobileResult` with the same id throws (replay protection).
- [ ] `awaitMobileResult` rejects with `TimeoutError` after `timeoutMs`.
- [ ] `pendingPayloads` contains the payload for the duration the promise is
      unresolved, and is cleared on resolve/reject/timeout.
- [ ] Sessions older than 15 minutes of inactivity are evicted.
- [ ] Unit tests for: normal resolution, timeout, replay, eviction.

## Out of scope

- SSE wiring (task 04).
- Agent loop itself (task 05).
- Redis persistence.
