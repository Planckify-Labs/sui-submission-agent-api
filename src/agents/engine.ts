/**
 * Agent turn engine — the contract between the orchestrator (which owns
 * the Core→specialist FLOW) and `ChatService` (which owns the heavy turn
 * MACHINERY: streamText, the tool-execution loop, mobile round-trips,
 * persistence, the spiral/iteration guards).
 *
 * `ChatService` implements `OrchestratorEngine`; `orchestrate()` drives it.
 * Keeping the flow behind this interface lets the routing logic be unit-
 * tested with a fake engine, and avoids duplicating the ~300-line loop.
 */

import type { AgentEvent } from '../chat.events'
import type { Session } from '../session/types'
import type { AgentRuntimeConfig } from './agentConfig'
import type { AgentId } from './types'

/** Core routed the turn to a specialist. */
export interface CoreRoute {
  kind: 'route'
  to: AgentId
  brief: string
}

/** Core answered the user directly (small talk / clarification) — no route. */
export interface CoreAnswered {
  kind: 'answered'
}

export type CoreDecision = CoreRoute | CoreAnswered

export interface OrchestratorEngine {
  /**
   * Run Core's router model call. Streams any user-facing text Core
   * produces (a direct answer or a clarifying question) as it goes, and
   * RETURNS the routing decision. Core's `core_*` tool calls are
   * orchestration signals — they are NOT executed against mobile/MCP.
   */
  runCoreRouter(session: Session): AsyncGenerator<AgentEvent, CoreDecision>

  /**
   * Run one full specialist turn: the model loop with ONLY that agent's
   * tools + prompt + model, executing tool calls against mobile/MCP and
   * streaming the specialist's narration. Emits the terminal `done` event.
   * `brief` is Core's hand-off note, injected into the specialist's prompt.
   */
  runSpecialistTurn(
    session: Session,
    config: AgentRuntimeConfig,
    brief: string,
  ): AsyncGenerator<AgentEvent>

  /** Build the terminal `done` event (conversation meta + usage). */
  emitDone(session: Session): AgentEvent
}

/**
 * Pure routing decision from Core's emitted tool calls. Extracted so it
 * can be unit-tested without a model. `core_handoff` wins; anything else
 * (including `core_clarify` or no tool call) is treated as "answered".
 */
export function decideCoreRoute(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  validSpecialistIds: readonly AgentId[],
): CoreDecision {
  const handoff = toolCalls.find((tc) => tc.toolName === 'core_handoff')
  if (handoff) {
    const input = (
      handoff.input && typeof handoff.input === 'object' ? handoff.input : {}
    ) as Record<string, unknown>
    const to = typeof input.to === 'string' ? (input.to as AgentId) : undefined
    const brief = typeof input.brief === 'string' ? input.brief : ''
    if (to && validSpecialistIds.includes(to)) {
      return { kind: 'route', to, brief }
    }
  }
  return { kind: 'answered' }
}
