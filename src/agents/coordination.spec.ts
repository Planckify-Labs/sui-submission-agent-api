import {
  buildCoreSystemPrompt,
  CORE_CONTINUATION_NOTE,
} from './core/systemPrompt'
import { SHARED_AGENT_RULES } from './sharedPrompt'

/**
 * Regression guards for the multi-agent COORDINATION copy. These are the
 * prompt rules that fixed the "wallet specialist answered/declined the swap
 * itself instead of Core delegating it to defi" + "agent repeats itself" bugs.
 * They are behavioral contracts, so pin the intent (not exact wording).
 */
describe('multi-agent coordination prompts', () => {
  describe('SHARED_AGENT_RULES — specialist lane discipline', () => {
    it('tells specialists to ignore out-of-domain parts', () => {
      expect(SHARED_AGENT_RULES).toMatch(/stay in your lane/i)
      expect(SHARED_AGENT_RULES).toMatch(/ignore/i)
    })

    it('forbids declining / suggesting external apps for out-of-domain work', () => {
      // A specialist saying "I can't swap, use Cetus" is the exact anti-pattern
      // that made Core think the swap was already handled.
      expect(SHARED_AGENT_RULES).toMatch(/do NOT .*decline/i)
      expect(SHARED_AGENT_RULES).toMatch(/can't|cannot|don't have a tool/i)
    })

    it('forbids announcing the hand-off / mentioning coordinators to the user', () => {
      // The wallet agent leaked "a coordinator will route those to the
      // appropriate specialists" — internal mechanics must stay hidden.
      expect(SHARED_AGENT_RULES).toMatch(/do NOT announce/i)
      expect(SHARED_AGENT_RULES).toMatch(/coordinator/i)
    })
  })

  describe('buildCoreSystemPrompt — compound decomposition', () => {
    const prompt = buildCoreSystemPrompt()

    it('instructs Core to decompose multi-part requests', () => {
      expect(prompt).toMatch(/decompose/i)
    })

    it('says the turn is not done until every part is handled by its specialist', () => {
      expect(prompt).toMatch(/not done until|every part/i)
    })

    it('treats a specialist\'s "can\'t" as NOT handled', () => {
      expect(prompt).toMatch(/can't.*(does NOT count|not .*handled)/i)
    })
  })

  describe('CORE_CONTINUATION_NOTE — resume routes remaining parts', () => {
    it('tells Core to route a remaining different-domain part (e.g. swap → defi)', () => {
      expect(CORE_CONTINUATION_NOTE).toMatch(/defi/i)
      expect(CORE_CONTINUATION_NOTE).toMatch(/remain/i)
    })

    it('ends the turn silently only when nothing remains', () => {
      expect(CORE_CONTINUATION_NOTE).toMatch(/END THE TURN/i)
      expect(CORE_CONTINUATION_NOTE).toMatch(/no hand-off and no text/i)
    })
  })
})
