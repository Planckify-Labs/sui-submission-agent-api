import { decideCoreRoute } from './engine'

describe('agents/engine decideCoreRoute', () => {
  const specialists = ['defi', 'wallet'] as const

  it('routes a valid core_handoff to a single step', () => {
    const decision = decideCoreRoute(
      [
        {
          toolName: 'core_handoff',
          input: { to: 'defi', brief: 'swap 2 SUI' },
        },
      ],
      specialists,
    )
    expect(decision).toEqual({
      kind: 'route',
      steps: [{ to: 'defi', brief: 'swap 2 SUI' }],
    })
  })

  // The regression this round targets: a compound request emits several
  // hand-offs in ONE response; every one must be kept, in order.
  it('collects MULTIPLE hand-offs into ordered steps', () => {
    const decision = decideCoreRoute(
      [
        {
          toolName: 'core_handoff',
          input: { to: 'wallet', brief: 'show balance' },
        },
        {
          toolName: 'core_handoff',
          input: { to: 'defi', brief: 'swap 1.1 SUI' },
        },
      ],
      specialists,
    )
    expect(decision).toEqual({
      kind: 'route',
      steps: [
        { to: 'wallet', brief: 'show balance' },
        { to: 'defi', brief: 'swap 1.1 SUI' },
      ],
    })
  })

  it('keeps valid steps and skips invalid targets', () => {
    const decision = decideCoreRoute(
      [
        { toolName: 'core_handoff', input: { to: 'ghost', brief: 'x' } },
        { toolName: 'core_handoff', input: { to: 'wallet', brief: 'balance' } },
      ],
      specialists,
    )
    expect(decision).toEqual({
      kind: 'route',
      steps: [{ to: 'wallet', brief: 'balance' }],
    })
  })

  it('treats an unknown-only specialist id as answered (no valid step)', () => {
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
    expect(decision).toEqual({
      kind: 'route',
      steps: [{ to: 'wallet', brief: '' }],
    })
  })
})
