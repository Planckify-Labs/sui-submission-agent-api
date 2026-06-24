/**
 * Deterministic machinery-leak filter — a STRUCTURAL backstop to the prompt
 * rules in `sharedPrompt.ts` ("never reveal the machinery").
 *
 * The specialist's narration is a single dual-purpose string: it streams to
 * the user AND lands in the shared transcript Core re-reads. So when Kimi-K2
 * disobeys the prompt and says "a specialist will assist you with those" or
 * "those are handled separately" (the exact leak seen in the wild), nothing
 * structural catches it — the leak reaches both the user and Core's context.
 *
 * This module drops any SENTENCE that contains a forbidden machinery phrase,
 * before the text is emitted to the client and before it is stored in
 * `session.messages`. It is intentionally conservative: it removes whole
 * sentences (never mangles a clause mid-way) and leaves everything else byte-
 * identical, so a clean reply is never altered.
 *
 * It is a backstop, not the primary defence — the prompt is still the first
 * line — but a deterministic filter cannot be argued out of by the model.
 */

/**
 * Sentence-level deny patterns. Each matches the internal-machinery language
 * the specialists are forbidden (`sharedPrompt.ts:16-21`) from using. Scoped
 * to phrases that are essentially always a leak in a wallet/DeFi chat, to keep
 * false positives near zero.
 */
const LEAK_PATTERNS: readonly RegExp[] = [
  // "I'm a wallet specialist", "a DeFi specialist", "another specialist", …
  /\bspecialists?\b/i,
  // "a coordinator will route this"
  /\bcoordinators?\b/i,
  // "that will be routed", "routed to the right place", "routed separately"
  /\b(?:will be|being|gets?|get)\s+routed\b/i,
  /\brouted\s+(?:to|separately|elsewhere)\b/i,
  // "those are handled separately", "handled elsewhere", "handled by another"
  /\bhandled\s+(?:separately|elsewhere|by another)\b/i,
  // "another tool / app / service / DEX / protocol / assistant / agent"
  /\b(?:another|a different|the right)\s+(?:agent|assistant|tool|app|service|dex|protocol)\b/i,
  // "you'll need a DEX / a swap service / another app"
  /\byou'?ll need (?:a|an|another)\b/i,
]

function isLeak(sentence: string): boolean {
  return LEAK_PATTERNS.some((re) => re.test(sentence))
}

/**
 * Remove every sentence that contains a machinery-leak phrase. Returns the
 * input UNCHANGED (same reference semantics) when nothing matched, so a clean
 * reply keeps its exact formatting; only a leak-containing reply is rewritten
 * (and then lightly tidied for the whitespace a dropped sentence leaves).
 *
 * "Sentence" = a run ending at `.`/`!`/`?` (one or more) or a newline, which is
 * coarse but right for the prose these leaks appear in.
 */
export function stripMachineryLeak(text: string): string {
  if (!text) return text
  const segments = text.match(/[^.!?\n]*(?:[.!?]+|\n|$)/g)
  if (!segments) return text
  let changed = false
  const kept = segments.filter((seg) => {
    if (seg.length > 0 && isLeak(seg)) {
      changed = true
      return false
    }
    return true
  })
  if (!changed) return text
  return kept
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Per-TURN streaming sanitizer: machinery-leak filter + repetition guard, both
 * applied SEGMENT-by-segment (a segment = text up to the next `.`/`!`/`?`/`\n`).
 *
 * Why segment-level: a segment is held until complete, so (a) a leak sentence is
 * always evaluated whole — never split across two emits — and (b) a repeated
 * line is compared whole, so the repeat is dropped BEFORE any of it is emitted
 * (a char-level guard leaks the partial opening line of the repeat before it can
 * confirm the match).
 *
 * Repetition: Kimi-K2 sometimes degenerates into re-emitting its whole reply
 * (often after calling a tool several times) — the user sees the same block
 * twice, byte-identical. We remember the FIRST substantial segment as the reply
 * "anchor"; the moment that exact line reappears we know the model is restarting
 * its answer, so we suppress it and everything after (`stopped` flips true so
 * the loop finalizes the turn). Only the FIRST line is the anchor, so lines that
 * legitimately recur inside one reply (e.g. "Tier: Konservatif | Score: 88" per
 * item) never trip it. State persists for the whole turn, so a re-narration
 * split across two model steps is caught too.
 */
const ANCHOR_MIN_LEN = 24
const MAX_SEGMENT_BUFFER = 2000

export class StreamSanitizer {
  private buffer = ''
  private anchor: string | null = null
  private stoppedFlag = false

  /** True once a reply restart was detected — caller should finalize the turn. */
  get stopped(): boolean {
    return this.stoppedFlag
  }

  /** Feed a chunk; return the sanitized text safe to emit now. */
  push(chunk: string): string {
    if (this.stoppedFlag) return ''
    this.buffer += chunk
    let out = ''
    let idx = this.buffer.search(/[.!?\n]/)
    while (idx !== -1) {
      const seg = this.buffer.slice(0, idx + 1)
      this.buffer = this.buffer.slice(idx + 1)
      out += this.consume(seg)
      if (this.stoppedFlag) {
        this.buffer = ''
        return out
      }
      idx = this.buffer.search(/[.!?\n]/)
    }
    // Bound the buffer so a runaway stream with no punctuation can't grow
    // without limit (mirrors the MAX_ASSISTANT_CHARS OOM guard).
    if (this.buffer.length >= MAX_SEGMENT_BUFFER) {
      const flushed = this.buffer
      this.buffer = ''
      out += this.consume(flushed)
    }
    return out
  }

  /**
   * Flush the trailing partial segment at the end of a model step. Anchor /
   * stopped state is KEPT so the next step in the same turn is still guarded.
   */
  endStep(): string {
    if (this.stoppedFlag) {
      this.buffer = ''
      return ''
    }
    const seg = this.buffer
    this.buffer = ''
    return seg ? this.consume(seg) : ''
  }

  private consume(seg: string): string {
    // Leak filter first — a leaked sentence is dropped entirely.
    const cleaned = stripMachineryLeak(seg)
    const norm = cleaned.trim()
    if (norm.length >= ANCHOR_MIN_LEN) {
      if (this.anchor === null) {
        this.anchor = norm
      } else if (norm === this.anchor) {
        // The reply's opening line reappeared → the model is restarting.
        this.stoppedFlag = true
        return ''
      }
    }
    return cleaned
  }
}
