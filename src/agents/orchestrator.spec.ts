import type { AgentEvent } from '../chat.events'
import type { Session } from '../session/types'
import type { AgentRuntimeConfig } from './agentConfig'
import type { CoreDecision, OrchestratorEngine } from './engine'
import { orchestrate } from './orchestrator'

const fakeSession = { id: 'sess-1' } as unknown as Session

/**
 * Fake engine: records which specialist (if any) ran, and lets each test
 * pin Core's decision. Mirrors the real `ChatService` engine surface so the
 * orchestrator flow can be tested without a model or a session machine.
 */
function fakeEngine(decision: CoreDecision): OrchestratorEngine & {
  ranSpecialist?: AgentRuntimeConfig
  ranBrief?: string
} {
  const engine: OrchestratorEngine & {
    ranSpecialist?: AgentRuntimeConfig
    ranBrief?: string
  } = {
    async *runCoreRouter(): AsyncGenerator<AgentEvent, CoreDecision> {
      yield { event: 'text_delta', data: { content: 'core says hi' } }
      return decision
    },
    async *runSpecialistTurn(_session, config, brief): AsyncGenerator<AgentEvent> {
      engine.ranSpecialist = config
      engine.ranBrief = brief
      yield { event: 'text_delta', data: { content: `ran ${config.id}` } }
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

describe('agents/orchestrator orchestrate', () => {
  it('on "answered", emits Core text then done — no specialist runs', async () => {
    const engine = fakeEngine({ kind: 'answered' })
    const events = await collect(orchestrate(fakeSession, engine))
    expect(events.map((e) => e.event)).toEqual(['text_delta', 'done'])
    expect(engine.ranSpecialist).toBeUndefined()
  })

  it('on a valid route, runs the named specialist with the brief', async () => {
    const engine = fakeEngine({ kind: 'route', to: 'defi', brief: 'swap 2 SUI' })
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ranSpecialist?.id).toBe('defi')
    expect(engine.ranBrief).toBe('swap 2 SUI')
    // Core text, then the specialist's text + its own done.
    expect(events.map((e) => e.event)).toEqual(['text_delta', 'text_delta', 'done'])
  })

  it('on a route to an unknown agent, fails soft (text + done), no specialist', async () => {
    const engine = fakeEngine({
      kind: 'route',
      to: 'ghost' as never,
      brief: 'x',
    })
    const events = await collect(orchestrate(fakeSession, engine))
    expect(engine.ranSpecialist).toBeUndefined()
    expect(events.at(-1)?.event).toBe('done')
    expect(events.some((e) => e.event === 'text_delta')).toBe(true)
  })
})
