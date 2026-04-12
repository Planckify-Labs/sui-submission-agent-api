import type { ModelMessage } from 'ai'

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
 */
export interface WalletContext {
  address: `0x${string}`
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
export type ToolCapability = 'read' | 'simulate' | 'write'

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
  wallet_address: `0x${string}`
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
