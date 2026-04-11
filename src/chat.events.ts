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

import type { ToolPendingPayload } from './session/types'

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
      data?: unknown
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
}

export interface ErrorData {
  code: string
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
