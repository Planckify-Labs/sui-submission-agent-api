/**
 * DeFi handler — STUB v1.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12,
 *       docs/defi-strategies-spec.md §11.
 *
 * Pure switch on `tool_name`. NO LLM call. NO `tool_pending` emission
 * (the mobile DeFi stubs at `services/agent-executors/defi/stub.ts`
 * own the response shape; the server handler exists only because the
 * spec's topology requires every agent to have a handler — when the
 * real DeFi backend lands this is where the LLM + adapter logic goes).
 *
 * `status: "stubbed"` strings are SENTINELS. Core's prompt
 * (`agents/core/prompts.ts`) paraphrases them into friendly copy.
 * Mobile never renders them verbatim (CLAUDE.md user-facing-error
 * rule).
 *
 * Flip path: when `docs/defi-strategies-spec.md` is implemented,
 * replace this function with the real adapter-routing logic. The
 * card's `status` flips from `stub` to `ready`, the mobile stub
 * executors are replaced. Nothing else in the topology changes.
 */

import type { AgentTask } from '../types'

const STUB_MESSAGE = 'DeFi agent is not yet wired up.'

/**
 * Three-row sample. Must stay in lockstep with
 * `services/agent-executors/defi/stub.ts` — the mobile stub returns
 * these to the LLM (via `tool_result.data`), and Core's prompt
 * paraphrases. If you edit one, edit the other.
 */
const FIXED_OPPORTUNITIES = [
  {
    id: 'stub-aave-base-usdc',
    protocol_slug: 'aave-v3-base',
    chain_id: 8453,
    asset_symbol: 'USDC',
    apy: 0.045,
    risk_tier: 'conservative' as const,
  },
  {
    id: 'stub-morpho-base-eth',
    protocol_slug: 'morpho-base',
    chain_id: 8453,
    asset_symbol: 'ETH',
    apy: 0.061,
    risk_tier: 'balanced' as const,
  },
  {
    id: 'stub-pendle-arb-usdt',
    protocol_slug: 'pendle-arb',
    chain_id: 42161,
    asset_symbol: 'USDT',
    apy: 0.092,
    risk_tier: 'aggressive' as const,
  },
]

export interface DefiDispatch {
  tool_name: string
}

export interface HandleDefiTaskParams {
  task: AgentTask
  dispatch: DefiDispatch
}

export interface DefiTaskResult {
  output: unknown
}

export function handleDefiTask(
  params: HandleDefiTaskParams,
): DefiTaskResult {
  switch (params.dispatch.tool_name) {
    case 'defi_list_opportunities':
      return { output: { opportunities: FIXED_OPPORTUNITIES } }
    case 'defi_list_positions':
      return { output: { positions: [] } }
    case 'defi_deposit':
    case 'defi_withdraw':
    case 'defi_rebalance':
      return { output: { status: 'stubbed', message: STUB_MESSAGE } }
    default:
      // Unknown defi_* tool — same friendly sentinel so Core paraphrases.
      return { output: { status: 'stubbed', message: STUB_MESSAGE } }
  }
}
