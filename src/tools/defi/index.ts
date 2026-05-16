/**
 * DeFi tool barrel — stub schemas matching `defi-strategies-spec.md` §11.
 *
 * Five tools ship in v1: `defi_list_opportunities`, `defi_list_positions`,
 * `defi_deposit`, `defi_withdraw`, `defi_rebalance`. The other three from
 * the DeFi spec (`defi_get_config`, `defi_simulate_deposit`, `defi_claim`)
 * land at flip time, not as stubs (the LLM doesn't need them while
 * DeFi is stubbed — Core's canned "coming soon" copy covers every code
 * path).
 *
 * Spec: docs/multi-agent-architecture-spec.md §12.
 */

import type { ToolMeta } from '../internal/types'
import { DEFI_OPPORTUNITY_TOOLS } from './opportunities'
import { DEFI_PROPOSE_TOOLS } from './propose'

export { DEFI_OPPORTUNITY_TOOLS } from './opportunities'
export { DEFI_PROPOSE_TOOLS } from './propose'

export const DEFI_TOOLS: Record<string, ToolMeta> = {
  ...DEFI_OPPORTUNITY_TOOLS,
  ...DEFI_PROPOSE_TOOLS,
}
