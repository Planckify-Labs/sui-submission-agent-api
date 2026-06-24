import type { AgentEvent } from '../chat.events'
import type { Session } from '../session/types'
import type {
  CoreDecision,
  CoreStep,
  OrchestratorEngine,
  StepResult,
} from './engine'
import { MAX_COORDINATION_HOPS, orchestrate } from './orchestrator'

const fakeSession = { id: 'sess-1', messages: [] } as unknown as Session

/** Build a route decision from one or more steps. */
const route = (
  ...steps: Array<{ to: string; brief: string }>
): CoreDecision => ({
  kind: 'route',
  steps: steps as CoreStep[],
})

type RecordingEngine = OrchestratorEngine & {
  ran: string[]
  briefs: string[]
  coreCalls: Array<{ resuming: boolean; ledger: readonly StepResult[] }>
}

/**
 * Fake engine driven by a SCRIPT of Core decisions — one per Core call.
 * Mirrors the real `ChatService` engine surface so the coordination flow can
 * be tested without a model or a session machine.
 *
 * - `runCoreRouter` pops the next scripted decision. It emits prose only when
 *   answering the user directly on the first hop (a route just commits the
 *   hand-off; a silent resume closes with no text) — matching the real engine.
 * - `runSpecialistTurn` records the run and emits its OWN `done`, which the
 *   orchestrator must swallow so exactly one terminal `done` reaches mobile.
 */
function fakeEngine(decisions: CoreDecision[]): RecordingEngine {
  let i = 0
  const engine: RecordingEngine = {
    ran: [],
    briefs: [],
    coreCalls: [],
    async *runCoreRouter(
      _session,
      options,
    ): AsyncGenerator<AgentEvent, CoreDecision> {
      const resuming = options?.resuming === true
      // Snapshot the ledger so tests can assert the structured channel Core
      // receives (clone — the orchestrator keeps mutating the same array).
      engine.coreCalls.push({ resuming, ledger: [...(options?.ledger ?? [])] })
      const decision: CoreDecision = decisions[i++] ?? { kind: 'answered' }
      if (decision.kind === 'answered' && !resuming) {
        yield { event: 'text_delta', data: { content: 'core answer' } }
      }
      return decision
    },
    async *runSpecialistTurn(
      _session,
      config,
      brief,
    ): AsyncGenerator<AgentEvent> {
      engine.ran.push(config.id)
      engine.briefs.push(brief)
      yield { event: 'text_delta', data: { content: `ran ${config.id}` } }
      // The orchestrator must drop this mid-turn done.
      yield engine.emitDone(fakeSession)
    },
    emitDone(session): AgentEvent {
      return { event: 'done', data: { session_id: session.id } }
    },
  }
  return engine
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

const doneCount = (events: AgentEvent[]): number =>
  events.filter((e) => e.event === 'done').length

describe('agents/orchestrator orchestrate (multi-agent coordination)', () => {
  it('Core answers directly — no specialist, just text then done', async () => {
    const engine = fakeEngine([{ kind: 'answered' }])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual([])
    expect(events.map((e) => e.event)).toEqual(['text_delta', 'done'])
  })

  it('delegates one step to the named specialist with its brief, then ends', async () => {
    const engine = fakeEngine([route({ to: 'defi', brief: 'swap 2 SUI' })])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['defi'])
    expect(engine.briefs).toEqual(['swap 2 SUI'])
    expect(doneCount(events)).toBe(1)
    expect(events.at(-1)?.event).toBe('done')
  })

  // THE regression: a compound request emits BOTH hand-offs in ONE Core
  // response. Both must run, in order — the old code kept only the first, which
  // is how the swap/yield part silently vanished.
  it('runs every step of a multi-step decision, in order', async () => {
    const engine = fakeEngine([
      route(
        { to: 'wallet', brief: 'show points, balance, products' },
        { to: 'defi', brief: 'swap 1.1 SUI to USDC then earn yield' },
      ),
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['wallet', 'defi'])
    expect(engine.briefs).toEqual([
      'show points, balance, products',
      'swap 1.1 SUI to USDC then earn yield',
    ])
    expect(doneCount(events)).toBe(1)
  })

  // Belt-and-suspenders: a model that delegates one step at a time still gets
  // both done because Core is re-entered (resuming) after the first.
  it('coordinates two specialists across resume hops (wallet → defi → done)', async () => {
    const engine = fakeEngine([
      route({ to: 'wallet', brief: 'show SUI balance' }),
      route({ to: 'defi', brief: 'swap 5 SUI to USDC' }),
      { kind: 'answered' },
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['wallet', 'defi'])
    expect(engine.coreCalls.map((c) => c.resuming)).toEqual([false, true, true])
    expect(doneCount(events)).toBe(1)
  })

  it("emits exactly one terminal done — a specialist's own done is swallowed", async () => {
    const engine = fakeEngine([
      route({ to: 'wallet', brief: 'b' }),
      { kind: 'answered' },
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(doneCount(events)).toBe(1)
    expect(events.at(-1)?.event).toBe('done')
  })

  it('skips an invalid step but still runs the valid ones', async () => {
    const engine = fakeEngine([
      route({ to: 'ghost', brief: 'x' }, { to: 'wallet', brief: 'balance' }),
      { kind: 'answered' },
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['wallet'])
    expect(events.at(-1)?.event).toBe('done')
  })

  it('a route with only invalid steps ends cleanly without running anything', async () => {
    const engine = fakeEngine([route({ to: 'ghost', brief: 'x' })])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual([])
    expect(events.at(-1)?.event).toBe('done')
  })

  // THE "agent repeats the same message over and over" regression. Core keeps
  // re-handing the SAME domain to the SAME specialist with a REWORDED brief each
  // resume hop — exactly what CORE_CONTINUATION_NOTE invites when the specialist
  // legitimately couldn't complete (insufficient balance) and ended by asking a
  // question. The exact-string dedupe can't catch a reword; the per-specialist
  // cross-hop guard runs it once and finalizes. We script far MORE hops than
  // MAX_COORDINATION_HOPS to prove the guard (not the hop cap) is what bounds it.
  it('runs each specialist at most once per turn — reworded re-delegation is skipped', async () => {
    const engine = fakeEngine(
      Array.from({ length: MAX_COORDINATION_HOPS + 6 }, (_, n) =>
        route({ to: 'defi', brief: `preview swap, attempt ${n}` }),
      ),
    )
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['defi'])
    expect(doneCount(events)).toBe(1)
    expect(events.at(-1)?.event).toBe('done')
  })

  // Guards the "agent repeats itself" symptom: an identical re-delegated step
  // must NOT replay the specialist's narration.
  it('runs an identical step only once across hops', async () => {
    const engine = fakeEngine([
      route({ to: 'defi', brief: 'swap 5 SUI to USDC' }),
      route({ to: 'defi', brief: 'swap 5 SUI to USDC' }),
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['defi'])
    expect(doneCount(events)).toBe(1)
    expect(events.at(-1)?.event).toBe('done')
  })

  // The cross-hop guard must NOT clobber legitimate same-domain splits that
  // arrive in ONE Core response (e.g. two sends). `ranInPriorHop` is only
  // updated AFTER a hop, so both steps in the initial batch still run.
  it('runs same-specialist steps that share ONE hop (multi-step decomposition)', async () => {
    const engine = fakeEngine([
      route(
        { to: 'wallet', brief: 'send 1 USDC to Alice' },
        { to: 'wallet', brief: 'send 2 USDC to Bob' },
      ),
      { kind: 'answered' },
    ])
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ran).toEqual(['wallet', 'wallet'])
    expect(doneCount(events)).toBe(1)
  })

  it('feeds Core a STRUCTURED step ledger on resume (not raw prose)', async () => {
    // After the wallet step runs, Core is re-entered. The resume call must
    // receive a typed ledger entry for that step — this is the structured
    // channel that replaces Core re-reading the specialist's narration.
    const engine = fakeEngine([
      route({ to: 'wallet', brief: 'show points' }),
      { kind: 'answered' },
    ])
    await collect(orchestrate(fakeSession, engine))

    expect(engine.coreCalls.map((c) => c.resuming)).toEqual([false, true])
    // Hop 0 (fresh) sees an empty ledger; the resume hop sees the wallet step.
    expect(engine.coreCalls[0].ledger).toEqual([])
    expect(engine.coreCalls[1].ledger).toEqual([
      {
        to: 'wallet',
        brief: 'show points',
        status: 'ran',
        summary: 'ran wallet',
      },
    ])
  })

  it('stamps wallet_context (§9) on every tool_pending forwarded from a specialist', async () => {
    const wallet_context = {
      address: '0xabc',
      namespace: 'eip155' as const,
      chain_id: 8453,
      chain_name: 'Base',
      chain_symbol: 'ETH',
    }
    const session = {
      id: 'sess-1',
      wallet_context,
      messages: [],
    } as unknown as Session

    // The specialist emits a tool_pending WITHOUT wallet_context; the
    // orchestrator must stamp the turn's session.wallet_context onto it.
    const base = fakeEngine([route({ to: 'wallet', brief: 'send 1 USDC' })])
    const engine: RecordingEngine = {
      ...base,
      async *runSpecialistTurn(_session, config, brief) {
        base.ran.push(config.id)
        base.briefs.push(brief)
        yield {
          event: 'tool_pending',
          data: {
            session_id: session.id,
            tool_call_id: 'tc-1',
            name: 'wallet_send',
            input: {},
            meta: {
              executor: 'mobile',
              capability: 'sign_and_send',
              category: 'write',
              human_summary: 'Send 1 USDC',
            },
          },
        } as unknown as AgentEvent
        yield base.emitDone(session)
      },
    }

    const events = await collect(orchestrate(session, engine))
    const pending = events.filter(
      (e): e is Extract<AgentEvent, { event: 'tool_pending' }> =>
        e.event === 'tool_pending',
    )
    expect(pending).toHaveLength(1)
    expect(pending[0].data.wallet_context).toEqual(wallet_context)
  })
})
