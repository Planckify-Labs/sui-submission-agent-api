/**
 * DeFi agent prompts.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12.
 *
 * v1: stubbed. The DeFi handler is pure — no LLM call, no narrative —
 * so this prompt is a v2 placeholder. It lands when the real DeFi
 * backend lands per `docs/defi-strategies-spec.md`.
 */

export const PROMPTS = {
  'defi.v1':
    // TODO(v2): replace with a real prompt once DeFi has a reasoning
    // path. v1 is canned payloads; this prompt is never used.
    'You are the DeFi specialist. v1 is stubbed — no LLM call. Placeholder for v2.',
}

export type PromptKey = keyof typeof PROMPTS
