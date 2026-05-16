/**
 * SSE event union emitted by the server-side agent loop.
 *
 * Protocol reference: AGENT_PROTOCOL.md §9 "Server-Side Agent Loop".
 *
 * Each event corresponds to one `event: <type>\ndata: <json>\n\n` frame on
 * the wire. The shape of `data` is deliberately kept narrow so the mobile
 * client and any TypeScript consumer can discriminate on `event`.
 *
 * Lives in its own module (not `session/types.ts`) so the reconnect branch
 * in `ChatService` can import the narrow `SseFrame` shape without pulling
 * in the whole agent loop and without creating a circular dep with the
 * session module.
 */

import type {
  NarrativeHandoffPayload,
  ToolPendingPayload,
} from './session/types'

/**
 * Structured result returned by the agent loop after a mobile tool round-trip.
 *
 * The agent sees these via `buildAgentToolResult()` — a discriminated union
 * so the LLM gets an unambiguous status instead of freeform error strings.
 */
export type AgentToolResult =
  | {
      status: 'approved_and_executed'
      tx_hash?: `0x${string}`
      /**
       * Compact agent-facing payload. This is what the LLM reasons
       * over on every subsequent turn — keep it small.
       */
      data?: unknown
      /**
       * UI-facing rich payload. Persisted with the tool result so
       * historical replay can render the same card, but STRIPPED
       * before the result is fed back into `streamText` so it never
       * enters LLM context. See `stripDisplayForLLM()` in chat.service.
       */
      display?: unknown
    }
  | {
      status: 'approved_but_failed'
      error: string
    }
  | {
      status: 'rejected'
      reason:
        | 'user_declined'
        | 'insufficient_funds'
        | 'network_error'
        | 'wallet_type_cannot_execute'
        | string
    }

/**
 * Server-executed tool result echoed to the client for display.
 *
 * `result` is filtered via `transformForDisplay()` — the unfiltered copy
 * still lives in `session.messages` so the agent reasons over the full data.
 */
export interface ServerToolExecutedData {
  tool_call_id: string
  name: string
  result: unknown
}

export interface StatusData {
  message: string
}

export interface TextDeltaData {
  content: string
}

export interface DoneData {
  session_id: string
  usage?: { prompt_tokens: number; completion_tokens: number }
  conversation_id?: string
  conversation_title?: string
}

/**
 * Enumerated error codes — see protocol_v1.1.md §9.
 *
 * Split into two groups: SSE-level codes arrive as `event: error` frames on
 * the chat stream; HTTP-level codes arrive as JSON response bodies from the
 * controller (4xx) before any stream is opened.
 */
export type SseErrorCode =
  | 'model_error' // LLM API call failed (retryable)
  | 'max_iterations' // agent loop cap reached (retryable)
  | 'tool_timeout' // mobile didn't respond in time (retryable)
  | 'session_error' // internal session sync failure (non-retryable)
  | 'internal_error' // uncaught server exception (non-retryable)

export type HttpErrorCode =
  | 'missing_wallet_context' // 400 — new session without wallet_context
  | 'invalid_request' // 400 — body schema validation failed
  | 'session_expired' // 404 — unknown or evicted session
  | 'tool_call_already_resolved' // 409 — duplicate tool response

export type ErrorCode = SseErrorCode | HttpErrorCode

export interface ErrorData {
  code: SseErrorCode
  message: string
  retryable: boolean
  tool_call_id?: string
}

/**
 * Discriminated union of every event the agent loop can yield. The SSE
 * encoder converts each one into a `data: <json>\n\n` frame with an
 * `event: <event>\n` prefix.
 */
export type AgentEvent =
  | { event: 'status'; data: StatusData }
  | { event: 'text_delta'; data: TextDeltaData }
  | { event: 'tool_pending'; data: ToolPendingPayload }
  | { event: 'tool_executed'; data: ServerToolExecutedData }
  | { event: 'narrative_handoff'; data: NarrativeHandoffPayload }
  | { event: 'narrative_handoff_end'; data: NarrativeHandoffPayload }
  | { event: 'done'; data: DoneData }
  | { event: 'error'; data: ErrorData }

/**
 * Encode an `AgentEvent` (or any `{event, data}` pair) as an SSE frame.
 * Exported so the reconnect path and the streaming path share one encoder.
 */
export function encodeSseEvent(evt: {
  event: string
  data: unknown
}): string {
  const data = JSON.stringify(evt.data)
  return `event: ${evt.event}\ndata: ${data}\n\n`
}
