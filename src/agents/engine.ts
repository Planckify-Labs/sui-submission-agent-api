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

/** One delegated step: run `to`'s specialist with `brief`. */
export interface CoreStep {
  to: AgentId
  brief: string
}

/**
 * Core delegated one or MORE steps this call. A compound request ("show my
 * balance AND swap AND earn yield") yields several steps in ONE Core response;
 * the orchestrator runs them in order. Keeping every step (not just the first)
 * is essential — dropping the rest is what silently lost the swap/yield part.
 */
export interface CoreRoute {
  kind: 'route'
  steps: CoreStep[]
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
   *
   * `options.resuming` is set when Core is re-entered mid-turn after a
   * specialist has finished a step (multi-agent coordination, §6.2). In
   * that mode Core decides whether to delegate the next step or end the
   * turn, and an empty decision closes the turn SILENTLY (the specialist
   * already replied) instead of emitting a "How can I help?" fallback.
   */
  runCoreRouter(
    session: Session,
    options?: { resuming?: boolean },
  ): AsyncGenerator<AgentEvent, CoreDecision>

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
 * can be unit-tested without a model.
 *
 * Collects EVERY `core_handoff` call, in order, into a step list — Core
 * delegates one handoff per part of the request, and a compound request emits
 * several in a single response. Taking only the first (the old behavior)
 * silently dropped the remaining steps (e.g. the swap/yield after the wallet
 * read). Invalid targets are skipped. No valid handoff (or only
 * `core_clarify` / no tool call) is treated as "answered".
 */
export function decideCoreRoute(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  validSpecialistIds: readonly AgentId[],
): CoreDecision {
  const steps: CoreStep[] = []
  for (const tc of toolCalls) {
    if (tc.toolName !== 'core_handoff') continue
    const input = (
      tc.input && typeof tc.input === 'object' ? tc.input : {}
    ) as Record<string, unknown>
    const to = typeof input.to === 'string' ? (input.to as AgentId) : undefined
    const brief = typeof input.brief === 'string' ? input.brief : ''
    if (to && validSpecialistIds.includes(to)) {
      steps.push({ to, brief })
    }
  }
  return steps.length > 0 ? { kind: 'route', steps } : { kind: 'answered' }
}
