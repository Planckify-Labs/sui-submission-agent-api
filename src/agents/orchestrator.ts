/**
 * Multi-agent orchestrator — the Core→specialist FLOW.
 *
 * One turn:
 *   1. Core runs a router model call (`runCoreRouter`). It either answers
 *      the user directly (small talk / clarification) or routes to a
 *      specialist via `core_handoff`.
 *   2. On a route, the chosen specialist runs a full turn with ONLY its
 *      own prompt + tools + model. The specialist streams its narration
 *      and drives its tool calls to mobile.
 *
 * This module is intentionally machinery-free: it yields the SAME
 * `AgentEvent` union the mobile app already consumes, and delegates all
 * turn execution to the injected `OrchestratorEngine` (implemented by
 * `ChatService`). That keeps the wire protocol byte-identical and makes
 * the routing logic unit-testable with a fake engine.
 */

import { Logger } from '@nestjs/common'
import type { AgentEvent } from '../chat.events'
import type { Session } from '../session/types'
import { getAgentConfig } from './agentConfig'
import type { OrchestratorEngine } from './engine'

const logger = new Logger('Orchestrator')

export async function* orchestrate(
  session: Session,
  engine: OrchestratorEngine,
): AsyncGenerator<AgentEvent> {
  const decision = yield* engine.runCoreRouter(session)

  if (decision.kind === 'answered') {
    // Core handled it itself (greeting / clarification / capability Q).
    yield engine.emitDone(session)
    return
  }

  // decision.kind === 'route'
  const config = getAgentConfig(decision.to)
  if (!config || config.id === 'core') {
    // Should be unreachable — `decideCoreRoute` validates `to` against the
    // specialist list — but never trust a model. Fail soft with friendly
    // copy (raw reason logged only, CLAUDE.md).
    logger.warn(`Core routed to unknown/invalid specialist "${decision.to}"`)
    yield {
      event: 'text_delta',
      data: { content: "Sorry, I couldn't route that. Could you rephrase?" },
    }
    yield engine.emitDone(session)
    return
  }

  // Hand the rest of the turn to the specialist — it emits its own
  // narration, tool calls, and the terminal `done`.
  yield* engine.runSpecialistTurn(session, config, decision.brief)
}
