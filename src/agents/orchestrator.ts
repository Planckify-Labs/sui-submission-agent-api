/**
 * Multi-agent orchestrator — the Core⇄specialist coordination FLOW.
 *
 * One turn can fan through several specialists, with Core coordinating
 * (spec §6.2 "Core resumes its turn"):
 *   1. Core runs a model call (`runCoreRouter`). It either answers the user
 *      directly (small talk / clarification) or delegates one or MORE steps
 *      via `core_handoff` — a compound request ("show my balance AND swap AND
 *      earn yield") emits a hand-off per part in a SINGLE response.
 *   2. The orchestrator runs EVERY delegated step in order. Each specialist
 *      runs with ONLY its own prompt + tools + model — it streams its
 *      narration and drives its tool calls to mobile, then its result lands
 *      in `session.messages` (so later steps and Core can see it). Running
 *      only the first step is what previously dropped the swap/yield part.
 *   3. Core is re-entered (`resuming: true`) once the planned steps are done.
 *      It either delegates a further step it didn't include up front or ends
 *      the turn. This belt-and-suspenders covers a model that delegates one
 *      step at a time instead of planning the whole turn at once.
 *
 * The loop is bounded by `MAX_COORDINATION_HOPS` so a model that keeps
 * re-delegating can never spin forever. Exactly ONE terminal `done` is
 * emitted, at the end — a specialist's own `done` is swallowed mid-turn
 * because the turn isn't over until Core says so.
 *
 * This module is intentionally machinery-free: it yields the SAME
 * `AgentEvent` union the mobile app already consumes, and delegates all
 * turn execution to the injected `OrchestratorEngine` (implemented by
 * `ChatService`). That keeps the wire protocol byte-identical and makes
 * the coordination logic unit-testable with a fake engine.
 */

import { Logger } from '@nestjs/common'
import type { AgentEvent } from '../chat.events'
import type { Session } from '../session/types'
import { getAgentConfig } from './agentConfig'
import type { OrchestratorEngine } from './engine'

const logger = new Logger('Orchestrator')

/**
 * Max Core⇄specialist round-trips in one turn. A turn rarely needs more
 * than two specialists; the cap is a guard against a model that keeps
 * re-delegating rather than a real workload limit.
 */
export const MAX_COORDINATION_HOPS = 4

export async function* orchestrate(
  session: Session,
  engine: OrchestratorEngine,
): AsyncGenerator<AgentEvent> {
  // Steps already delegated this turn — guards against Core re-delegating the
  // SAME (agent + brief) repeatedly (a model not making progress), which would
  // replay the specialist's narration and read as the agent "repeating itself".
  const delegated = new Set<string>()

  for (let hop = 0; hop < MAX_COORDINATION_HOPS; hop++) {
    const resuming = hop > 0
    const decision = yield* engine.runCoreRouter(session, { resuming })

    if (decision.kind === 'answered') {
      // Core is done — it answered directly (greeting / clarification /
      // capability Q on hop 0) or, after the planned steps ran, judged the
      // request fully handled. `runCoreRouter` already committed any prose
      // (or closed silently when resuming).
      yield engine.emitDone(session)
      return
    }

    // decision.kind === 'route' — run EVERY planned step in order. A compound
    // request ("balance + swap + yield") arrives as several steps in ONE Core
    // response; running only the first is what dropped the swap/yield.
    let ranThisHop = 0
    for (const step of decision.steps) {
      // Loop guard: skip an identical step Core already ran this turn (a model
      // spinning rather than progressing) so we don't replay its narration.
      const stepKey = `${step.to}::${step.brief}`
      if (delegated.has(stepKey)) {
        logger.warn(`Skipping already-delegated step "${stepKey}"`)
        continue
      }
      delegated.add(stepKey)

      const config = getAgentConfig(step.to)
      if (!config || config.id === 'core') {
        // Should be unreachable — `decideCoreRoute` validates each target —
        // but never trust a model. Skip it (raw reason logged, CLAUDE.md).
        logger.warn(`Skipping unknown/invalid specialist "${step.to}"`)
        continue
      }

      ranThisHop++

      // Run the specialist step. Its narration + tool calls stream through; its
      // result is appended to `session.messages` so Core (and later steps) see
      // it. Swallow its terminal `done` — the turn isn't over until Core says.
      let specialistErrored = false
      for await (const ev of engine.runSpecialistTurn(
        session,
        config,
        step.brief,
      )) {
        if (ev.event === 'done') continue
        if (ev.event === 'error') specialistErrored = true
        yield ev
      }

      if (specialistErrored) {
        // A step failed and the client already received the `error` frame.
        // Don't continue the plan or re-enter Core on top of it — mirror the
        // prior single-hop behavior (an error frame is terminal; no `done`).
        return
      }
    }

    if (ranThisHop === 0) {
      // Core routed but every step was a duplicate/invalid — no progress to be
      // made by re-entering. Close the turn cleanly.
      yield engine.emitDone(session)
      return
    }
    // Otherwise loop: re-enter Core (resuming) to delegate any further step it
    // didn't include up front, or to end the turn.
  }

  // Hop cap reached — Core kept delegating without converging. Close the
  // turn cleanly; the specialists have already narrated their parts.
  logger.warn(
    `Orchestrator hit MAX_COORDINATION_HOPS (${MAX_COORDINATION_HOPS}) — finalizing turn`,
  )
  yield engine.emitDone(session)
}
