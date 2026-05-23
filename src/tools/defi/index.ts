/**
 * DeFi tool barrel — registers the canonical set from
 * `defi-strategies-spec.md` §11.
 *
 * Eight tools ship in v1:
 *   reads     — defi_list_opportunities, defi_list_positions, defi_get_config
 *   simulate  — defi_simulate_deposit
 *   writes    — defi_deposit, defi_withdraw, defi_claim, defi_rebalance,
 *               defi_cross_chain_deposit
 *
 * Mobile executors live under `services/agent-executors/defi/`.
 * The `executor: "mobile"` discipline means the agent-api emits
 * `tool_pending` and mobile runs the real call against the device's
 * signer + the `/strategies/*` REST surface.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12.
 */

import type { ToolMeta } from '../internal/types'
import { DEFI_CLAIM_TOOLS } from './claim'
import { DEFI_OPPORTUNITY_TOOLS } from './opportunities'
import { DEFI_PROPOSE_TOOLS } from './propose'
import { DEFI_CONFIG_TOOLS } from './reads-extra'
import { DEFI_SIMULATE_TOOLS } from './simulate'

export { DEFI_OPPORTUNITY_TOOLS } from './opportunities'
export { DEFI_PROPOSE_TOOLS } from './propose'
export { DEFI_CONFIG_TOOLS } from './reads-extra'
export { DEFI_SIMULATE_TOOLS } from './simulate'
export { DEFI_CLAIM_TOOLS } from './claim'

export const DEFI_TOOLS: Record<string, ToolMeta> = {
  ...DEFI_OPPORTUNITY_TOOLS,
  ...DEFI_CONFIG_TOOLS,
  ...DEFI_SIMULATE_TOOLS,
  ...DEFI_PROPOSE_TOOLS,
  ...DEFI_CLAIM_TOOLS,
}
