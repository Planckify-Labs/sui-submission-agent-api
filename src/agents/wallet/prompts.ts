/**
 * Wallet agent prompts.
 *
 * Spec: docs/multi-agent-architecture-spec.md §11.3.
 *
 * v1 path: the Wallet handler is a thin tool router — NO separate LLM
 * call. The system prompt is a v2 placeholder; it lands when Wallet
 * grows a reasoning path (e.g. multi-step transfer planning).
 *
 * If a future change adds an LLM call inside the Wallet handler,
 * update the prompt here and the §11.3 cost-budget comment in
 * `handler.ts`.
 */

export const PROMPTS = {
  'wallet.v1':
    // TODO(v2): replace with a real prompt once Wallet has a reasoning
    // path. v1 is pure dispatch — no LLM call, so this placeholder is
    // never used at runtime.
    'You are the Wallet specialist. v1 is pure tool dispatch; this prompt is a v2 placeholder.',
}

export type PromptKey = keyof typeof PROMPTS
