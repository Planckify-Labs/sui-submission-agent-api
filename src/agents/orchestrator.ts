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
 * Two guards keep a non-converging model from spinning: each specialist runs
 * AT MOST once per user turn (a re-delegation to an already-run specialist on a
 * later hop is skipped — `ranInPriorHop`), and the whole loop is hard-bounded
 * by `MAX_COORDINATION_HOPS`. The per-specialist guard is what stops the "agent
 * repeats the same message over and over" symptom when Core keeps re-handing a
 * step the specialist already answered (e.g. a swap it couldn't complete for
 * insufficient balance) with reworded briefs. Exactly ONE terminal `done` is
 * emitted, at the end — a specialist's own `done` is swallowed mid-turn because
 * the turn isn't over until Core says so.
 *
 * This module is intentionally machinery-free: it yields the SAME
 * `AgentEvent` union the mobile app already consumes, and delegates all
 * turn execution to the injected `OrchestratorEngine` (implemented by
 * `ChatService`). That keeps the wire protocol byte-identical and makes
 * the coordination logic unit-testable with a fake engine.
 */

import { Logger } from '@nestjs/common'
import type { AgentEvent } from '../chat.events'
import type { Session, WalletContext } from '../session/types'
import { getAgentConfig } from './agentConfig'
import type { OrchestratorEngine, StepResult } from './engine'
import type { AgentId } from './types'

/** Cap a step summary fed to Core — it's a routing digest, not a transcript. */
const MAX_SUMMARY_CHARS = 400

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

  // Specialists that already had a full turn in a PRIOR hop. The cross-hop
  // re-delegation guard: once a specialist has run and replied, Core must not
  // be allowed to re-delegate the SAME domain to it on a later resume hop.
  // The exact-string `delegated` guard above only catches a verbatim repeat;
  // when Core re-words the brief ("preview a smaller swap" → "preview a swap"
  // → "preview a 10 SUI swap") on each resume — which CORE_CONTINUATION_NOTE
  // actively invites when a specialist legitimately COULDN'T complete (e.g.
  // insufficient balance) — the reworded steps slip past it and the specialist
  // replays its narration every hop, up to MAX_COORDINATION_HOPS. That is the
  // exact "agent repeats the same message over and over" symptom. One turn per
  // specialist per user turn kills it deterministically; a specialist that
  // already asked the user a follow-up question is DONE — its question stands.
  const ranInPriorHop = new Set<AgentId>()

  // Structured Core⇄specialist channel. `turnStartIndex` is the message count
  // at turn start, so Core is shown only history + the user's request — never
  // this turn's specialist prose/tool-results. `ledger` is the typed record of
  // each completed step that Core routes from INSTEAD of re-reading narration.
  const turnStartIndex = session.messages.length
  const ledger: StepResult[] = []

  for (let hop = 0; hop < MAX_COORDINATION_HOPS; hop++) {
    const resuming = hop > 0
    const decision = yield* engine.runCoreRouter(session, {
      resuming,
      turnStartIndex,
      ledger,
    })

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
    const ranThisHopIds: AgentId[] = []
    for (const step of decision.steps) {
      // Cross-hop loop guard (see `ranInPriorHop` above): a specialist that
      // already ran in an earlier hop is not re-delegated, regardless of how
      // the brief is worded. Same-hop duplicates to one specialist are still
      // allowed (Core may legitimately split same-domain work in one response)
      // — `ranInPriorHop` is only updated AFTER the hop completes.
      if (ranInPriorHop.has(step.to)) {
        logger.warn(
          `Skipping re-delegation to already-run specialist "${step.to}"`,
        )
        continue
      }
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
      ranThisHopIds.push(step.to)

      // Run the specialist step. Its narration + tool calls stream through; its
      // result is appended to `session.messages` so Core (and later steps) see
      // it. Swallow its terminal `done` — the turn isn't over until Core says.
      // We also capture the specialist's user-facing text into `summary` so the
      // structured ledger (not the raw transcript) is what Core routes from.
      let specialistErrored = false
      let summary = ''
      for await (const ev of engine.runSpecialistTurn(
        session,
        config,
        step.brief,
      )) {
        if (ev.event === 'done') continue
        if (ev.event === 'error') specialistErrored = true
        if (ev.event === 'text_delta' && summary.length < MAX_SUMMARY_CHARS) {
          summary += (ev.data as { content?: string }).content ?? ''
        }
        if (ev.event === 'tool_pending') {
          // §9 wallet-context isolation: forward the turn's wallet_context
          // verbatim on every tool-call envelope so the mobile executor
          // signs against the wallet that initiated the turn, never the
          // home-screen active wallet.
          const wallet_context: WalletContext = session.wallet_context
          yield { ...ev, data: { ...ev.data, wallet_context } }
          continue
        }
        yield ev
      }

      // Record the structured step result Core will route from on the next hop.
      ledger.push({
        to: step.to,
        brief: step.brief,
        status: specialistErrored ? 'failed' : 'ran',
        summary: summary.trim().slice(0, MAX_SUMMARY_CHARS),
      })

      if (specialistErrored) {
        // A step failed and the client already received the `error` frame.
        // Don't continue the plan or re-enter Core on top of it — mirror the
        // prior single-hop behavior (an error frame is terminal; no `done`).
        return
      }
    }

    if (ranThisHop === 0) {
      // Core routed but every step was a duplicate/already-run/invalid — no
      // progress to be made by re-entering. Close the turn cleanly.
      yield engine.emitDone(session)
      return
    }

    // Mark every specialist that ran THIS hop as spent so a later resume hop
    // can't re-delegate the same domain (the re-narration loop). Done after the
    // hop so same-hop splits to one specialist were allowed to run above.
    for (const id of ranThisHopIds) ranInPriorHop.add(id)

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
