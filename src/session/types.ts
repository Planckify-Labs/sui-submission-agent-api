import type { ModelMessage } from 'ai'

/**
 * Shape of any SSE event the session may emit externally (i.e. outside
 * the agent loop generator). Kept as a structural alias to avoid a
 * circular import with `chat.events.ts` where the full `AgentEvent`
 * discriminated union lives.
 */
export type ExternalSseEvent = { event: string; data: unknown }

/**
 * Session-related types used by the agent loop.
 *
 * These mirror the definitions in `AGENT_PROTOCOL.md` (§8, §9, §12).
 * They live here so the SessionService can be implemented independently
 * of the chat controller and agent loop (tasks 04 and 05). Upstream tasks
 * may move or extend these — keep them discoverable from `src/session/`.
 */

/**
 * Wallet context injected by mobile on `POST /chat`. See §8.2.
 * The server never stores private keys or seed phrases.
 *
 * `address` is a raw string so both EVM (`0x`-hex) and Solana (base58)
 * public keys fit. `namespace` is the authoritative discriminator —
 * omitted by legacy EVM clients and defaulted to `"eip155"`.
 *
 * `chain_id` is kept as a plain `number`. EVM chains send their viem
 * chain id; non-EVM chains send `0` — the server only reads it for
 * system-prompt display and conversation stamping.
 */
export interface WalletContext {
  address: string
  namespace?: 'eip155' | 'solana' | 'sui'
  chain_id: number
  chain_name: string
  chain_symbol: string
  label?: string
  /**
   * Whether the mobile currently holds a non-expired points-service JWT
   * for this wallet. Computed by the mobile at send time; the server
   * never sees the JWT itself. See protocol_v1.1.md §13.
   *
   * Optional on the wire for backwards compatibility with pre-v1.1
   * mobile clients — treated as `false` when absent.
   */
  points_authenticated?: boolean
}

/**
 * Tool capability classification — factual, not UX. See §8.3.
 */
export type ToolCapability = 'read' | 'write'

/**
 * Logical grouping of tools used by mobile to apply policy. See §8.3.
 * Kept as a string for now — upstream tasks define the exact enum.
 */
export type ToolCategory = string

/**
 * Payload emitted over SSE as a `tool_pending` event and stored in the
 * session so it can be re-delivered on SSE reconnect. See §8.3 / §4.
 */
export interface ToolPendingPayload {
  session_id: string
  tool_call_id: string
  name: string
  input: Record<string, unknown>
  meta: {
    executor: 'mobile'
    capability: ToolCapability
    category: ToolCategory
    human_summary: string
    amount_usd?: number
  }
  /**
   * Optional ISO timestamp set by `buildReconnectResponse` (task 12 / S2)
   * when the server can prove the tool call is dead — e.g. the original
   * stream exited without a `tool_result` and the deadline has elapsed.
   *
   * Additive: existing clients that ignore this field continue to render
   * the call as still-pending. The mobile translator (task 02) will fold
   * this into `state: 'output-error'` so historical replay shows
   * "⚠︎ Interrupted" deterministically rather than via a time-based guess.
   */
  interrupted_at?: string
  /**
   * Optional id of the agent that emitted this tool call.
   *
   * Spec: docs/multi-agent-architecture-spec.md §6, §11.4.
   *
   * Mobile renders a small "via X specialist" badge when present and
   * not equal to `core` / `wallet` (Task 17). Old mobile clients that
   * ignore the field keep working unchanged — backwards-compatibility
   * verified by the Task 20 e2e test.
   */
  origin_agent_id?: string
  /**
   * Wallet context for this tool call (spec §9). The orchestrator stamps
   * every `tool_pending` envelope with the turn's `Session.wallet_context`
   * so the mobile executor signs against the wallet that initiated the
   * turn, never the home-screen active wallet. Additive — clients that
   * already read wallet_context from the session ignore the duplicate.
   */
  wallet_context?: WalletContext
}

/**
 * Narrative pass-through markers (spec §6.4). Emitted by the
 * orchestrator before/after a specialist streams prose directly to
 * the user via `core_handoff({ conversational: true })`.
 *
 * Content-only — no timestamps / request ids / conversation id.
 */
export interface NarrativeHandoffPayload {
  origin_agent_id: string
}

/**
 * Successful tool execution result returned from the mobile wallet. See §8.4.
 */
export interface ToolResult {
  status: 'success' | 'failed'
  tx_hash?: `0x${string}`
  tx_confirmed?: boolean
  data?: unknown
  error?: string
}

/**
 * Mobile's response to a `tool_pending` event via `POST /chat/respond`. See §8.4.
 */
export type MobileResponse =
  | {
      type: 'tool_result'
      session_id: string
      tool_call_id: string
      result: ToolResult
    }
  | {
      type: 'tool_rejected'
      session_id: string
      tool_call_id: string
      reason: 'user_declined' | 'insufficient_funds' | 'network_error' | string
    }

/**
 * Session state machine. See §9.
 */
export type SessionState = 'streaming' | 'awaiting_mobile' | 'idle'

/**
 * A promise with its `resolve` and `reject` exposed. The session service
 * stores one per outstanding mobile tool call so the agent loop can
 * `await` the mobile's response.
 */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

/**
 * Full session record. See §9 and §12.
 */
export interface Session {
  id: string
  messages: ModelMessage[]
  wallet_address: string
  chain_id: number
  wallet_context: WalletContext
  state: SessionState
  pending: Map<string, Deferred<MobileResponse>>
  /** Stored for SSE reconnect re-delivery. See §4. */
  pendingPayloads: Map<string, ToolPendingPayload>
  usage: { prompt_tokens: number; completion_tokens: number }
  created_at: Date
  last_active: Date
  /** Set when the session is tied to a persisted conversation. */
  conversationId?: string
  /** Title of the active conversation — forwarded in the `done` SSE event. */
  conversationTitle?: string
  /**
   * Side-channel writer into the open SSE stream for this session.
   * Set by `ChatService.streamAgentSSE` when the stream opens and cleared
   * when it closes. Used by out-of-loop emitters (e.g. delay-hint mini
   * inference) to push `text_delta` frames without going through the
   * agent generator. Undefined when no stream is open.
   */
  enqueueExternal?: (event: ExternalSseEvent) => void
  /**
   * Tool call ids for which a delay hint has already been dispatched.
   * One hint per tool call — prevents repeated mini-inference firings
   * if the mobile posts `/chat/progress` more than once for the same
   * tool (e.g. timer misfire or retried hint).
   */
  delayHintsSent?: Set<string>
  /**
   * Index into `messages` past which entries have NOT yet been written to
   * the persisted conversation (task 11 / S1). Lets the agent loop flush
   * partial turns incrementally and idempotently — a re-flush only writes
   * messages added since the last persist.
   */
  lastPersistedIndex?: number
  /**
   * Marks the session as having entered `awaiting_mobile` state. Used by
   * `buildReconnectResponse` (task 12) to decide whether replayed
   * `tool_pending` payloads should carry an `interrupted_at` hint.
   */
  awaitingMobileSince?: Date
}

/**
 * Thrown by `SessionService.awaitMobileResult` when the mobile does not
 * respond within `timeoutMs`.
 */
export class TimeoutError extends Error {
  public readonly sessionId: string
  public readonly toolCallId: string

  constructor(sessionId: string, toolCallId: string, timeoutMs: number) {
    super(
      `Timed out waiting for mobile result for tool_call ${toolCallId} in session ${sessionId} after ${timeoutMs}ms`,
    )
    this.name = 'TimeoutError'
    this.sessionId = sessionId
    this.toolCallId = toolCallId
  }
}
