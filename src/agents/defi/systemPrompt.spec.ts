import { DEFI_SYSTEM_PROMPT } from './systemPrompt'

/**
 * Regression guard for the swap-hallucination incident, now owned by the
 * DeFi agent (it owns the swap tools, so this is the prompt the model reads
 * when it runs a swap). The agent claimed a swap executed after calling only
 * `defi_intent_preview` (a read that signs nothing / moves no funds) and
 * never calling `defi_intent_execute` — no approval sheet, no funds moved,
 * yet a false "done". These assertions keep the guardrails from regressing.
 */
describe('agents/defi systemPrompt — swap honesty + two-step flow', () => {
  it('describes the two-step preview→execute flow', () => {
    expect(DEFI_SYSTEM_PROMPT).toContain('defi_intent_preview')
    expect(DEFI_SYSTEM_PROMPT).toContain('defi_intent_execute')
    expect(DEFI_SYSTEM_PROMPT).toMatch(/signs?\s+NOTHING/i)
    expect(DEFI_SYSTEM_PROMPT).toMatch(/moves?\s+NO funds/i)
    expect(DEFI_SYSTEM_PROMPT).toMatch(/MUST call .?defi_intent_execute/i)
  })

  it('forbids claiming success without an execute result', () => {
    expect(DEFI_SYSTEM_PROMPT).toContain('On-chain execution honesty')
    for (const word of ['executed', 'broadcast', 'successful']) {
      expect(DEFI_SYSTEM_PROMPT.toLowerCase()).toContain(word)
    }
    expect(DEFI_SYSTEM_PROMPT).toMatch(/digest/i)
  })

  it('includes the shared cross-cutting rules', () => {
    expect(DEFI_SYSTEM_PROMPT).toContain('### Privacy')
    expect(DEFI_SYSTEM_PROMPT).toContain('### Honesty')
  })
})
