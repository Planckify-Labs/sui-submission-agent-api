import { decideCoreRoute } from './engine'

describe('agents/engine decideCoreRoute', () => {
  const specialists = ['defi', 'wallet'] as const

  it('routes a valid core_handoff to the named specialist', () => {
    const decision = decideCoreRoute(
      [{ toolName: 'core_handoff', input: { to: 'defi', brief: 'swap 2 SUI' } }],
      specialists,
    )
    expect(decision).toEqual({ kind: 'route', to: 'defi', brief: 'swap 2 SUI' })
  })

  it('treats an unknown specialist id as answered (no route)', () => {
    const decision = decideCoreRoute(
      [{ toolName: 'core_handoff', input: { to: 'ghost', brief: 'x' } }],
      specialists,
    )
    expect(decision.kind).toBe('answered')
  })

  it('treats core_clarify as answered', () => {
    const decision = decideCoreRoute(
      [{ toolName: 'core_clarify', input: { question: 'which token?' } }],
      specialists,
    )
    expect(decision.kind).toBe('answered')
  })

  it('treats no tool calls as answered', () => {
    expect(decideCoreRoute([], specialists).kind).toBe('answered')
  })

  it('defaults a missing brief to an empty string', () => {
    const decision = decideCoreRoute(
      [{ toolName: 'core_handoff', input: { to: 'wallet' } }],
      specialists,
    )
    expect(decision).toEqual({ kind: 'route', to: 'wallet', brief: '' })
  })
})
