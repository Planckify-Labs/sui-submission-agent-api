import { StreamSanitizer, stripMachineryLeak } from './leakFilter'

describe('stripMachineryLeak', () => {
  it('drops the exact in-the-wild leak (handled separately + a specialist)', () => {
    const input =
      'For the other parts of your message (swapping SUI to USDC and earning ' +
      'yield), those are handled separately. A specialist will assist you with ' +
      'those.'
    expect(stripMachineryLeak(input).trim()).toBe('')
  })

  it('drops only the leaking sentence, keeps the rest verbatim', () => {
    const input =
      'You have 13.93 SUI and 1.07 USDC. A specialist will assist you with the swap.'
    expect(stripMachineryLeak(input).trim()).toBe(
      'You have 13.93 SUI and 1.07 USDC.',
    )
  })

  it('catches the routing / coordinator phrasings', () => {
    expect(
      stripMachineryLeak('That will be routed to the right place.').trim(),
    ).toBe('')
    expect(
      stripMachineryLeak('A coordinator will handle the rest.').trim(),
    ).toBe('')
    expect(stripMachineryLeak("You'll need a DEX for that swap.").trim()).toBe(
      '',
    )
    expect(stripMachineryLeak('I can route that to another tool.').trim()).toBe(
      '',
    )
  })

  it('returns clean text UNCHANGED (same reference) — no false positives', () => {
    const clean = 'Aave v3 on Ethereum offers ~3.14% APY. Want me to proceed?'
    expect(stripMachineryLeak(clean)).toBe(clean)
  })

  it('does not trip on lookalike words (specialized / speciality)', () => {
    const clean = 'This pool is specialized for stablecoins.'
    expect(stripMachineryLeak(clean)).toBe(clean)
  })

  it('is a no-op on empty input', () => {
    expect(stripMachineryLeak('')).toBe('')
  })
})

describe('StreamSanitizer — leak filtering (streamed)', () => {
  it('filters a leak sentence split across several chunks', () => {
    const f = new StreamSanitizer()
    let out = ''
    // The leak is fragmented across chunk boundaries — it must still be caught
    // because emission is held back to the sentence terminator.
    out += f.push('You have 5 SUI. A speci')
    out += f.push('alist will assist ')
    out += f.push('you with the swap.')
    out += f.endStep()
    expect(out.trim()).toBe('You have 5 SUI.')
  })

  it('passes clean streamed text through (across chunks)', () => {
    const f = new StreamSanitizer()
    let out = ''
    out += f.push('Your swap is ')
    out += f.push('ready to preview.')
    out += f.endStep()
    expect(out).toBe('Your swap is ready to preview.')
  })

  it('flushes a trailing segment with no terminator', () => {
    const f = new StreamSanitizer()
    let out = ''
    out += f.push('No period here')
    out += f.endStep()
    expect(out).toBe('No period here')
  })
})

describe('StreamSanitizer — repetition guard', () => {
  const ANSWER =
    'Berikut 3 rekomendasi produk DeFi untuk yield pasif:\n' +
    '1. Fluid Lending (USDT) — Ethereum, APY 5.22%, TVL $111 juta.\n' +
    '2. Marinade Liquid Staking (mSOL) — Solana, APY 6.98%.\n' +
    'Semua tanpa IL. Mau mulai dari yang mana?'

  it('passes a single answer through unchanged', () => {
    const g = new StreamSanitizer()
    const out = g.push(ANSWER) + g.endStep()
    expect(out).toBe(ANSWER)
    expect(g.stopped).toBe(false)
  })

  it('cuts off the moment the model restarts its answer (the bug)', () => {
    const g = new StreamSanitizer()
    let out = ''
    out += g.push(ANSWER) // first, full answer
    out += g.push(ANSWER) // model regurgitates it — must be suppressed
    out += g.push('1. Fluid Lending again...\n') // trailing repeat — also gone
    out += g.endStep()
    expect(out.trimEnd()).toBe(ANSWER)
    expect(g.stopped).toBe(true)
  })

  it('catches a restart that arrives chunked across pushes', () => {
    const g = new StreamSanitizer()
    let out = ''
    out += g.push(ANSWER)
    // The restart streams in pieces — the opening line reassembles in-buffer
    // and is only emitted (here, dropped) once the whole segment is complete,
    // so NONE of the repeat leaks.
    out += g.push('\nBerikut 3 rekomendasi produk DeFi ')
    out += g.push('untuk yield pasif:\n1. Fluid Lending...\n')
    out += g.endStep()
    expect(out.trimEnd()).toBe(ANSWER)
    expect(g.stopped).toBe(true)
  })

  it('does NOT trip on a line that legitimately recurs within one reply', () => {
    const g = new StreamSanitizer()
    const reply =
      'Here are three options for you to consider today:\n' +
      'Aave — Tier: Konservatif | Score: 88\n' +
      'Fluid — Tier: Konservatif | Score: 88\n' +
      'Centrifuge — Tier: Konservatif | Score: 88\n'
    const out = g.push(reply) + g.endStep()
    expect(out).toBe(reply)
    expect(g.stopped).toBe(false)
  })

  it('does not false-trip on a short reply', () => {
    const g = new StreamSanitizer()
    const out =
      g.push('Done — your balance is 9 SUI. Anything else?') + g.endStep()
    expect(out).toBe('Done — your balance is 9 SUI. Anything else?')
    expect(g.stopped).toBe(false)
  })
})
